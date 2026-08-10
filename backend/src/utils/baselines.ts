/**
 * Pure baseline computation — given a list of workouts for one
 * (user, activity_type) pair, produce the rolling-window stats for every
 * applicable metric at both 14-day (short) and 90-day (long) windows.
 *
 * Pure: no DB calls, no side effects. The BullMQ worker (and any future
 * on-demand invoker) is responsible for fetching workouts and writing
 * results back.
 *
 * Windowing strategy:
 *   - Short window: last 14 calendar days, capped at MAX_SHORT_SAMPLES
 *     workouts. Most-recent first; we then take the first N.
 *   - Long window:  last 90 calendar days, same cap.
 *   - MIN_SAMPLES gate: if a (window × metric) has fewer than 5 samples,
 *     we skip writing a row entirely — that's the "insufficient_data"
 *     UX signal. The comparison endpoint reads missing rows as null.
 */

import { mean, stddev } from "../utils/stats";
import {
  METRICS,
  metricsForActivity,
  type ActivityType,
  type MetricSpec,
  type WorkoutForStats,
} from "../utils/metrics";

export const SHORT_WINDOW_DAYS = 14;
export const LONG_WINDOW_DAYS = 90;
export const MIN_SAMPLES = 5;

/** Hard cap so a single user with 500 workouts in 14 days doesn't blow
 *  up the arithmetic. After this many rows the distribution has converged
 *  enough that the extra points add noise, not signal. */
const MAX_SAMPLES = 200;

export interface BaselineRow {
  metric_name: string;
  activity_type: ActivityType;
  window_days: number;
  rolling_mean: number;
  rolling_stddev: number;
  sample_count: number;
}

export interface BaselineWindow {
  window_days: number;
  cutoff: Date;
  workouts: WorkoutForStats[];
}

/**
 * Filter workouts to those within the last `windowDays` calendar days.
 * Returned list is most-recent-first so the caller can slice/cap it.
 */
export const selectWindow = (
  workouts: WorkoutForStats[],
  windowDays: number,
  now: Date = new Date(),
): BaselineWindow => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const inWindow = workouts
    .filter((w) => new Date(w.start_time) >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    )
    .slice(0, MAX_SAMPLES);
  return { window_days: windowDays, cutoff, workouts: inWindow };
};

/**
 * Compute a baseline row for a single (metric, window). Returns null when
 * there aren't enough samples — the caller treats that as the
 * insufficient_data signal.
 */
const computeMetricBaseline = (
  metric: MetricSpec,
  windowWorkouts: WorkoutForStats[],
): BaselineRow | null => {
  const values: number[] = [];
  for (const w of windowWorkouts) {
    const v = metric.extract(w);
    if (v !== null && Number.isFinite(v)) values.push(v);
  }
  if (values.length < MIN_SAMPLES) return null;

  const mu = mean(values);
  const sigma = stddev(values);
  if (mu === null || sigma === null) return null;

  return {
    metric_name: metric.name,
    activity_type: windowWorkouts[0].activity_type as ActivityType,
    window_days: 0, // filled in by caller
    rolling_mean: mu,
    rolling_stddev: sigma,
    sample_count: values.length,
  };
};

/**
 * Compute every baseline row for one activity type at one window. Returns
 * an empty array if the window has too few workouts overall — we still
 * want the row "marked as insufficient" semantically, but rather than
 * write a phantom row, we omit it; the comparison endpoint reads
 * absence as insufficient_data.
 */
export const computeBaselinesForActivity = (
  activityType: ActivityType,
  allWorkouts: WorkoutForStats[],
  windowDays: number,
  now: Date = new Date(),
): BaselineRow[] => {
  const filtered = allWorkouts.filter((w) => w.activity_type === activityType);
  const win = selectWindow(filtered, windowDays, now);

  const out: BaselineRow[] = [];
  for (const metric of metricsForActivity(activityType)) {
    const row = computeMetricBaseline(metric, win.workouts);
    if (!row) continue;
    row.window_days = windowDays;
    out.push(row);
  }
  return out;
};

/**
 * One-shot helper for a (user, activity_type): returns the short AND long
 * window rows. Most callers should use this rather than the per-window
 * primitive above.
 */
export const computeBaselinesAllWindows = (
  activityType: ActivityType,
  allWorkouts: WorkoutForStats[],
  now: Date = new Date(),
): BaselineRow[] => [
  ...computeBaselinesForActivity(activityType, allWorkouts, SHORT_WINDOW_DAYS, now),
  ...computeBaselinesForActivity(activityType, allWorkouts, LONG_WINDOW_DAYS, now),
];

/**
 * Distinct activity types present in a workout list, in stable order.
 */
export const activityTypesPresent = (
  workouts: WorkoutForStats[],
): ActivityType[] => {
  const set = new Set<ActivityType>();
  for (const w of workouts) {
    if (["running", "cycling", "gym", "other"].includes(w.activity_type)) {
      set.add(w.activity_type as ActivityType);
    }
  }
  // METRICS order for consistency; "other" last.
  return (["running", "cycling", "gym", "other"] as ActivityType[]).filter((t) =>
    set.has(t),
  );
};

/**
 * Compute baselines for one user, every activity type present, both
 * windows. Used by the BullMQ worker and by any test that wants the
 * whole-user picture.
 */
export const computeBaselinesForUser = (
  allWorkouts: WorkoutForStats[],
  now: Date = new Date(),
): BaselineRow[] => {
  const out: BaselineRow[] = [];
  for (const t of activityTypesPresent(allWorkouts)) {
    out.push(...computeBaselinesAllWindows(t, allWorkouts, now));
  }
  return out;
};

export { METRICS };