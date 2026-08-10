"use client";

import { useEffect, useState } from "react";
import { TopHeader } from "@/components/shell/top-header";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { ApiWorkout, ApiComparisonMetric, ActivityType } from "@/lib/types";
import Link from "next/link";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  running: "Run",
  cycling: "Ride",
  gym: "Gym",
  other: "Other",
};

const ACTIVITY_COLOR: Record<ActivityType, string> = {
  running: "text-accent-emerald bg-accent-emerald-soft",
  cycling: "text-accent-slate  bg-accent-slate-soft",
  gym: "text-status-attention bg-status-attention-soft",
  other: "text-text-muted bg-surface-sunken",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Pick the most representative metric for a workout and render a
 * "vs. baseline" badge next to the row. We prefer avg_hr when present
 * (most relatable), then pace, then duration.
 */
function deviationBadge(workout: ApiWorkout) {
  const comparison = (workout as ApiWorkout & {
    comparison?: Record<string, ApiComparisonMetric>;
  }).comparison;
  if (!comparison) return null;

  const candidates: Array<{
    metric: string;
    label: string;
    c: ApiComparisonMetric;
  }> = [];
  if (comparison.avg_hr) {
    candidates.push({ metric: "avg_hr", label: "HR", c: comparison.avg_hr });
  }
  if (comparison.avg_pace_min_km) {
    candidates.push({
      metric: "avg_pace_min_km",
      label: "pace",
      c: comparison.avg_pace_min_km,
    });
  }
  if (candidates.length === 0 && comparison.duration_seconds) {
    candidates.push({
      metric: "duration_seconds",
      label: "dur",
      c: comparison.duration_seconds,
    });
  }
  const picked = candidates[0];
  if (!picked) return null;

  const { metric, c } = picked;
  if (c.baseline_mean === null) return null;

  const absZ = c.z_score === null ? 0 : Math.abs(c.z_score);
  if (absZ < 0.5) {
    return (
      <span className="rounded-chip bg-surface-sunken px-2 py-0.5 text-xs text-text-muted">
        Typical for you
      </span>
    );
  }

  const isPace = metric === "avg_pace_min_km";
  const isHigherWorse = metric === "avg_hr" || isPace;
  const valueIsHigher = c.value > c.baseline_mean;

  // For HR / pace: higher value = worse. Flip the icon so the user
  // sees the actual *direction* (above or below baseline), not just
  // whether z is positive or negative.
  const isBad =
    (isHigherWorse && valueIsHigher) || (!isHigherWorse && !valueIsHigher);

  const Icon = valueIsHigher ? TrendingUp : TrendingDown;
  const sign = valueIsHigher ? "above" : "below";
  const color = isBad
    ? "bg-status-attention-soft text-status-attention"
    : "bg-status-positive-soft text-status-positive";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-medium ${color}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(c.deviation_pct ?? 0).toFixed(0)}% {sign} baseline
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [workouts, setWorkouts] = useState<ApiWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<ApiWorkout[]>("/workouts?limit=50");
        setWorkouts(data);
      } catch {
        setError(
          "Could not load your workouts. Make sure the backend is running.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <TopHeader
        title="Activity"
        subtitle={
          loading
            ? "Loading your sessions…"
            : error
              ? "Error loading workouts"
              : `${workouts.length} session${workouts.length !== 1 ? "s" : ""} logged`
        }
      />
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading sessions…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 rounded-control border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && workouts.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <p className="text-sm text-text-muted">No workouts logged yet.</p>
            <Link
              href="/dashboard"
              className="rounded-control bg-accent-emerald px-4 py-2 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90"
            >
              Go to Dashboard to upload or log a workout
            </Link>
          </div>
        )}

        {!loading && !error && workouts.length > 0 && (
          <Card>
            <CardContent className="p-2">
              <ul className="divide-y divide-border">
                {workouts.map((w) => {
                  const hasReflection =
                    Array.isArray(w.reflections) && w.reflections.length > 0;
                  const badge = deviationBadge(w);
                  return (
                    <li key={w.id}>
                      <Link
                        href={`/activity/${w.id}`}
                        className="flex items-center justify-between gap-4 rounded-card border border-transparent px-4 py-3.5 transition-colors hover:border-border hover:bg-surface-sunken"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`rounded-chip px-2 py-1 text-xs font-semibold ${ACTIVITY_COLOR[w.activity_type]}`}
                          >
                            {ACTIVITY_LABEL[w.activity_type]}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary capitalize">
                              {w.activity_type} session
                            </p>
                            <p className="text-xs text-text-muted">
                              {formatDate(w.start_time)} ·{" "}
                              {formatDuration(w.duration_seconds)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {badge}
                          {!hasReflection && (
                            <span className="flex items-center gap-1 rounded-chip border border-border px-2 py-0.5 text-xs text-text-muted">
                              <Plus className="h-3 w-3" />
                              Add reflection
                            </span>
                          )}
                          {hasReflection && (
                            <span className="rounded-chip bg-status-positive-soft px-2 py-0.5 text-xs font-medium text-status-positive">
                              Reflected
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
