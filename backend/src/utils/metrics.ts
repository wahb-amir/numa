/**
 * Centralized definition of every metric the stats pipeline can compute a
 * baseline for. Each entry describes how to extract that metric from a
 * workout row's JSONB `metrics` blob, which activity types it applies to,
 * and what unit it ends up in (so the UI knows how to render it).
 *
 * Centralizing here — rather than scattering string literals across the
 * baseline worker, the comparison endpoint, and the trend endpoint —
 * guarantees that "avg_hr" in the baselines table is the same "avg_hr"
 * the activity detail page already knows how to format.
 */

export type MetricName =
  | "distance_km"
  | "duration_seconds"
  | "avg_hr"
  | "avg_pace_min_km"
  | "avg_speed_kmh"
  | "calories";

export type ActivityType = "running" | "cycling" | "gym" | "other";

export interface MetricSpec {
  /** Canonical name stored in baselines / discovered_patterns. */
  name: MetricName;
  /** Human-readable label for the UI. */
  label: string;
  /** Short label for inline badges (under 12 chars). */
  shortLabel: string;
  /** Activity types this metric is meaningful for. */
  appliesTo: ActivityType[];
  /** Display unit. */
  unit: string;
  /** Extract a numeric value from a workout row, or null if absent. */
  extract(workout: WorkoutForStats): number | null;
  /**
   * "higher is better" vs "lower is better" — used by progress trend to
   * label a metric as improving when it goes down (e.g. pace).
   */
  betterWhen: "higher" | "lower" | "neutral";
}

/**
 * Minimal shape the stats layer needs from a workout row. Defined locally
 * (rather than imported from supabase types) so this module has no DB
 * dependency and can be unit-tested in isolation.
 */
export interface WorkoutForStats {
  activity_type: ActivityType;
  start_time: string;
  duration_seconds: number;
  metrics: Record<string, unknown> | null;
}

/** Defensive numeric coercion — Supabase JSONB occasionally returns
 *  numbers as strings, and parses occasionally produce NaN. */
const asNumber = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * All metrics the system knows how to baseline. Order matters for the UI —
 * this is the order they appear in the insights / reports pages.
 */
export const METRICS: MetricSpec[] = [
  {
    name: "distance_km",
    label: "Distance",
    shortLabel: "dist",
    appliesTo: ["running", "cycling", "other"],
    unit: "km",
    betterWhen: "neutral",
    extract: (w) => asNumber(w.metrics?.distance_km ?? w.metrics?.distance),
  },
  {
    name: "duration_seconds",
    label: "Duration",
    shortLabel: "dur",
    appliesTo: ["running", "cycling", "gym", "other"],
    unit: "s",
    betterWhen: "neutral",
    extract: (w) => (w.duration_seconds > 0 ? w.duration_seconds : null),
  },
  {
    name: "avg_hr",
    label: "Avg Heart Rate",
    shortLabel: "HR",
    appliesTo: ["running", "cycling"],
    unit: "bpm",
    betterWhen: "lower",
    extract: (w) => asNumber(w.metrics?.avg_hr ?? w.metrics?.avg_heart_rate),
  },
  {
    name: "avg_pace_min_km",
    label: "Avg Pace",
    shortLabel: "pace",
    appliesTo: ["running", "cycling"],
    unit: "min/km",
    betterWhen: "lower",
    extract: (w) => {
      // Stored as min/km in the seed (and CSV parser). The activity detail
      // page also knows about avg_pace_sec_per_km — convert from seconds
      // if we ever see that variant.
      const direct = asNumber(
        w.metrics?.avg_pace_min_km ?? w.metrics?.avg_pace,
      );
      if (direct !== null) return direct;
      const secPerKm = asNumber(w.metrics?.avg_pace_sec_per_km);
      if (secPerKm !== null) return secPerKm / 60;
      return null;
    },
  },
  {
    name: "avg_speed_kmh",
    label: "Avg Speed",
    shortLabel: "spd",
    appliesTo: ["running", "cycling"],
    unit: "km/h",
    betterWhen: "higher",
    extract: (w) => asNumber(w.metrics?.avg_speed ?? w.metrics?.avg_speed_kmh),
  },
  {
    name: "calories",
    label: "Calories",
    shortLabel: "kcal",
    appliesTo: ["running", "cycling", "gym", "other"],
    unit: "kcal",
    betterWhen: "neutral",
    extract: (w) => asNumber(w.metrics?.calories),
  },
];

/** Resolve a metric by name, with a runtime check so typos surface early. */
export const getMetric = (name: string): MetricSpec | null =>
  METRICS.find((m) => m.name === name) ?? null;

/** Metrics applicable to a given activity type. */
export const metricsForActivity = (type: ActivityType): MetricSpec[] =>
  METRICS.filter((m) => m.appliesTo.includes(type));