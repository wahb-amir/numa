"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { TodayStateCard } from "@/components/dashboard/today-state-card";
import { WhatChanged } from "@/components/dashboard/what-changed";
import { AIInsightCard } from "@/components/dashboard/ai-insight-card";
import { getWorkouts, getBaselines } from "@/lib/api-client";
import type { ApiWorkout, ApiBaseline, DailyMetrics, Insight } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function workoutToTodayMetrics(w: ApiWorkout): DailyMetrics {
  const m = w.metrics as Record<string, number | null>;
  return {
    dateIndex: 0,
    date: new Date(w.start_time),
    recoveryScore: typeof m?.recovery_score === "number" ? m.recovery_score : null,
    restingHR: typeof m?.resting_hr === "number" ? m.resting_hr : null,
    hrv: typeof m?.hrv === "number" ? m.hrv : null,
    sleepHours: typeof m?.sleep_hours === "number" ? m.sleep_hours : null,
    sleepQuality: null,
    trainingLoad: typeof m?.training_load === "number" ? m.training_load : null,
    note: null,
    effort: w.reflections?.[0]?.effort_rating ?? null,
  };
}

/** Build a last-14-day trend from recent workouts (one entry per calendar day). */
function buildTrend(workouts: ApiWorkout[]): DailyMetrics[] {
  const trend: DailyMetrics[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const match = workouts.find(
      (w) => w.start_time.slice(0, 10) === dateStr
    );
    const m = (match?.metrics ?? {}) as Record<string, number | null>;
    trend.push({
      dateIndex: i,
      date: d,
      recoveryScore: typeof m?.recovery_score === "number" ? m.recovery_score : null,
      restingHR: null,
      hrv: null,
      sleepHours: null,
      sleepQuality: null,
      trainingLoad: null,
      note: null,
      effort: null,
    });
  }
  return trend;
}

/** Build a placeholder Insight from baselines when no real insight endpoint exists. */
function insightFromBaselines(baselines: ApiBaseline[]): Insight | null {
  if (!baselines.length) return null;
  const first = baselines[0]!;
  return {
    id: "baseline-insight",
    title: "Your baselines have been computed",
    observation: `Numa has analysed ${baselines.length} baseline metric${baselines.length > 1 ? "s" : ""} across your recorded activities. Upload more data to generate personalised pattern insights.`,
    evidence: baselines.slice(0, 3).map(
      (b) => `${b.activity_type} · ${b.metric_name}: ${Math.round(b.value)} (${b.sample_count} sessions)`
    ),
    confidence: "moderate",
    alternatives: ["More sessions will improve accuracy"],
    relatedMetric: first.metric_name,
    status: "info",
  };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-8 animate-pulse">
      <div className="h-36 rounded-card bg-surface-sunken" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-52 rounded-card bg-surface-sunken" />
        <div className="h-52 rounded-card bg-surface-sunken" />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-raised py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-emerald-soft">
          <Upload className="h-6 w-6 text-accent-emerald" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-text-primary">No data yet</h2>
        <p className="mt-2 max-w-sm text-sm text-text-secondary">
          Upload a CSV or GPX export from your wearable or fitness app and Numa will start
          building your personal health context.
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<ApiWorkout[]>([]);
  const [baselines, setBaselines] = useState<ApiBaseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, b] = await Promise.all([getWorkouts(50), getBaselines()]);
        if (!cancelled) {
          setWorkouts(w);
          setBaselines(b);
        }
      } catch {
        if (!cancelled) setError("Could not reach the server. Check that the backend is running.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const mostRecent = workouts[0];
  const today = mostRecent ? workoutToTodayMetrics(mostRecent) : null;
  const trend = buildTrend(workouts);
  const insight = insightFromBaselines(baselines);

  return (
    <div>
      <TopHeader title="Dashboard" subtitle="How you're doing right now" />

      {loading && <Skeleton />}

      {!loading && error && (
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="rounded-card border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            {error}
          </div>
        </div>
      )}

      {!loading && !error && !today && <EmptyState />}

      {!loading && !error && today && (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
          {/* Quick-access upload banner when user has < 3 workouts */}
          {workouts.length < 3 && (
            <Link
              href="/upload"
              className="flex items-center gap-3 rounded-card border border-accent-emerald/30 bg-accent-emerald-soft/30 px-5 py-3 text-sm text-accent-emerald hover:bg-accent-emerald-soft/60 transition-colors"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold">Upload more data</span> — Numa gets smarter with
                every session you add.
              </span>
            </Link>
          )}

          <TodayStateCard today={today} recent={trend} />

          <div className="grid gap-6 lg:grid-cols-2">
            <WhatChanged baselines={baselines} latestWorkout={mostRecent} />
            {insight && <AIInsightCard insight={insight} />}
          </div>
        </div>
      )}
    </div>
  );
}
