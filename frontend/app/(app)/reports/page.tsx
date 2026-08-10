"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricStat } from "@/components/ui/metric-stat";
import { getWorkouts, getProgress, getPatterns } from "@/lib/api-client";
import type {
  ApiWorkout,
  ApiProgressPoint,
  ApiDiscoveredPattern,
} from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWithinLastNDays(isoDate: string, n: number): boolean {
  const d = new Date(isoDate);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - n);
  return d >= cutoff;
}

function average(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null);
  if (!valid.length) return null;
  return (
    Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  running: "Running",
  cycling: "Cycling",
  gym: "Gym",
  other: "Other",
};

const DIRECTION_ICON = {
  improving: TrendingUp,
  declining: TrendingDown,
  stable: Minus,
};

const DIRECTION_COLOR = {
  improving: "text-status-positive bg-status-positive-soft",
  declining: "text-status-attention bg-status-attention-soft",
  stable: "text-text-muted bg-surface-sunken",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-8 lg:py-8 animate-pulse">
      <div className="h-52 rounded-card bg-surface-sunken" />
      <div className="h-52 rounded-card bg-surface-sunken" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [workouts, setWorkouts] = useState<ApiWorkout[]>([]);
  const [progress, setProgress] = useState<ApiProgressPoint[]>([]);
  const [patterns, setPatterns] = useState<ApiDiscoveredPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, p, pat] = await Promise.all([
          getWorkouts(200),
          getProgress(),
          getPatterns(),
        ]);
        if (!cancelled) {
          setWorkouts(w);
          setProgress(p);
          setPatterns(pat);
        }
      } catch {
        if (!cancelled)
          setError("Could not load workout data from the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const thisWeek = workouts.filter((w) => isWithinLastNDays(w.start_time, 7));
  const thisMonth = workouts.filter((w) => isWithinLastNDays(w.start_time, 30));

  const avgDurThis = average(thisWeek.map((w) => w.duration_seconds / 60));
  const totalTimeThisWeek = thisWeek.reduce(
    (s, w) => s + Math.round(w.duration_seconds / 60),
    0,
  );
  const activityTypes = Array.from(
    new Set(thisMonth.map((w) => w.activity_type)),
  );

  return (
    <div>
      <TopHeader
        title="Reports"
        subtitle="Aggregated intelligence across weeks and months"
      />

      {loading && <Skeleton />}

      {!loading && error && (
        <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="rounded-card border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            {error}
          </div>
        </div>
      )}

      {!loading && !error && workouts.length === 0 && (
        <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-raised py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-emerald-soft">
              <Upload className="h-6 w-6 text-accent-emerald" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-text-primary">
              No data to report yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-text-secondary">
              Reports populate automatically once you start uploading workout
              files.
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

      {!loading && !error && workouts.length > 0 && (
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
          {/* This week */}
          <Card>
            <CardHeader>
              <CardTitle>This Week</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricStat
                  label="Avg. session"
                  value={avgDurThis}
                  unit="min"
                />
                <MetricStat label="Sessions" value={thisWeek.length} />
                <MetricStat
                  label="Total time"
                  value={totalTimeThisWeek}
                  unit="min"
                />
                <MetricStat
                  label="Activity types"
                  value={activityTypes.length}
                />
              </div>
            </CardContent>
          </Card>

          {/* Month-over-month progress trend */}
          <Card>
            <CardHeader>
              <CardTitle>Month-over-Month Trend</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {progress.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Trends populate once Numa has at least two months of data.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {progress.map((p) => {
                    const Icon = DIRECTION_ICON[p.direction];
                    return (
                      <li
                        key={`${p.activity_type}-${p.metric_name}`}
                        className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {ACTIVITY_LABEL[p.activity_type] ?? p.activity_type} ·{" "}
                            {p.metric_label}
                          </p>
                          <p className="text-xs text-text-muted">
                            {p.earliest_month} → {p.latest_month} ·{" "}
                            {p.sample_count} session
                            {p.sample_count !== 1 ? "s" : ""} · {p.confidence}{" "}
                            confidence
                          </p>
                        </div>
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-medium " +
                            DIRECTION_COLOR[p.direction]
                          }
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {p.pct_change !== null
                            ? `${p.pct_change > 0 ? "+" : ""}${p.pct_change.toFixed(1)}%`
                            : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Verified patterns summary */}
          {patterns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Verified Patterns</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-3">
                  {patterns.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-card border border-border bg-surface-sunken/40 px-4 py-3"
                    >
                      <p className="text-sm text-text-primary">
                        {p.template_summary}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        r = {p.pearson_r.toFixed(2)} · n = {p.sample_count} ·{" "}
                        threshold |r| ≥ {p.threshold.toFixed(2)}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Monthly summary */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <p className="text-sm leading-relaxed text-text-secondary">
                Over the last 30 days you logged{" "}
                <span className="font-semibold text-text-primary">
                  {thisMonth.length} session{thisMonth.length !== 1 ? "s" : ""}
                </span>{" "}
                across{" "}
                {new Set(thisMonth.map((w) => w.activity_type)).size} activity
                type
                {new Set(thisMonth.map((w) => w.activity_type)).size !== 1
                  ? "s"
                  : ""}
                .
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["running", "cycling", "gym", "other"] as const).map(
                  (type) => {
                    const count = thisMonth.filter(
                      (w) => w.activity_type === type,
                    ).length;
                    if (!count) return null;
                    return (
                      <MetricStat
                        key={type}
                        label={type.charAt(0).toUpperCase() + type.slice(1)}
                        value={count}
                        unit="sessions"
                      />
                    );
                  },
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}