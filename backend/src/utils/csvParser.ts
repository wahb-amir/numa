import { createHash } from "crypto";
import { parse } from "csv-parse";
import { logger } from "./logger";

/**
 * Phases that a CSV parsing failure can be attributed to. Surfaced via
 * CsvParserError.phase so the upload worker can produce a clear user-friendly
 * message instead of a generic "parsing failed".
 */
export type CsvParserPhase =
  | "EMPTY_FILE"
  | "MISSING_HEADER"
  | "INVALID_HEADER"
  | "NO_DATA_ROWS";

/**
 * Custom error type so callers (the upload worker) can branch on .phase
 * without relying on string-matching error messages.
 */
export class CsvParserError extends Error {
  public readonly phase: CsvParserPhase;

  constructor(phase: CsvParserPhase, message?: string) {
    super(message ?? `CSV parser failed in phase: ${phase}`);
    this.name = "CsvParserError";
    this.phase = phase;
  }
}

/**
 * Activity types we normalize every parsed row into. Anything that doesn't
 * match a known category falls back to "other" so the row still ends up in
 * the database.
 */
export type ActivityType = "running" | "cycling" | "gym" | "other";

/**
 * The shape of a single normalized workout, ready to be inserted into the
 * `workouts` table. Kept intentionally close to the existing stub shape so
 * the worker can keep its insert loop unchanged.
 */
export interface Workout {
  user_id: string;
  activity_type: ActivityType;
  source: "csv" | "gpx";
  source_file_ref: string;
  start_time: string; // ISO timestamp
  duration_seconds: number;
  metrics: {
    distance?: number; // km
    calories?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
    avg_speed?: number; // km/h
    elevation_gain?: number; // meters
    steps?: number;
  };
  fingerprint: string;
  status: "valid";
}

/**
 * A row that was rejected during validation. We keep the raw header→value
 * map so the worker can log/investigate without us re-reading the file.
 */
export interface CsvParseError {
  row: number;
  reason: string;
  raw: Record<string, string>;
}

export interface CsvParseStats {
  totalRows: number;
  accepted: number;
  rejected: number;
  unmappedColumns: string[];
}

export interface CsvParseResult {
  workouts: Workout[];
  parseErrors: CsvParseError[];
  stats: CsvParseStats;
}

/**
 * Synonym map for header recognition. Keys are lowercased, whitespace-
 * normalized versions of the canonical field we want to extract. Order
 * matters: the first match wins, so list longer/more specific variants
 * before generic ones.
 */
