"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { MetricStat } from "@/components/ui/metric-stat";
import { ReflectionForm } from "@/components/dashboard/reflection-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getWorkouts } from "@/lib/api-client";
import type { ApiWorkout } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMetric(
  metrics: Record<string, unknown>,
  key: string,
): number | null {
  const v = metrics[key];
  return typeof v === "number" ? v : null;
}

function formatDayLabel(workout: ApiWorkout, index: number): string {
  const date = new Date(workout.start_time);
  if (index === 0) return "Today";
  if (index === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-8 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-card bg-surface-sunken" />
        ))}
      </div>
      <div className="h-48 rounded-card bg-surface-sunken" />
      <div className="h-64 rounded-card bg-surface-sunken" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const [workouts, setWorkouts] = useState<ApiWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getWorkouts(20);
        if (!cancelled) setWorkouts(data);
      } catch {
        if (!cancelled) setError("Could not load workouts from the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = workouts[0];
  const last7 = workouts.slice(0, 7);

  // Pull today's metric snapshot from the most-recent workout's stored metrics
  const todayMetrics = latest
    ? (latest.metrics as Record<string, unknown>)
    : null;

  return (
    <div>
      <TopHeader
        title="Today"
        subtitle="Granular metrics for your current day"
      />

      {loading && <Skeleton />}

      {!loading && error && (
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="rounded-card border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            {error}
          </div>
        </div>
      )}

      {!loading && !error && !latest && (
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-raised py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-emerald-soft">
              <Upload className="h-6 w-6 text-accent-emerald" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-text-primary">
              No workout data yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-text-secondary">
              Upload your first workout file to start seeing daily metrics here.
            </p>
            <Link
              href="/upload"
              className="mt-6 inline-flex items-center gap-2 rounded-control bg-accent-emerald px-5 py-2.5 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload your data
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && latest && (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricStat
              label="Recovery"
              value={
                todayMetrics
                  ? extractMetric(todayMetrics, "recovery_score")
                  : null
              }
              unit="/100"
            />
            <MetricStat
              label="Resting HR"
              value={
                todayMetrics ? extractMetric(todayMetrics, "resting_hr") : null
              }
              unit="bpm"
            />
            <MetricStat
              label="HRV"
              value={todayMetrics ? extractMetric(todayMetrics, "hrv") : null}
              unit="ms"
            />
            <MetricStat
              label="Sleep"
              value={
                todayMetrics ? extractMetric(todayMetrics, "sleep_hours") : null
              }
              unit="hrs"
            />
            <MetricStat
              label="Duration"
              value={Math.round(latest.duration_seconds / 60)}
              unit="min"
            />
            <MetricStat
              label="Training load"
              value={
                todayMetrics
                  ? extractMetric(todayMetrics, "training_load")
                  : null
              }
              unit="/100"
            />
          </div>

          <ReflectionForm />

          <Card>
            <CardHeader>
              <CardTitle>Last {last7.length} Sessions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-text-muted">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Session
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Type
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Duration
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Source
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {last7.map((w, i) => (
                      <tr key={w.id}>
                        <td className="py-2.5 pr-4 font-medium text-text-primary capitalize">
                          {formatDayLabel(w, i)}
                        </td>
                        <td className="py-2.5 pr-4 text-text-secondary capitalize">
                          {w.activity_type}
                        </td>
                        <td className="py-2.5 pr-4 tabular text-text-secondary">
                          {Math.round(w.duration_seconds / 60)} min
                        </td>
                        <td className="py-2.5 pr-4 text-text-muted capitalize">
                          {w.source}
                        </td>
                        <td className="py-2.5 text-text-muted">
                          {new Date(w.start_time).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
