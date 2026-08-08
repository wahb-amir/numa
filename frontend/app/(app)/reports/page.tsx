"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { MetricStat } from "@/components/ui/metric-stat";
import { getWorkouts } from "@/lib/api-client";
import type { ApiWorkout } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function average(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null);
  if (!valid.length) return null;
  return (
    Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
  );
}

function isWithinLastNDays(isoDate: string, n: number): boolean {
  const d = new Date(isoDate);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - n);
  return d >= cutoff;
}

/** Build a 30-slot duration sparkline (one value per calendar day slot). */
function buildDurationSparkline(workouts: ApiWorkout[]): (number | null)[] {
  const slots: (number | null)[] = Array(30).fill(null);
  for (const w of workouts) {
    const daysAgo = Math.floor(
      (Date.now() - new Date(w.start_time).getTime()) / 86400000,
    );
    if (daysAgo >= 0 && daysAgo < 30) {
      slots[29 - daysAgo] = Math.round(w.duration_seconds / 60);
    }
  }
  return slots;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getWorkouts(100);
        if (!cancelled) setWorkouts(data);
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
  const lastWeek = workouts.filter(
    (w) =>
      !isWithinLastNDays(w.start_time, 7) &&
      isWithinLastNDays(w.start_time, 14),
  );
  const thisMonth = workouts.filter((w) => isWithinLastNDays(w.start_time, 30));

  const avgDurThis = average(thisWeek.map((w) => w.duration_seconds / 60));
  const avgDurLast = average(lastWeek.map((w) => w.duration_seconds / 60));
  const durationDelta =
    avgDurThis !== null && avgDurLast !== null
      ? Math.round((avgDurThis - avgDurLast) * 10) / 10
      : null;

  const totalTimeThisWeek = thisWeek.reduce(
    (s, w) => s + Math.round(w.duration_seconds / 60),
    0,
  );
  const sparkline = buildDurationSparkline(workouts);

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
          <Card>
            <CardHeader>
              <CardTitle>This Week vs. Last Week</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricStat
                  label="Avg. session"
                  value={avgDurThis}
                  unit="min"
                  hint={
                    durationDelta === null
                      ? undefined
                      : `${durationDelta > 0 ? "+" : ""}${durationDelta} min vs. last week`
                  }
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
              <div className="mt-6">
                <p className="mb-2 text-xs font-medium text-text-muted">
                  30-day session duration trend (minutes)
                </p>
                <Sparkline data={sparkline} height={72} />
              </div>
            </CardContent>
          </Card>

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
                across {new Set(thisMonth.map((w) => w.activity_type)).size}{" "}
                activity type
                {new Set(thisMonth.map((w) => w.activity_type)).size !== 1
                  ? "s"
                  : ""}
                .
                {durationDelta !== null && (
                  <>
                    {" "}
                    Your average session duration has been{" "}
                    <span className="font-semibold text-text-primary">
                      {durationDelta > 0
                        ? "increasing"
                        : durationDelta < 0
                          ? "decreasing"
                          : "holding steady"}
                    </span>{" "}
                    compared to last week.
                  </>
                )}
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