const HEADER_SYNONYMS: Record<string, string> = {
  // start_time
  start_time: "start_time",
  "start time": "start_time",
  starttime: "start_time",
  start: "start_time",
  "start date": "start_time",
  date: "start_time",
  "activity date": "start_time",
  "workout start": "start_time",
  timestamp: "start_time",

  // duration_seconds
  duration_seconds: "duration_seconds",
  "duration (s)": "duration_seconds",
  "duration (seconds)": "duration_seconds",
  "duration (sec)": "duration_seconds",
  duration: "duration_seconds",
  "duration (min)": "duration_seconds",
  "duration (minutes)": "duration_seconds",
  "duration (minute)": "duration_seconds",
  "duration (m)": "duration_seconds",
  "duration (hr)": "duration_seconds",
  "duration (hours)": "duration_seconds",
  "duration (hour)": "duration_seconds",
  "duration (h)": "duration_seconds",
  "elapsed time": "duration_seconds",
  "elapsed time (s)": "duration_seconds",
  "elapsed time (min)": "duration_seconds",
  elapsed_time: "duration_seconds",
  "time (s)": "duration_seconds",
  "time (seconds)": "duration_seconds",
  "time (min)": "duration_seconds",
  "time (minutes)": "duration_seconds",
  "time (h)": "duration_seconds",
  "time (hours)": "duration_seconds",
  time: "duration_seconds",

  // activity_type
  activity_type: "activity_type",
  "activity type": "activity_type",
  type: "activity_type",
  activity: "activity_type",
  sport: "activity_type",
  "sport type": "activity_type",
  "workout type": "activity_type",

  // distance
  distance: "distance",
  "distance (km)": "distance",
  distance_km: "distance",
  "distance (m)": "distance",
  distance_m: "distance",
  distance_meters: "distance",
  "distance (mi)": "distance",
  distance_mi: "distance",
  miles: "distance",
  kilometers: "distance",

  // calories
  calories: "calories",
  kcal: "calories",
  energy: "calories",

  // heart rate
  avg_heart_rate: "avg_heart_rate",
  "avg hr": "avg_heart_rate",
  "average heart rate": "avg_heart_rate",
  "avg heart rate": "avg_heart_rate",
  heart_rate_avg: "avg_heart_rate",
  hr_avg: "avg_heart_rate",

  max_heart_rate: "max_heart_rate",
  "max hr": "max_heart_rate",
  "max heart rate": "max_heart_rate",
  "maximum heart rate": "max_heart_rate",
  heart_rate_max: "max_heart_rate",
  hr_max: "max_heart_rate",

  // speed / pace
  avg_speed: "avg_speed",
  "average speed": "avg_speed",
  speed: "avg_speed",
  pace: "avg_speed", // handled specially — pace is inverted time/distance

  // steps
  steps: "steps",
  "step count": "steps",

  // elevation
  elevation_gain: "elevation_gain",
  "elevation gain": "elevation_gain",
  "total ascent": "elevation_gain",
  ascent: "elevation_gain",
  "elev gain": "elevation_gain",
};

/**
 * All canonical field names we recognize. Anything else is "unmapped" and
 * reported in stats.unmappedColumns so the user/operator can spot upstream
 * schema drift.
 */
const KNOWN_FIELDS = new Set(Object.values(HEADER_SYNONYMS));

/**
 * Normalize a header string for matching: lowercase + collapse all whitespace
 * (single spaces, tabs, underscores all become a single space character).
 */
const normalizeHeader = (raw: string): string =>
  raw.trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");

/**
 * Try to resolve a raw header to a canonical field. Returns the canonical
 * field name, or null if we don't recognize it.
 */
const resolveHeader = (raw: string): string | null => {
  const normalized = normalizeHeader(raw);
  return HEADER_SYNONYMS[normalized] ?? null;
};

/**
 * Activity type normalization via case-insensitive substring matching. Order
 * matters — more specific (gym) before more generic (running) — actually all
 * are disjoint substrings so order doesn't matter, but keep it readable.
 */
const normalizeActivityType = (raw: string | undefined): ActivityType => {
  if (!raw) return "other";
  const v = raw.toLowerCase().trim();

  // Cycling first because "biking" / "spin" never overlap with run/gym.
  if (/(bike|biking|cycling|ride|cycling|spin|cyclocross)/.test(v)) {
    return "cycling";
  }
  if (/(run|running|jog|jogging)/.test(v)) {
    return "running";
  }
  if (/(gym|strength|weights|weight|lift|lifting|resistance|crossfit)/.test(v)) {
    return "gym";
  }
  return "other";
};

/**
 * Parse a Date from a wide variety of common export formats. Returns null if
 * the input doesn't look like a date we can parse.
 *
 *   - ISO 8601 (with or without timezone): "2024-01-15T08:30:00Z"
 *   - Strava-style: "Jan 15, 2024, 8:30:00 AM"
 *   - Apple Health: "2024-01-15 08:30"
 *   - epoch millis: "1705305000000"
 */
