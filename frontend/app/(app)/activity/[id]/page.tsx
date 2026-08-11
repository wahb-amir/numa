"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { TopHeader } from "@/components/shell/top-header";
import { MetricStat } from "@/components/ui/metric-stat";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ReflectionForm } from "@/components/dashboard/reflection-form";
import { Loader2, AlertCircle, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { getComparison } from "@/lib/api-client";
import type {
  ApiWorkout,
  ApiComparisonResponse,
  ApiComparisonMetric,
} from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Display unit for each known metric key. Keys match the snake_case
// emitted by the data-gen (`data-gen/src/seed.ts`) and the Phase 2 stats
// pipeline (`backend/src/utils/metrics.ts`). Unknown keys fall through to
// no unit — preserves the previous behavior for ad-hoc metrics.
const METRIC_UNIT: Record<string, string> = {
  // Workout metrics
  avg_hr: "bpm",
  max_hr: "bpm",
  min_hr: "bpm",
  resting_hr: "bpm",
  avg_pace_min_km: "min/km",
  avg_pace_sec_per_km: "sec/km",
  avg_pace_sec_per_mile: "sec/mi",
  avg_speed_kmh: "km/h",
  distance_km: "km",
  distance: "km",
  elevation_gain_m: "m",
  calories: "kcal",
  steps: "steps",
  avg_cadence: "rpm",
  avg_power: "W",
  max_power: "W",
  // Today's-state metrics (dashboard cards)
  sleep_hours: "h",
  training_load: "TSS",
  recovery_score: "/100",
  fitness_level: "CTL",
  weather_temp: "°C",
  temperature_c: "°C",
  hrv: "ms",
};

/**
 * Render pace as `M:SS` (e.g. `5.5 → "5:30"`) instead of decimal minutes.
 * Runners read pace in min:sec, not minutes.minutes — `1.83 min/km` reads
 * as a typo.
 */
function formatPace(minPerKm: number): string {
  const total = Math.round(minPerKm * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Metric keys whose stored value is already a whole-second integer.
// Rendered without decimals so "328 sec/km" doesn't read as "328.0 sec/km".
const INTEGER_METRIC_KEYS = new Set([
  "avg_pace_sec_per_km",
  "avg_pace_sec_per_mile",
  "avg_duration_seconds",
  "duration_seconds",
  "resting_hr",
  "avg_hr",
  "max_hr",
  "min_hr",
  "calories",
  "steps",
  "Avg Heart Rate",
  "Max Heart Rate",
  "Resting Hr",
  "Min Hr",
]);

// Keys that are intentionally whole numbers (HR, steps, second counts).
// We compare against the human-readable label so the policy matches what
// the user sees, not the snake_case key from the parser.
const INTEGER_METRIC_LABELS = new Set([
  "Avg Heart Rate",
  "Max Heart Rate",
  "Resting Heart Rate",
  "Min Heart Rate",
  "Resting Hr",
  "Avg Hr",
  "Max Hr",
  "Min Hr",
  "Calories",
  "Steps",
  "Avg Pace Sec Per Km",
  "Avg Pace Sec Per Mile",
  "Avg Duration Seconds",
  "Duration Seconds",
]);

/**
 * Round a metric value for display so JSONB numbers like
 * `328.4271834` or `4.7999999` don't overflow the metric tile.
 *   - Integers stay integers (`62` → `62`).
 *   - Fractional values round to 2 decimals, trimming trailing zeros
 *     (`4.80` → `4.8`, `4.7999999` → `4.8`).
 *   - Whole-second / count metrics stay as whole numbers regardless of
 *     trailing float noise from the parser.
 *
 * The key argument is the human-readable label (the value already shown
 * to the user); it lets the integer policy match the rendered name
 * regardless of the underlying JSONB snake_case key.
 */
function formatMetric(value: number, label: string): number {
  if (!Number.isFinite(value)) return value;
  if (INTEGER_METRIC_LABELS.has(label)) return Math.round(value);
  // toFixed(2) gives a string; Number() drops trailing zeros.
  return Number(value.toFixed(2));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [workout, setWorkout] = useState<ApiWorkout | null>(null);
  const [comparison, setComparison] = useState<ApiComparisonResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [{ data: w }, cmp] = await Promise.all([
          api.get<ApiWorkout>(`/workouts/${id}`),
          getComparison(id).catch(() => null),
        ]);
        setWorkout(w);
        setComparison(cmp);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 404) {
          setNotFoundFlag(true);
        } else {
          setError("Could not load workout details.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (notFoundFlag) notFound();

  const reflection = workout?.reflections?.[0] ?? null;

  return (
    <div>
      <TopHeader
        title={
          loading
            ? "Loading…"
            : workout
              ? `${workout.activity_type.charAt(0).toUpperCase() + workout.activity_type.slice(1)} Session`
              : "Activity"
        }
        subtitle={workout ? formatDate(workout.start_time) : ""}
      />

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-20 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading session…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 rounded-control border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!loading && workout && (
          <>
            {/* ── Objective Metrics ── */}
            <Card>
              <CardHeader>
                <CardTitle>Objective Metrics</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MetricStat
                    label="Duration"
                    value={formatDuration(workout.duration_seconds)}
                  />
                  <MetricStat
                    label="Activity"
                    value={
                      workout.activity_type.charAt(0).toUpperCase() +
                      workout.activity_type.slice(1)
                    }
                  />
                  <MetricStat
                    label="Source"
                    value={workout.source.toUpperCase()}
                  />
                  {/* Render any extra numeric metrics from the metrics JSONB */}
                  {Object.entries(workout.metrics ?? {})
                    .map(([key, raw]) => {
                      // Underscore-prefixed keys (e.g. `_sleep_hours`,
                      // `_training_load`) are internal correlation-worker
                      // inputs — not user-facing metrics. The seed stores
                      // both `sleep_hours` and `_sleep_hours`, so without
                      // this filter the same tile renders twice.
                      if (key.startsWith("_")) return null;
                      // Accept numbers and numeric strings — Supabase JSONB
                      // sometimes returns numeric values as strings when
                      // they were stored via the postgres ::text cast.
                      const num =
                        typeof raw === "number"
                          ? raw
                          : typeof raw === "string" &&
                              raw.trim() !== "" &&
                              Number.isFinite(Number(raw))
                            ? Number(raw)
                            : null;
                      if (num === null) return null;
                      const label = key
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                      const isPace =
                        key === "avg_pace_min_km" ||
                        key === "avg_pace_sec_per_km";
                      return (
                        <MetricStat
                          key={key}
                          label={label}
                          value={
                            isPace
                              ? formatPace(
                                  key === "avg_pace_sec_per_km"
                                    ? num / 60
                                    : num,
                                )
                              : formatMetric(num, label)
                          }
                          unit={METRIC_UNIT[key]}
                        />
                      );
                    })}
                </div>
              </CardContent>
            </Card>

            {/* ── Subjective / Reflection ── */}
            {reflection ? (
              <Card>
                <CardHeader>
                  <CardTitle>Reflection</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {reflection.effort_rating !== null && (
                      <MetricStat
                        label="Perceived effort"
                        value={reflection.effort_rating}
                        unit="/10"
                      />
                    )}
                    {reflection.energy_level && (
                      <MetricStat
                        label="Energy level"
                        value={
                          reflection.energy_level.charAt(0).toUpperCase() +
                          reflection.energy_level.slice(1)
                        }
                      />
                    )}
                  </div>
                  {reflection.notes && (
                    <div>
                      <p className="text-xs font-medium text-text-muted">
                        Your notes
                      </p>
                      <p className="mt-1 text-sm italic text-text-secondary">
                        &ldquo;{reflection.notes}&rdquo;
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* No reflection yet — show the form pre-wired to this workout */
              <ReflectionForm workoutId={id} />
            )}

            {/* ── Numa's Interpretation (baseline comparison) ── */}
            {comparison && comparison.comparison && (
              <ComparisonPanel comparison={comparison.comparison} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Comparison panel ─────────────────────────────────────────────────────────

const METRIC_DISPLAY: Record<
  string,
  { label: string; unit: string; integer: boolean }
> = {
  avg_hr: { label: "Avg HR", unit: "bpm", integer: true },
  avg_pace_min_km: { label: "Avg Pace", unit: "min/km", integer: false },
  avg_speed_kmh: { label: "Avg Speed", unit: "km/h", integer: false },
  distance_km: { label: "Distance", unit: "km", integer: false },
  duration_seconds: { label: "Duration", unit: "s", integer: true },
  calories: { label: "Calories", unit: "kcal", integer: true },
};

const HIGHER_IS_WORSE: Record<string, boolean> = {
  avg_hr: true,
  avg_pace_min_km: true,
  duration_seconds: false,
  distance_km: false,
  avg_speed_kmh: false,
  calories: false,
};

const LABEL_TEXT: Record<string, string> = {
  typical: "typical for you",
  somewhat_above: "somewhat above your normal",
  somewhat_below: "somewhat below your normal",
  notably_above: "notably above your normal",
  notably_below: "notably below your normal",
  insufficient_data: "no baseline yet",
};

function ComparisonPanel({
  comparison,
}: {
  comparison: Record<string, ApiComparisonMetric>;
}) {
  const metrics = Object.entries(comparison)
    .map(([name, c]) => {
      const display = METRIC_DISPLAY[name];
      if (!display) return null;
      return { name, display, c };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (metrics.length === 0) return null;

  const hasBaseline = metrics.some((m) => m.c.baseline_mean !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Numa&apos;s Interpretation</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {!hasBaseline && (
          <p className="text-sm text-text-muted">
            Numa needs at least 5 sessions of this activity type to compute
            your baseline. Keep logging and check back here.
          </p>
        )}

        {hasBaseline && (
          <ul className="divide-y divide-border">
            {metrics.map(({ name, display, c }) => {
              if (c.baseline_mean === null) return null;
              const valueDisplay = display.integer
                ? Math.round(c.value).toString()
                : c.value.toFixed(2);
              const meanDisplay = display.integer
                ? Math.round(c.baseline_mean).toString()
                : c.baseline_mean.toFixed(2);
              const stdDisplay = display.integer
                ? Math.round(c.baseline_stddev ?? 0).toString()
                : (c.baseline_stddev ?? 0).toFixed(2);
              const devPct =
                c.deviation_pct !== null ? c.deviation_pct : 0;
              const valueIsHigher = c.value > c.baseline_mean;
              const higherWorse = HIGHER_IS_WORSE[name] ?? false;
              const isBad =
                (higherWorse && valueIsHigher) ||
                (!higherWorse && !valueIsHigher);
              const Icon = valueIsHigher ? TrendingUp : TrendingDown;
              const colorClass = isBad
                ? "bg-status-attention-soft text-status-attention"
                : "bg-status-positive-soft text-status-positive";
              return (
                <li
                  key={name}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {display.label}: {valueDisplay} {display.unit}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Baseline (14d): {meanDisplay} ± {stdDisplay} ·{" "}
                      {devPct > 0 ? "+" : ""}
                      {devPct.toFixed(1)}% deviation
                    </p>
                    <p className="mt-1 text-xs italic text-text-muted">
                      {LABEL_TEXT[c.label] ?? c.label}
                    </p>
                  </div>
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-medium ${colorClass}`}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {Math.abs(devPct).toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
