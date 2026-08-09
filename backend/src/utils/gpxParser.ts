import { createHash } from "crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { logger } from "./logger";

/**
 * Phases that a GPX parsing failure can be attributed to. Surfaced via
 * GpxParserError.phase so the upload worker can produce a clear user-facing
 * message instead of a generic "parsing failed".
 */
export type GpxParserPhase =
  | "INVALID_XML"
  | "NOT_GPX"
  | "NO_TRACKS"
  | "INSUFFICIENT_POINTS";

/**
 * Custom error type so callers can branch on .phase without string-matching.
 */
export class GpxParserError extends Error {
  public readonly phase: GpxParserPhase;

  constructor(phase: GpxParserPhase, message?: string) {
    super(message ?? `GPX parser failed in phase: ${phase}`);
    this.name = "GpxParserError";
    this.phase = phase;
  }
}

export type ActivityType = "running" | "cycling" | "gym" | "other";

export interface Workout {
  user_id: string;
  activity_type: ActivityType;
  source: "csv" | "gpx";
  source_file_ref: string;
  start_time: string;
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

export interface GpxPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: Date;
  hr?: number;
}

export interface GpxParseError {
  trackIndex: number;
  reason: string;
}

export interface GpxParseStats {
  tracksFound: number;
  tracksParsed: number;
  totalPoints: number;
}

export interface GpxParseResult {
  workouts: Workout[];
  parseErrors: GpxParseError[];
  stats: GpxParseStats;
}

const EARTH_RADIUS_KM = 6371.0088;
const AVG_RUNNING_SPEED_KMH = 10;
const AVG_CYCLING_SPEED_KMH = 25;

/**
 * XMLParser configured for lenient GPX parsing. We don't use isValid here
 * because the validator already ran upstream. parseAttributeValue: true
 * gives us lat/lon as numbers directly.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  // GPX namespaces are predictably chaotic — preserve them so we can walk
  // them generically rather than maintaining a prefix allowlist.
  removeNSPrefix: false,
});

/**
 * Coerce anything we found under text content to a number. Returns undefined
 * if the value is missing or not numeric.
 */
const toNumber = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : undefined;
};

/**
 * Coerce a value to a Date. Returns undefined if it can't be parsed.
 */
const toDate = (v: unknown): Date | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
};

/**
 * Recursive walk to find a heart-rate value inside an `<extensions>` tree.
 * GPX producers use a variety of schemas:
 *   - Garmin TrackPointExtension v1: <gpxtpx:TrackPointExtension><gpxtpx:hr>123</gpxtpx:hr>
 *   - Cluetrust:  <gpxdata:hr>...</gpxdata:hr>
 *   - Strava-ish: <heartrate>...</heartrate>
 *   - Generic:    <hr>...</hr>
 *
 * We look for any element whose local name (case-insensitive) is one of
 * "hr", "heartrate", "heart_rate", or "heart-rate", at any depth. Values
 * are taken from text content or a @_value attribute (some producers use
 * one, some the other).
 */
const findHeartRate = (node: unknown): number | undefined => {
  if (node === undefined || node === null) return undefined;

  if (typeof node !== "object") return undefined;

  const obj = node as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    // Strip any namespace prefix from the tag name.
    const localName = key.includes(":") ? key.split(":").pop()! : key;
    const lower = localName.toLowerCase();

    if (lower === "hr" || lower === "heartrate" || lower === "heart_rate") {
      // Some producers put the value in an attribute, others in text content.
      if (typeof value === "object" && value !== null) {
        const v = value as Record<string, unknown>;
        const attrVal = toNumber(v["@_value"]);
        if (attrVal !== undefined) return attrVal;
        const textVal = toNumber(v["#text"]);
        if (textVal !== undefined) return textVal;
        // Recurse one level deeper — occasionally the value is nested.
        const nested = findHeartRate(v);
        if (nested !== undefined) return nested;
      } else {
        const n = toNumber(value);
        if (n !== undefined) return n;
      }
    }

    // Recurse into structures we know can contain extensions.
    if (
      typeof value === "object" &&
      value !== null &&
      (lower === "extensions" ||
        lower === "trackpointextension" ||
        lower.includes("extension"))
    ) {
      const nested = findHeartRate(value);
      if (nested !== undefined) return nested;
    }

    // Generic fallback — recurse into anywhere that looks object-like.
    if (typeof value === "object" && value !== null && lower !== "hr") {
      const nested = findHeartRate(value);
      if (nested !== undefined) return nested;
    }
  }

  return undefined;
};

/**
 * Walk a parsed <trkpt> object into a normalized GpxPoint. Returns null if
 * the point is missing both lat and lon (i.e. it's malformed).
 */
const parseTrkpt = (raw: unknown): GpxPoint | null => {
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const lat = toNumber(obj["@_lat"]);
  const lon = toNumber(obj["@_lon"]);

  if (lat === undefined || lon === undefined) {
    return null;
  }

  const ele = toNumber(obj.ele);
  const time = toDate(obj.time);
  const hr = findHeartRate(obj.extensions);

  return { lat, lon, ele, time, hr };
};

