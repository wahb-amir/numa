/**
 * Tiny self-contained statistics helpers used by the baseline worker, the
 * correlation engine, and the comparison endpoint. No dependencies — just
 * the arithmetic we need.
 *
 * Keeping these in one place (rather than scattered across files) means a
 * bug fix lands once and stays fixed.
 */

/** Sample mean. Returns null for empty input. */
export const mean = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
};

/**
 * Sample standard deviation (n-1 denominator — Bessel's correction). This
 * is what we want for a rolling window over a user's history because it
 * gives an unbiased estimate of the population variance.
 *
 * Returns null for fewer than 2 values. Returns 0 when every value is
 * identical — callers must handle the divide-by-zero case in z-scores.
 */
export const stddev = (xs: number[]): number | null => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  if (m === null) return null;
  let ss = 0;
  for (const x of xs) {
    const d = x - m;
    ss += d * d;
  }
  return Math.sqrt(ss / (xs.length - 1));
};

/**
 * Z-score of a value against a (mean, stddev) distribution. Returns null
 * when the stddev is zero (every value in the window was identical) —
 * callers should surface this as "typical" rather than "infinitely
 * anomalous".
 */
export const zScore = (
  value: number,
  mu: number,
  sigma: number,
): number | null => {
  if (!Number.isFinite(sigma) || sigma <= 0) return null;
  return (value - mu) / sigma;
};

/**
 * Percentage deviation from a baseline mean.
 *   - 0   → matches the baseline exactly
 *   - +5  → 5% above baseline (worse for "lower is better" metrics)
 *   - -10 → 10% below baseline
 *
 * Returns null when mu is zero (avoid divide-by-zero).
 */
export const deviationPct = (value: number, mu: number): number | null => {
  if (mu === 0) return null;
  return ((value - mu) / mu) * 100;
};

/**
 * Bucket a |z| value into one of three human-readable labels.
 *   < 0.5  → typical for you
 *   0.5-1.5 → somewhat above/below your normal
 *   >= 1.5  → notably above/below your normal
 *
 * `null` z-scores (zero variance) collapse to "typical" — we cannot claim
 * a workout is unusual when the user has no variation in their history.
 */
export type DeviationLabel =
  | "typical"
  | "somewhat_above"
  | "somewhat_below"
  | "notably_above"
  | "notably_below"
  | "insufficient_data";

export const deviationLabel = (
  z: number | null,
  sign: 1 | -1 | 0 = 1,
): DeviationLabel => {
  if (z === null || !Number.isFinite(z)) return "typical";
  const abs = Math.abs(z);
  const dir = sign ?? (z > 0 ? 1 : z < 0 ? -1 : 1);
  if (abs < 0.5) return "typical";
  if (abs < 1.5) return dir > 0 ? "somewhat_above" : "somewhat_below";
  return dir > 0 ? "notably_above" : "notably_below";
};

/**
 * Pearson correlation coefficient between two equally-sized paired
 * samples. Returns null when:
 *   - either input is empty
 *   - either input has zero variance (a perfectly flat line has no
 *     correlation to anything — the math collapses to 0/0)
 *   - the inputs are different lengths
 *
 * The output range is [-1, 1]; the |r| >= 0.4 threshold the correlation
 * engine uses is the conventional "moderate effect" cut-off.
 */
export const pearson = (
  xs: number[],
  ys: number[],
): number | null => {
  if (xs.length === 0 || ys.length === 0) return null;
  if (xs.length !== ys.length) return null;
  if (xs.length < 2) return null;

  const mx = mean(xs);
  const my = mean(ys);
  if (mx === null || my === null) return null;

  let num = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  if (sxx === 0 || syy === 0) return null;
  return num / Math.sqrt(sxx * syy);
};

/**
 * Linear regression slope + intercept for a y vs x series with integer
 * x (e.g. month index 0, 1, 2 ...). Used by the progress trend endpoint
 * for a slightly richer view than the simple month-over-month % change.
 *
 * Returns null when the inputs have no variance or are too short.
 */
export const linearSlope = (
  xs: number[],
  ys: number[],
): { slope: number; intercept: number } | null => {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const mx = mean(xs);
  const my = mean(ys);
  if (mx === null || my === null) return null;

  let num = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    sxx += dx * dx;
  }
  if (sxx === 0) return null;
  const slope = num / sxx;
  return { slope, intercept: my - slope * mx };
};

/**
 * Group workouts into calendar-month buckets keyed by YYYY-MM. Returns a
 * sorted array of { key, items } so callers can iterate month-by-month
 * from oldest to newest.
 */
export interface MonthBucket<T> {
  /** YYYY-MM string. */
  key: string;
  /** Items belonging to that month. */
  items: T[];
}

export const groupByMonth = <T extends { start_time: string }>(
  items: T[],
): MonthBucket<T>[] => {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const d = new Date(item.start_time);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = buckets.get(key);
    if (existing) existing.push(item);
    else buckets.set(key, [item]);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, items]) => ({ key, items }));
};