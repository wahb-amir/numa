import type { Units } from "./units-context";

/**
 * Unit conversion + formatting helpers. All helpers take the current
 * `Units` so the caller doesn't have to thread it through every layer.
 *
 * Underlying data is stored in metric (km, kg, m, °C). These helpers
 * convert at the edge of the UI only — never mutate state.
 */

const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;

export function formatDistance(km: number | null, units: Units): string {
  if (km === null || Number.isNaN(km)) return "—";
  if (units === "imperial") {
    const miles = km * KM_TO_MI;
    return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
  }
  return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
}

/**
 * Returns the bare number (converted) without a unit suffix. Useful when
 * the unit is shown elsewhere on the same line, e.g. metric stat tiles.
 */
export function convertDistance(km: number, units: Units): number {
  return units === "imperial" ? km * KM_TO_MI : km;
}

/** Short duration label. Hour-aware: 75 min -> "1h 15m". */
export function formatDuration(minutes: number, units: Units): string {
  if (!Number.isFinite(minutes)) return "—";
  // Unit preference doesn't change duration; keep this signature so the
  // call sites stay parallel to formatDistance().
  void units;
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Pace: minutes per unit-of-distance. Stored as seconds per km in
 * `avg_pace_sec_per_km` metrics; converted to min/mile when imperial.
 */
export function formatPace(
  secondsPerKm: number | null,
  units: Units,
): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0)
    return "—";
  const secondsPerUnit =
    units === "imperial" ? secondsPerKm / KM_TO_MI : secondsPerKm;
  const total = Math.round(secondsPerUnit);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const unitLabel = units === "imperial" ? "mi" : "km";
  return `${mm}:${ss.toString().padStart(2, "0")}/${unitLabel}`;
}

/** Elevation. Stored in meters. */
export function formatElevation(meters: number | null, units: Units): string {
  if (meters === null || Number.isNaN(meters)) return "—";
  const v = units === "imperial" ? meters * M_TO_FT : meters;
  return `${Math.round(v)} ${units === "imperial" ? "ft" : "m"}`;
}

/** Plain "mi" / "km" tag for chips. */
export function distanceUnit(units: Units): string {
  return units === "imperial" ? "mi" : "km";
}