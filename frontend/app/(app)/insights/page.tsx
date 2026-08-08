"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Upload, ArrowRight } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { Card, CardContent } from "@/components/ui/card";
import { getBaselines, getWorkouts } from "@/lib/api-client";
import type { ApiBaseline } from "@/lib/types";

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-8 lg:py-8 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-44 rounded-card bg-surface-sunken" />
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ hasWorkouts }: { hasWorkouts: boolean }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="rounded-card border border-accent-emerald/20 bg-accent-emerald-soft/30 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-emerald-soft">
          <Sparkles className="h-6 w-6 text-accent-emerald" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-text-primary">
          No insights yet
        </h2>
        <p className="mt-2 max-w-md mx-auto text-sm text-text-secondary">
          {hasWorkouts
            ? "Numa needs more sessions before it can detect reliable patterns. Keep logging workouts and check back after a few more uploads."
            : "Upload your workout data and Numa will start identifying patterns across your sessions, sleep, and recovery metrics."}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-control bg-accent-emerald px-5 py-2.5 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {hasWorkouts ? "Upload more data" : "Upload your data"}
          </Link>
          {hasWorkouts && (
            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-emerald hover:underline"
            >
              View reports instead
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {/* How insights work explainer */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            step: "01",
            title: "Upload your data",
            body: "Export a CSV or GPX file from your wearable, Strava, or Garmin and drop it in.",
          },
          {
            step: "02",
            title: "Numa analyses patterns",
            body: "Our engine correlates sleep, load, heart rate, and pace across your sessions.",
          },
          {
            step: "03",
            title: "Insights appear here",
            body: "Observations are shown with supporting evidence and alternative explanations.",
          },
        ].map(({ step, title, body }) => (
          <div
            key={step}
            className="rounded-card border border-border bg-surface-raised p-5"
          >
            <p className="text-xs font-bold text-accent-emerald">{step}</p>
            <p className="mt-2 text-sm font-semibold text-text-primary">
              {title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
              {body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Baseline card (fallback when no deep insights but baselines exist) ───────

function BaselineCard({ baseline }: { baseline: ApiBaseline }) {
  const formattedMetric = baseline.metric_name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const formattedActivity =
    baseline.activity_type.charAt(0).toUpperCase() +
    baseline.activity_type.slice(1);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {formattedActivity} · Baseline
            </p>
            <h3 className="mt-1 text-base font-semibold text-text-primary">
              {formattedMetric}
            </h3>
          </div>
          <span className="rounded-chip border border-border-strong bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-muted">
            {baseline.sample_count} sessions
          </span>
        </div>
        <p className="mt-4 text-sm text-text-secondary">
          Your personal baseline for{" "}
          <span className="font-semibold text-text-primary">
            {formattedMetric.toLowerCase()}
          </span>{" "}
          during {formattedActivity.toLowerCase()} is{" "}
          <span className="font-semibold text-text-primary">
            {Math.round(baseline.value)}
          </span>
          . Computed from {baseline.sample_count} logged session
          {baseline.sample_count !== 1 ? "s" : ""}.
        </p>
        <p className="mt-1 text-xs italic text-text-muted">
          Pattern insights unlock as more sessions are added.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [baselines, setBaselines] = useState<ApiBaseline[]>([]);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bl, workouts] = await Promise.all([
          getBaselines(),
          getWorkouts(1),
        ]);
        if (!cancelled) {
          setBaselines(bl);
          setWorkoutCount(workouts.length);
        }
      } catch {
        if (!cancelled) setError("Could not load data from the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <TopHeader
        title="Insights"
        subtitle="Patterns Numa has noticed in your data"
      />

      {loading && <Skeleton />}

      {!loading && error && (
        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="rounded-card border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            {error}
          </div>
        </div>
      )}

      {/* No baselines at all → full empty state */}
      {!loading && !error && baselines.length === 0 && (
        <EmptyState hasWorkouts={workoutCount > 0} />
      )}

      {/* Baselines exist but no deep pattern insights yet */}
      {!loading && !error && baselines.length > 0 && (
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-8 lg:py-8">
          {/* Explainer banner */}
          <div className="flex items-start gap-3 rounded-card border border-accent-emerald/20 bg-accent-emerald-soft/30 px-5 py-4">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-emerald"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-accent-emerald">
                Baselines computed
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Your personal baselines are active below. Pattern-level insights
                appear once Numa has enough cross-metric data to draw reliable
                conclusions.{" "}
                <Link
                  href="/upload"
                  className="font-semibold text-accent-emerald hover:underline"
                >
                  Upload more data →
                </Link>
              </p>
            </div>
          </div>

          {baselines.map((b) => (
            <BaselineCard key={b.id} baseline={b} />
          ))}
        </div>
      )}
    </div>
  );
}
