"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload, Dumbbell, Clock, Activity } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { StatusDot } from "@/components/ui/status";
import { getWorkouts } from "@/lib/api-client";
import type { ApiWorkout, TimelineEvent, StatusLevel } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function workoutsToTimeline(workouts: ApiWorkout[]): TimelineEvent[] {
  return workouts.map((w) => {
    const mins = Math.round(w.duration_seconds / 60);
    const reflection = w.reflections?.[0];
    const detail = reflection?.notes
      ? reflection.notes
      : `${w.activity_type.charAt(0).toUpperCase() + w.activity_type.slice(1)} · ${mins} min`;

    const status: StatusLevel =
      reflection?.effort_rating != null && reflection.effort_rating >= 8
        ? "attention"
        : reflection?.effort_rating != null && reflection.effort_rating <= 4
          ? "positive"
          : "info";

    return {
      id: w.id,
      dateIndex: Math.floor(
        (Date.now() - new Date(w.start_time).getTime()) / 86400000,
      ),
      date: new Date(w.start_time),
      category: "workout" as TimelineEvent["category"],
      title: `${w.activity_type.charAt(0).toUpperCase() + w.activity_type.slice(1)} — ${mins} min`,
      detail,
      status,
    };
  });
}

function formatDayLabel(daysAgo: number, date: Date): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8 animate-pulse">
      <ol className="relative border-l border-border pl-6 space-y-8">
        {[1, 2, 3, 4].map((i) => (
          <li key={i}>
            <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-surface-sunken" />
            <div className="h-4 w-24 rounded bg-surface-sunken mb-3" />
            <div className="h-16 rounded-card bg-surface-sunken" />
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const workouts = await getWorkouts(100);
        if (!cancelled) {
          const timeline = workoutsToTimeline(workouts);
          setEvents(timeline);
        }
      } catch {
        if (!cancelled)
          setError("Could not load timeline data from the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group events by daysAgo
  const groups = new Map<number, TimelineEvent[]>();
  for (const e of events) {
    const arr = groups.get(e.dateIndex) ?? [];
    arr.push(e);
    groups.set(e.dateIndex, arr);
  }
  // Sort groups ascending by daysAgo desc (most recent first)
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div>
      <TopHeader
        title="Timeline"
        subtitle="A chronological ledger of everything Numa has logged"
      />

      {loading && <Skeleton />}

      {!loading && error && (
        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="rounded-card border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            {error}
          </div>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-raised py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-emerald-soft">
              <Activity className="h-6 w-6 text-accent-emerald" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-text-primary">
              Your timeline is empty
            </h2>
            <p className="mt-2 max-w-sm text-sm text-text-secondary">
              Every workout you upload will appear here in chronological order.
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

      {!loading && !error && events.length > 0 && (
        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
          <ol className="relative border-l border-border pl-6">
            {sortedGroups.map(([daysAgo, dayEvents]) => (
              <li key={daysAgo} className="mb-8 last:mb-0">
                <div
                  className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent-emerald"
                  aria-hidden="true"
                />
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {formatDayLabel(daysAgo, dayEvents[0]!.date)}
                </p>
                <ul className="space-y-3">
                  {dayEvents.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 rounded-card border border-border bg-surface-raised p-4"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text-secondary">
                        <Dumbbell className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">
                            {e.title}
                          </p>
                          <StatusDot status={e.status} />
                        </div>
                        <p className="mt-0.5 text-sm text-text-secondary">
                          {e.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