/**
 * Pull all <trkpt> elements out of a <trkseg> regardless of nesting depth.
 * GPX files occasionally have extensions or schema additions that wrap
 * points in another layer, so we walk recursively rather than indexing.
 */
const extractTrkpts = (seg: unknown): unknown[] => {
  if (seg === undefined || seg === null || typeof seg !== "object") {
    return [];
  }

  const found: unknown[] = [];
  const visit = (node: unknown) => {
    if (node === undefined || node === null || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj.trkpt !== undefined) {
      const arr = Array.isArray(obj.trkpt) ? obj.trkpt : [obj.trkpt];
      for (const p of arr) found.push(p);
    }
    for (const value of Object.values(obj)) {
      if (typeof value === "object" && value !== null) visit(value);
    }
  };

  visit(seg);
  return found;
};

/**
 * Haversine distance between two coordinates in kilometers.
 */
const haversineKm = (a: GpxPoint, b: GpxPoint): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Pull <trkseg> (track segments) out of a <trk> regardless of nesting depth.
 */
const extractTrksegs = (trk: unknown): unknown[] => {
  if (trk === undefined || trk === null || typeof trk !== "object") {
    return [];
  }
  const obj = trk as Record<string, unknown>;
  const raw = obj.trkseg;
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
};

/**
 * Heuristic activity-type resolution from average speed. Used only when the
 * GPX <type> element is missing or unrecognized.
 *   - >= 25 km/h → cycling
 *   - 8–25 km/h → running
 *   - < 8 km/h  → other (walking/hiking/slow)
 */
const guessActivityType = (avgSpeedKmh: number): ActivityType => {
  if (avgSpeedKmh >= AVG_CYCLING_SPEED_KMH) return "cycling";
  if (avgSpeedKmh >= AVG_RUNNING_SPEED_KMH / 1.25) return "running";
  return "other";
};

/**
 * Normalize a <type> text content to one of our enum values. Mirrors the
 * CSV parser's vocabulary so downstream code can treat the two sources
 * uniformly.
 */
const normalizeActivityType = (raw: string | undefined): ActivityType => {
  if (!raw) return "other";
  const v = raw.toLowerCase().trim();
  if (/(bike|biking|cycling|ride|spin|cyclocross)/.test(v)) return "cycling";
  if (/(run|running|jog|jogging)/.test(v)) return "running";
  if (/(gym|strength|weights|weight|lift|lifting|resistance|crossfit)/.test(v)) {
    return "gym";
  }
  if (/(walk|hike|hiking)/.test(v)) return "other";
  return "other";
};

/**
 * SHA-1 fingerprint of a workout keyed on (userId, start_time, duration,
 * activity_type, distance). Matches the CSV parser's scheme so re-uploads
 * of the same workout in either format are deduplicated together.
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
 * Parse a GPX buffer into a structured GpxParseResult. One workout per <trk>.
 * Throws GpxParserError only for structural failures (invalid XML, no tracks,
 * no usable points). Per-track rejections (insufficient points, missing
 * time) are reported in parseErrors.
 */
export const parseGpx = async (
  buffer: Buffer,
  userId: string,
  uploadId: string,
): Promise<Workout[]> => {
  const result = await parseGpxDetailed(buffer, userId, uploadId);
  return result.workouts;
};

/**
 * Full-fidelity variant of parseGpx that also returns rejected tracks and
 * stats. The upload worker can use this to surface partial-success messages.
 */
