/**
 * Progress trend — simple month-over-month comparison per
 * (activity_type, metric).
 *
 * The design deliberately avoids real regression / forecasting: we
 * compute the mean of the workout values in the earliest month and the
 * most recent month, take the % change, and label direction from there.
 * That's both easier to explain to the user and easier to defend in a
 * Feasibility & Safety review.
 *
 * Confidence is a coarse 3-bucket label derived from sample sizes:
 *   - "high"     : both months have >= 4 workouts
 *   - "moderate" : either month has >= 3 workouts
 *   - "low"      : otherwise (we still return the result, but the UI
 *                  should down-weight it)
 */

import { mean, zScore, groupByMonth } from "./stats";
import {
  METRICS,
  metricsForActivity,
  type ActivityType,
  type MetricSpec,
  type WorkoutForStats,
} from "./metrics";

export interface ProgressPoint {
  metric_name: string;
  activity_type: ActivityType;
  /** Mean of the oldest month we have. */
  earliest_month_mean: number | null;
  /** Mean of the most recent month. */
  latest_month_mean: number | null;
  /** Percentage change from earliest to latest. Positive = went up. */
  pct_change: number | null;
  /** "improving" / "declining" / "stable", accounting for betterWhen. */
  direction: "improving" | "declining" | "stable";
  /** Sample size in the latest month. */
  sample_count: number;
  /** Worked-out confidence bucket. */
  confidence: "high" | "moderate" | "low";
  /** YYYY-MM of the earliest / latest month compared. */
  earliest_month: string | null;
  latest_month: string | null;
}

const stableThreshold = 0.05; // < 5% change counts as "stable"

const confidence = (earliestN: number, latestN: number) => {
  const min = Math.min(earliestN, latestN);
  if (min >= 4) return "high" as const;
  if (min >= 3) return "moderate" as const;
  return "low" as const;
};

const labelDirection = (
  pct: number,
  metric: MetricSpec,
): "improving" | "declining" | "stable" => {
  if (pct === null || Math.abs(pct) < stableThreshold * 100) return "stable";
  const up = pct > 0;
  if (metric.betterWhen === "higher") return up ? "improving" : "declining";
  if (metric.betterWhen === "lower") return up ? "declining" : "improving";
  return "stable";
};

/**
 * Compute progress trend for one (activity, metric) given the user's
 * full workout history. Returns null if there isn't enough data to
 * compare two months — the UI then displays "trend unavailable" rather
 * than fabricating a number.
 */
export const computeProgressForMetric = (
  activityType: ActivityType,
  metric: MetricSpec,
  allWorkouts: WorkoutForStats[],
): ProgressPoint | null => {
  const relevant = allWorkouts.filter(
    (w) => w.activity_type === activityType,
  );
  const buckets = groupByMonth(relevant);
  if (buckets.length < 2) return null;

  const earliest = buckets[0];
  const latest = buckets[buckets.length - 1];

  const extractValues = (xs: typeof relevant) =>
    xs
      .map((w) => metric.extract(w))
      .filter((v): v is number => v !== null && Number.isFinite(v));

  const earliestValues = extractValues(earliest.items);
  const latestValues = extractValues(latest.items);
  if (earliestValues.length < 2 || latestValues.length < 2) return null;

  const earliestMean = mean(earliestValues);
  const latestMean = mean(latestValues);
  if (earliestMean === null || latestMean === null) return null;

  const pct = ((latestMean - earliestMean) / (earliestMean || 1)) * 100;

  return {
    metric_name: metric.name,
    activity_type: activityType,
    earliest_month_mean: earliestMean,
    latest_month_mean: latestMean,
    pct_change: pct,
    direction: labelDirection(pct, metric),
    sample_count: latestValues.length,
    confidence: confidence(earliestValues.length, latestValues.length),
    earliest_month: earliest.key,
    latest_month: latest.key,
  };
};

/**
 * Progress trend across every (activity, metric) pair, for the given
 * user.
 */
export const computeProgressForUser = (
  allWorkouts: WorkoutForStats[],
): ProgressPoint[] => {
  const out: ProgressPoint[] = [];
  const seen = new Set<string>();
  for (const w of allWorkouts) {
    const t = w.activity_type as ActivityType;
    if (seen.has(t)) continue;
    seen.add(t);
    for (const metric of metricsForActivity(t)) {
      const p = computeProgressForMetric(t, metric, allWorkouts);
      if (p) out.push(p);
    }
  }
  return out;
};

/**
 * Latest z-score for a (metric, activity) — used by the comparison
 * endpoint to render the "today vs. baseline" deviation. Pulled out
 * here so the comparison endpoint stays a thin layer.
 */
export const computeDeviation = (
  value: number,
  baseline: { rolling_mean: number; rolling_stddev: number } | null,
) => {
  if (!baseline) return { z: null, deviation_pct: null };
  const mu = baseline.rolling_mean;
  const sigma = baseline.rolling_stddev;
  const z = zScore(value, mu, sigma);
  const deviation_pct = mu === 0 ? null : ((value - mu) / mu) * 100;
  return { z, deviation_pct };
};

export { METRICS };
