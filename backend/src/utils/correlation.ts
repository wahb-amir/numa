/**
 * Correlation engine — three pre-defined hypotheses about each user's
 * training data. Per the Phase 2 design, the LLM does NOT invent
 * statistical claims; this module is the only place that decides "is
 * there a relationship?" and writes a row to discovered_patterns.
 *
 * Each check is intentionally narrow:
 *   - It names which column to use for x and which for y.
 *   - It requires a minimum sample count (so we don't claim a trend
 *     from 3 paired points).
 *   - It writes a TEMPLATED summary string — the LLM downstream only
 *     narrates that pre-formatted sentence, with no opportunity to
 *     invent numbers.
 *
 * Outputs:
 *   DiscoveredPattern[] — one per hypothesis that fired.
 *   supabase already stores these in `discovered_patterns`; the worker
 *   is the only writer.
 */

import { pearson } from "../utils/stats";
import { getMetric, type ActivityType } from "../utils/metrics";

/** Minimum paired samples for a check to be considered reliable. */
export const MIN_SAMPLES = 8;

/** Correlation magnitude threshold. Use 0.4 — the conventional
 *  "moderate" cut-off — rather than the tighter 0.5 so we don't starve
 *  early users of insights. */
export const CORRELATION_THRESHOLD = 0.4;

/**
 * The three pre-defined checks. Each has:
 *   - name: stable identifier persisted to discovered_patterns.check_name
 *   - appliesTo: which activity types the check is meaningful for
 *   - extractX / extractY: pull x and y from a workout+reflection pair
 *   - buildSummary: a fixed template that fills in the real numbers
 *
 * The motivation here is *deliberate restraint* — three real, defensible
 * checks beat ten speculative ones.
 */

export interface CorrelationCheck {
  name: string;
  appliesTo: ActivityType[];
  /** Pull x (predictor) from a workout + reflection. */
  extractX(input: CheckInput): number | null;
  /** Pull y (outcome) from a workout + reflection. */
  extractY(input: CheckInput): number | null;
  /** Templated summary — fill in the blanks with computed numbers. */
  buildSummary(input: SummaryInput): string;
}

export interface CheckInput {
  workout: {
    activity_type: ActivityType;
    start_time: string;
    metrics: Record<string, unknown> | null;
  };
  reflection: {
    effort_rating: number | null;
    energy_level: string | null;
    notes: string | null;
  } | null;
}

export interface SummaryInput {
  r: number;
  n: number;
  /** "positive" means r > 0 (x↑ → y↑); "negative" means r < 0. */
  direction: "positive" | "negative";
  metricX: string;
  metricY: string;
  activityType: ActivityType;
}

const asNumber = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Sleep → performance: do lower sleep hours on the night before a
 * workout correlate with worse (higher) pace or higher HR?
 *
 * The seed stores `_sleep_hours` inside the workout JSONB for the demo
 * accounts. Real users will get this populated from the daily_metrics
 * table once wearable integrations land — for now we read from the
 * workout payload and the fallback is to leave the check with too few
 * paired points.
 */
const sleepVsPerformance: CorrelationCheck = {
  name: "sleep_vs_performance",
  appliesTo: ["running", "cycling"],
  extractX: ({ workout }) => asNumber(workout.metrics?._sleep_hours),
  // y = next-day pace (in min/km). Lower is better, so a positive r
  // means "less sleep → slower pace" — that's the bad direction, and
  // the template below reflects that.
  extractY: ({ workout }) => {
    const metric = getMetric("avg_pace_min_km");
    return metric ? metric.extract(workout as never) : null;
  },
  buildSummary: (s) =>
    `Your average pace tends to be ${s.direction === "positive" ? "slower" : "faster"} on days after less sleep (based on ${s.n} sessions, r = ${s.r.toFixed(2)}).`,
};

/**
 * Effort rating vs actual HR: do you rate a workout as harder when
 * your heart rate is actually higher? This is a sanity check on the
 * reflection data — when r is near 0, the effort rating isn't tracking
 * the physiological signal.
 */
const effortVsHr: CorrelationCheck = {
  name: "effort_rating_vs_avg_hr",
  appliesTo: ["running", "cycling", "gym"],
  extractX: ({ reflection }) =>
    reflection?.effort_rating !== null && reflection?.effort_rating !== undefined
      ? Number(reflection.effort_rating)
      : null,
  extractY: ({ workout }) => {
    const metric = getMetric("avg_hr");
    return metric ? metric.extract(workout as never) : null;
  },
  buildSummary: (s) =>
    `Your perceived effort tracks ${s.direction === "positive" ? "closely with" : "weakly to"} your actual heart rate across ${s.n} reflected sessions (r = ${s.r.toFixed(2)}).`,
};

/**
 * Training load vs HR: when the rolling training load is higher, does
 * the avg HR at the same nominal pace creep up? The seed stores
 * `_training_load` per workout; we treat that as a single-recent
 * load observation. A positive correlation between training_load and
 * avg_hr (with similar durations) is the classic over-training signal.
 */
const trainingLoadVsHr: CorrelationCheck = {
  name: "training_load_vs_avg_hr",
  appliesTo: ["running", "cycling"],
  extractX: ({ workout }) => asNumber(workout.metrics?._training_load),
  extractY: ({ workout }) => {
    const metric = getMetric("avg_hr");
    return metric ? metric.extract(workout as never) : null;
  },
  buildSummary: (s) =>
    `Sessions following higher training load tend to show ${s.direction === "positive" ? "elevated" : "lower"} average heart rate (${s.n} sessions, r = ${s.r.toFixed(2)}).`,
};

export const CORRELATION_CHECKS: CorrelationCheck[] = [
  sleepVsPerformance,
  effortVsHr,
  trainingLoadVsHr,
];

export interface DiscoveredPattern {
  check_name: string;
  activity_type: ActivityType | null;
  metric_x: string;
  metric_y: string;
  pearson_r: number;
  sample_count: number;
  direction: "positive" | "negative";
  threshold: number;
  template_summary: string;
}

export interface PairedSample {
  activity_type: ActivityType;
  x: number;
  y: number;
}

/**
 * Run a single check across paired samples. Returns the pattern if it
 * passed (|r| >= threshold AND n >= MIN_SAMPLES), or null otherwise.
 *
 * The activity_type is attached to the result so the UI can group
 * patterns by sport when rendering.
 */
export const evaluateCheck = (
  check: CorrelationCheck,
  paired: PairedSample[],
): DiscoveredPattern | null => {
  const xs = paired.map((p) => p.x);
  const ys = paired.map((p) => p.y);
  const r = pearson(xs, ys);
  if (r === null || !Number.isFinite(r)) return null;
  if (paired.length < MIN_SAMPLES) return null;
  if (Math.abs(r) < CORRELATION_THRESHOLD) return null;

  const activityType = paired[0].activity_type;
  const direction = r > 0 ? "positive" : "negative";
  const summary = check.buildSummary({
    r,
    n: paired.length,
    direction,
    metricX: check.name.split("_")[0] ?? "x",
    metricY: check.name.split("_").pop() ?? "y",
    activityType,
  });

  return {
    check_name: check.name,
    activity_type: activityType,
    metric_x: check.name,
    metric_y: check.name,
    pearson_r: r,
    sample_count: paired.length,
    direction,
    threshold: CORRELATION_THRESHOLD,
    template_summary: summary,
  };
};