const parseStartTime = (raw: string): Date | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Pure numeric → assume epoch millis if 13 digits, epoch seconds if 10.
  if (/^\d{10,13}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    const ms = trimmed.length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Unit-suffix detection for a column. The convention we follow: if the
 * canonical header name itself contains "mi"/"miles" we treat the raw value
 * as miles and convert to km; if "m"/"meters" we treat as meters. Anything
 * else defaults to km.
 *
 * Note: we look at the *original* column header (post-normalization) for
 * these hints, since the values themselves don't carry units.
 */
const distanceUnitFromOriginalHeader = (
  originalHeader: string,
): "km" | "mi" | "m" => {
  const h = originalHeader.toLowerCase();
  if (/\bmiles?\b|\bmi\b/.test(h)) return "mi";
  if (/\bmeters?\b|\bm\b/.test(h)) return "m";
  return "km";
};

const durationUnitFromOriginalHeader = (
  originalHeader: string,
): "s" | "min" | "hr" => {
  const h = originalHeader.toLowerCase();
  if (/\bminutes?\b|\bmin\b/.test(h)) return "min";
  if (/\bhours?\b|\bhrs?\b|\bhr\b/.test(h)) return "hr";
  return "s";
};

/**
 * Convert a duration value to seconds, applying the unit hint from the
 * column header.
 */
const toDurationSeconds = (raw: string, unit: "s" | "min" | "hr"): number => {
  const v = parseFloat(raw);
  if (!isFinite(v)) return NaN;
  switch (unit) {
    case "min":
      return v * 60;
    case "hr":
      return v * 3600;
    default:
      return v;
  }
};

/**
 * Convert a distance value to kilometers, applying the unit hint from the
 * column header.
 */
const toDistanceKm = (raw: string, unit: "km" | "mi" | "m"): number => {
  const v = parseFloat(raw);
  if (!isFinite(v)) return NaN;
  switch (unit) {
    case "mi":
      return v * 1.609344;
    case "m":
      return v / 1000;
    default:
      return v;
  }
};

/**
 * Convert a pace string like "5:30" (min/km) to avg_speed in km/h. Returns
 * null if the value isn't in `m:ss` format.
 */
const paceToKmh = (raw: string): number | null => {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const minutes = parseInt(m[1], 10);
  const seconds = parseInt(m[2], 10);
  const extra = m[3] ? parseInt(m[3], 10) : 0;
  const totalMinutes = minutes + seconds / 60 + extra / 3600;
  if (totalMinutes <= 0) return null;
  return 60 / totalMinutes; // km/h
};

/**
 * SHA-1 fingerprint of a workout keyed on (userId, start_time, duration,
 * activity_type, distance). Deterministic enough to catch re-uploads of the
 * same file while still being tolerant of cosmetic variations.
 */
const computeFingerprint = (
  userId: string,
  startTimeIso: string,
  durationSeconds: number,
  activityType: ActivityType,
  distance: number | undefined,
): string =>
  createHash("sha1")
    .update(
      [
        userId,
        startTimeIso,
        Math.round(durationSeconds),
        activityType,
        distance !== undefined ? distance.toFixed(3) : "na",
      ].join("|"),
    )
    .digest("hex");

/**
 * Parse a CSV buffer into a structured CsvParseResult. Throws CsvParserError
 * only for structural failures (empty file, missing header, no data rows).
 * Per-row validation failures are reported in parseErrors rather than thrown.
 *
 * The CSV is parsed via csv-parse in async-iterator mode so we can stream
 * memory-efficiently through large files (Strava export, multi-year Apple
 * Health dump, etc.) without buffering every row.
 */
export const parseCsv = async (
  buffer: Buffer,
  userId: string,
  uploadId: string,
): Promise<Workout[]> => {
  const result = await parseCsvDetailed(buffer, userId, uploadId);
  return result.workouts;
};

/**
 * Full-fidelity variant of parseCsv that also returns the rejected rows and
 * stats. The upload worker can use this to surface partial-success messages.
 */
/**
 * Strip leading comment lines from CSV text. Many exports (and a lot of
 * hand-curated test fixtures) begin with `# Row 1: ...` style commentary
 * that csv-parse would otherwise treat as the header row.
 *
 * We only strip lines that begin (after leading whitespace) with `#`,
 * `;`, or `//` — the three markers commonly seen in CSV exports. The
 * first non-comment line is left untouched, so embedded `#` inside
 * values (rare but legal) still round-trip fine.
 */
const stripLeadingComments = (raw: string): string => {
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trimStart();
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith(";") ||
      trimmed.startsWith("//")
    ) {
      i++;
      continue;
    }
    break;
  }
  return i === 0 ? raw : lines.slice(i).join("\n");
};

