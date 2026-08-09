"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { TopHeader } from "@/components/shell/top-header";
import { MetricStat } from "@/components/ui/metric-stat";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ReflectionForm } from "@/components/dashboard/reflection-form";
import { Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { ApiWorkout } from "@/lib/types";

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
]);

/**
 * Round a metric value for display so JSONB numbers like
 * `328.4271834` or `4.7999999` don't overflow the metric tile.
 *   - Integers stay integers (`62` → `62`).
 *   - Fractional values round to 2 decimals, trimming trailing zeros
 *     (`4.80` → `4.8`, `4.7999999` → `4.8`).
 *   - Whole-second metrics stay as whole seconds regardless of trailing
 *     float noise from the parser.
 */
function formatMetric(value: number, key: string): number {
  if (!Number.isFinite(value)) return value;
  if (INTEGER_METRIC_KEYS.has(key)) return Math.round(value);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data } = await api.get<ApiWorkout>(`/workouts/${id}`);
        setWorkout(data);
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
                    .filter(([, v]) => typeof v === "number")
                    .map(([key, val]) => (
                      <MetricStat
                        key={key}
                        label={key
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                        value={formatMetric(val as number, key)}
                      />
                    ))}
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
          </>
        )}
      </div>
    </div>
  );
}