export const parseGpxDetailed = async (
  buffer: Buffer,
  userId: string,
  uploadId: string,
): Promise<GpxParseResult> => {
  const text = buffer.toString("utf-8");

  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    // The validator returns a ValidationError object on failure.
    const detail = (validation as { err: { msg: string } }).err?.msg ?? "unknown";
    throw new GpxParserError(
      "INVALID_XML",
      `GPX file is not valid XML: ${detail}`,
    );
  }

  const parsed = parser.parse(text);

  // The root could be <gpx> directly or wrapped in something else.
  const gpx = parsed.gpx ?? parsed["?xml"] ?? parsed;
  if (!gpx || typeof gpx !== "object") {
    throw new GpxParserError("INVALID_XML", "GPX root element not found");
  }

  // Light sanity check: a real GPX file has the version attribute on the
  // root element. We accept anything that smells like a GPX file but bail
  // out if even the metadata naming is missing.
  const rootTag = (parsed.gpx ? "gpx" : Object.keys(parsed)[0]) ?? "";
  if (!rootTag.toLowerCase().includes("gpx")) {
    throw new GpxParserError(
      "NOT_GPX",
      `File does not look like a GPX document (root tag: <${rootTag}>)`,
    );
  }

  const gpxObj = gpx as Record<string, unknown>;
  const trkRaw = gpxObj.trk;
  if (trkRaw === undefined) {
    throw new GpxParserError(
      "NO_TRACKS",
      "GPX file contains no <trk> elements",
    );
  }

  const tracks: unknown[] = Array.isArray(trkRaw) ? trkRaw : [trkRaw];
  const workouts: Workout[] = [];
  const parseErrors: GpxParseError[] = [];
  let totalPoints = 0;

  // Fallback start time taken from <metadata>/<time> if individual tracks
  // lack timestamps.
  const metadataTime = toDate(
    (gpxObj.metadata as Record<string, unknown> | undefined)?.time,
  );

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const trk = tracks[trackIndex];

    // Pull points from all segments in this track.
    const segments = extractTrksegs(trk);
    const points: GpxPoint[] = [];
    for (const seg of segments) {
      for (const raw of extractTrkpts(seg)) {
        const p = parseTrkpt(raw);
        if (p) points.push(p);
      }
    }

    totalPoints += points.length;

    if (points.length < 2) {
      parseErrors.push({
        trackIndex,
        reason: `< 2 trkpt (got ${points.length})`,
      });
      continue;
    }

    // ---- Time ----
    const firstWithTime = points.find((p) => p.time);
    const lastWithTime = [...points].reverse().find((p) => p.time);
    if (!firstWithTime?.time || !lastWithTime?.time) {
      parseErrors.push({
        trackIndex,
        reason: "no <time> on trkpt",
      });
      continue;
    }

    const startTime = firstWithTime.time;
    const endTime = lastWithTime.time;
    const durationSeconds = Math.max(
      0,
      Math.round((endTime.getTime() - startTime.getTime()) / 1000),
    );

    if (durationSeconds <= 0) {
      parseErrors.push({
        trackIndex,
        reason: "duration_seconds <= 0",
      });
      continue;
    }

    // ---- Distance via Haversine ----
    let distanceKm = 0;
    for (let i = 1; i < points.length; i++) {
      distanceKm += haversineKm(points[i - 1], points[i]);
    }

    // ---- Elevation gain (sum of positive deltas) ----
    let elevationGain = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1].ele;
      const b = points[i].ele;
      if (a !== undefined && b !== undefined) {
        const delta = b - a;
        if (delta > 0) elevationGain += delta;
      }
    }

    // ---- Heart rate ----
    const hrValues = points
      .map((p) => p.hr)
      .filter((v): v is number => v !== undefined && v > 0);
    let avgHr: number | undefined;
    let maxHr: number | undefined;
    if (hrValues.length > 0) {
      avgHr = Math.round(
        hrValues.reduce((s, v) => s + v, 0) / hrValues.length,
      );
      maxHr = Math.max(...hrValues);
    }

    // ---- Speed ----
    const distance = distanceKm > 0 ? distanceKm : undefined;
    const avgSpeed =
      distance !== undefined && durationSeconds > 0
        ? distance / (durationSeconds / 3600)
        : undefined;

    // ---- Activity type ----
    const trackObj = trk as Record<string, unknown>;
    const typeRaw = Array.isArray(trackObj.type)
      ? (trackObj.type[0] as unknown)
      : (trackObj.type as unknown);
    const typeText =
      typeof typeRaw === "object" && typeRaw !== null
        ? ((typeRaw as Record<string, unknown>)["#text"] as string)
        : (typeRaw as string);
    const activityType = normalizeActivityType(
      typeof typeText === "string" ? typeText : undefined,
    ) ||
      (avgSpeed !== undefined ? guessActivityType(avgSpeed) : "other");

    // ---- Build workout ----
    const metrics: Workout["metrics"] = {};
    if (distance !== undefined) metrics.distance = distance;
    if (avgSpeed !== undefined && isFinite(avgSpeed) && avgSpeed > 0) {
      metrics.avg_speed = avgSpeed;
    }
    if (elevationGain > 0) metrics.elevation_gain = elevationGain;
    if (avgHr !== undefined) metrics.avg_heart_rate = avgHr;
    if (maxHr !== undefined) metrics.max_heart_rate = maxHr;

    workouts.push({
      user_id: userId,
      activity_type: activityType,
      source: "gpx",
      source_file_ref: uploadId,
      start_time: (metadataTime ?? startTime).toISOString(),
      duration_seconds: durationSeconds,
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

  if (workouts.length === 0) {
    if (parseErrors.length === 0) {
      throw new GpxParserError(
        "INSUFFICIENT_POINTS",
        "GPX file contained no usable tracks",
      );
    }
    // We have tracks but all were rejected — surface a structural error so
    // the worker doesn't try to "complete" a parse with zero workouts.
    throw new GpxParserError(
      "INSUFFICIENT_POINTS",
      `All GPX tracks were rejected: ${parseErrors.map((e) => e.reason).join("; ")}`,
    );
  }

  if (parseErrors.length > 0) {
    logger.warn(
      `GPX upload ${uploadId}: ${parseErrors.length} of ${tracks.length} track(s) rejected`,
    );
  }

  return {
    workouts,
    parseErrors,
    stats: {
      tracksFound: tracks.length,
      tracksParsed: workouts.length,
      totalPoints,
    },
  };
};