export const parseCsvDetailed = async (
  buffer: Buffer,
  userId: string,
  uploadId: string,
): Promise<CsvParseResult> => {
  const text = stripLeadingComments(buffer.toString("utf-8"));

  if (!text.trim()) {
    throw new CsvParserError("EMPTY_FILE", "CSV file is empty");
  }

  // Build a parser that yields rows as objects keyed by their original header.
  // We use relax_quotes because real-world exports routinely have slightly
  // malformed quoting. bom: true strips a leading UTF-8 BOM (Excel adds one).
  const parser = parse({
    columns: (header: string[]) => header.map((h) => h.trim()),
    trim: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
    to: 1, // grab just the first record to extract headers
  });

  // Feed the text once to read the header, then re-parse for the full stream.
  // (csv-parse's `info` option would also work, but this is simpler and works
  //  across versions.)
  let headerRow: string[] | null = null;
  parser.write(text);
  parser.end();
  for await (const rec of parser as AsyncIterable<Record<string, string>>) {
    if (headerRow === null) {
      headerRow = Object.keys(rec);
      break;
    }
  }

  if (!headerRow || headerRow.length === 0) {
    throw new CsvParserError(
      "MISSING_HEADER",
      "CSV file does not contain a header row",
    );
  }

  // Build a canonicalField lookup only for recognized headers. We preserve
  // the original header strings so we can inspect their *names* for unit
  // hints when reading values.
  const headerToField = new Map<string, string>();
  const unmappedColumns: string[] = [];
  for (const h of headerRow) {
    const field = resolveHeader(h);
    if (field) {
      headerToField.set(h, field);
    } else {
      unmappedColumns.push(h);
    }
  }

  if (headerToField.size === 0) {
    throw new CsvParserError(
      "INVALID_HEADER",
      `CSV header row does not contain any recognized columns. Saw: ${headerRow.join(", ")}`,
    );
  }

  if (unmappedColumns.length > 0) {
    logger.warn(
      `CSV upload ${uploadId}: ${unmappedColumns.length} unmapped column(s): ${unmappedColumns.join(", ")}`,
    );
  }

  // Now re-parse the full file as a stream of objects.
  const rowParser = parse({
    columns: (header: string[]) => header.map((h) => h.trim()),
    trim: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  });

  const workouts: Workout[] = [];
  const parseErrors: CsvParseError[] = [];
  let totalRows = 0;

  rowParser.write(text);
  rowParser.end();

  for await (const raw of rowParser as AsyncIterable<Record<string, string>>) {
    totalRows++;

    // Extract the canonical fields the header map tells us about.
    const extracted: Record<string, string> = {};
    for (const [originalHeader, field] of headerToField.entries()) {
      const value = raw[originalHeader];
      if (value !== undefined && value !== "") {
        extracted[field] = value;
      }
    }

    // ---- Validation ----
    const startTime = parseStartTime(extracted.start_time);
    if (!startTime) {
      parseErrors.push({
        row: totalRows,
        reason: "Invalid start_time",
        raw,
      });
      continue;
    }

    // Need to look at the *original* column to decide units. We scan the
    // headerToField map for whichever entry maps to "duration_seconds".
    const durationOriginalHeader = [...headerToField.entries()].find(
      ([, field]) => field === "duration_seconds",
    )?.[0];
    const durationUnit = durationOriginalHeader
      ? durationUnitFromOriginalHeader(durationOriginalHeader)
      : "s";
    const durationSeconds = extracted.duration_seconds
      ? toDurationSeconds(extracted.duration_seconds, durationUnit)
      : NaN;

    if (!isFinite(durationSeconds) || durationSeconds <= 0) {
      parseErrors.push({
        row: totalRows,
        reason:
          durationSeconds === 0
            ? "duration_seconds is zero"
            : "Invalid duration",
        raw,
      });
      continue;
    }

    const activityType = normalizeActivityType(extracted.activity_type);

    // Distance is optional but worth pulling in if present.
    let distance: number | undefined;
    if (extracted.distance !== undefined) {
      const distanceOriginalHeader = [...headerToField.entries()].find(
        ([, field]) => field === "distance",
      )?.[0];
      const distanceUnit = distanceOriginalHeader
        ? distanceUnitFromOriginalHeader(distanceOriginalHeader)
        : "km";
      const km = toDistanceKm(extracted.distance, distanceUnit);
      if (isFinite(km) && km >= 0) {
        distance = km;
      }
    }

    // Soft gate: require at least activity_type or distance to be present.
    // (Otherwise the row is just a duration with no context — likely trash.)
    if (activityType === "other" && distance === undefined) {
      parseErrors.push({
        row: totalRows,
        reason: "Missing activity_type and distance",
        raw,
      });
      continue;
    }

    // ---- Build metrics ----
    const metrics: Workout["metrics"] = {};

    if (distance !== undefined) metrics.distance = distance;

    if (extracted.calories) {
      const c = parseFloat(extracted.calories);
      if (isFinite(c) && c >= 0) metrics.calories = c;
    }

    if (extracted.avg_heart_rate) {
      const hr = parseFloat(extracted.avg_heart_rate);
      if (isFinite(hr) && hr > 0) metrics.avg_heart_rate = hr;
    }

    if (extracted.max_heart_rate) {
      const hr = parseFloat(extracted.max_heart_rate);
      if (isFinite(hr) && hr > 0) metrics.max_heart_rate = hr;
    }

    if (extracted.avg_speed) {
      // If the original column is "pace", we get km/h from paceToKmh.
      const speedOriginalHeader = [...headerToField.entries()].find(
        ([, field]) => field === "avg_speed",
      )?.[0];
      const isPace = speedOriginalHeader
        ? /^pace$/i.test(speedOriginalHeader.trim())
        : false;
      const kmh = isPace
        ? paceToKmh(extracted.avg_speed)
        : (() => {
            const v = parseFloat(extracted.avg_speed);
            return isFinite(v) ? v : null;
          })();
      if (kmh !== null && kmh !== undefined && isFinite(kmh) && kmh > 0) {
        metrics.avg_speed = kmh;
      }
    }

    if (extracted.elevation_gain) {
      const e = parseFloat(extracted.elevation_gain);
      if (isFinite(e) && e >= 0) metrics.elevation_gain = e;
    }

    if (extracted.steps) {
      const s = parseInt(extracted.steps, 10);
      if (isFinite(s) && s >= 0) metrics.steps = s;
    }

    workouts.push({
      user_id: userId,
      activity_type: activityType,
      source: "csv",
      source_file_ref: uploadId,
      start_time: startTime.toISOString(),
      duration_seconds: Math.round(durationSeconds),
      metrics,
      fingerprint: computeFingerprint(
        userId,
        startTime.toISOString(),
        durationSeconds,
        activityType,
        distance,
      ),
      status: "valid",
    });
  }

  if (workouts.length === 0 && parseErrors.length === 0) {
    throw new CsvParserError(
      "NO_DATA_ROWS",
      "CSV file has a header but no data rows",
    );
  }

  if (parseErrors.length > 0) {
    logger.warn(
      `CSV upload ${uploadId}: ${parseErrors.length} of ${totalRows} row(s) rejected`,
    );
  }

  return {
    workouts,
    parseErrors,
    stats: {
      totalRows,
      accepted: workouts.length,
      rejected: parseErrors.length,
      unmappedColumns,
    },
  };
};
