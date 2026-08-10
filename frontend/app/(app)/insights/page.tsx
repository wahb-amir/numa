"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Upload, ArrowRight } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { Card, CardContent } from "@/components/ui/card";
import { getBaselines, getWorkouts, getPatterns } from "@/lib/api-client";
import type {
  ApiBaseline,
  ApiDiscoveredPattern,
} from "@/lib/types";

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

// ─── Pattern card (the Phase 2 winner) ───────────────────────────────────────

function PatternCard({ pattern }: { pattern: ApiDiscoveredPattern }) {
  const absR = Math.abs(pattern.pearson_r);
  const confidence =
    absR >= 0.6 && pattern.sample_count >= 15
      ? "high"
      : absR >= 0.45 && pattern.sample_count >= 8
        ? "moderate"
        : "low";

  const titleCaseName = pattern.check_name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {pattern.activity_type ?? "Cross-activity"} · Pattern
            </p>
            <h3 className="mt-1 text-base font-semibold text-text-primary">
              {titleCaseName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-chip border border-border-strong bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-muted">
              {pattern.sample_count} sessions
            </span>
            <span
              className={
                "rounded-chip px-2 py-0.5 text-xs font-medium " +
                (confidence === "high"
                  ? "bg-status-positive-soft text-status-positive"
                  : confidence === "moderate"
                    ? "bg-accent-emerald-soft text-accent-emerald"
                    : "bg-surface-sunken text-text-muted")
              }
            >
              {confidence} confidence
            </span>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          {pattern.template_summary}
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-text-muted">
          <li>
            • Pearson r = {pattern.pearson_r.toFixed(2)} (
            {pattern.direction === "positive" ? "positive" : "negative"}{" "}
            correlation)
          </li>
          <li>• Threshold: |r| ≥ {pattern.threshold.toFixed(2)}</li>
        </ul>
        <p className="mt-3 text-xs italic text-text-muted">
          Correlation is not causation — these patterns are observations,
          not prescriptions.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Baseline card (fallback when no deep patterns yet) ───────────────────────

function BaselineCard({ baseline }: { baseline: ApiBaseline }) {
  const formattedMetric = baseline.metric_name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const formattedActivity =
    baseline.activity_type.charAt(0).toUpperCase() +
    baseline.activity_type.slice(1);
  const windowLabel = baseline.window_days === 14 ? "14-day" : "90-day";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {formattedActivity} · {windowLabel} baseline
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
          <span className="font-semibold text-text-primary tabular">
            {Math.round(baseline.rolling_mean)}
          </span>
          {" "}±{" "}
          <span className="text-text-primary tabular">
            {Math.round(baseline.rolling_stddev)}
          </span>
          . Computed from {baseline.sample_count} logged session
          {baseline.sample_count !== 1 ? "s" : ""}.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [baselines, setBaselines] = useState<ApiBaseline[]>([]);
  const [patterns, setPatterns] = useState<ApiDiscoveredPattern[]>([]);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bl, p, workouts] = await Promise.all([
          getBaselines(),
          getPatterns(),
          getWorkouts(1),
        ]);
        if (!cancelled) {
          setBaselines(bl);
          setPatterns(p);
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

  const showPatterns = patterns.length > 0;
  const showBaselines = baselines.length > 0;

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

      {/* Nothing at all → empty state */}
      {!loading && !error && !showPatterns && !showBaselines && (
        <EmptyState hasWorkouts={workoutCount > 0} />
      )}

      {/* Patterns exist — these are the headline */}
      {!loading && !error && showPatterns && (
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-8 lg:py-8">
          <div className="flex items-start gap-3 rounded-card border border-accent-emerald/20 bg-accent-emerald-soft/30 px-5 py-4">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-emerald"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-accent-emerald">
                Verified patterns
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                These patterns passed a statistical test on at least 8 of
                your sessions. They are observations, not prescriptions.
              </p>
            </div>
          </div>

          {patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} />
          ))}

          {/* Baselines behind the patterns — collapsible-ish, but we
              just render them under the banner for now. */}
          {showBaselines && (
            <>
              <div className="pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Supporting baselines
                </p>
              </div>
              {baselines.map((b) => (
                <BaselineCard key={b.id} baseline={b} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Baselines only (no patterns yet — user needs more history) */}
      {!loading && !error && !showPatterns && showBaselines && (
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-8 lg:py-8">
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