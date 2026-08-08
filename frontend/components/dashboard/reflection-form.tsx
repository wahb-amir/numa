"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { ApiWorkout, EnergyLevel, ActivityType } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EFFORT_LABELS = [
  "Very light",
  "Light",
  "Moderate",
  "Somewhat hard",
  "Hard",
  "Very hard",
  "Very very hard",
  "Almost max",
  "Max",
  "Beyond max",
];

const ENERGY_OPTIONS: { value: EnergyLevel; label: string; color: string }[] = [
  {
    value: "low",
    label: "Low",
    color:
      "text-status-concerning bg-status-concerning-soft border-status-concerning",
  },
  {
    value: "normal",
    label: "Normal",
    color:
      "text-status-attention  bg-status-attention-soft  border-status-attention",
  },
  {
    value: "high",
    label: "High",
    color:
      "text-status-positive   bg-status-positive-soft   border-status-positive",
  },
];

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  running: "Running",
  cycling: "Cycling",
  gym: "Gym",
  other: "Other",
};

function formatWorkoutOption(w: ApiWorkout): string {
  const date = new Date(w.start_time).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const mins = Math.round(w.duration_seconds / 60);
  return `${ACTIVITY_LABEL[w.activity_type]} — ${date} · ${mins} min`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ReflectionFormProps {
  /**
   * When supplied the workout selector is hidden and this ID is used directly.
   * Useful when the form is embedded inside a specific activity detail page.
   */
  workoutId?: string;
}

export function ReflectionForm({
  workoutId: propWorkoutId,
}: ReflectionFormProps = {}) {
  // --- workout list (only needed when no workoutId prop is supplied)
  const [workouts, setWorkouts] = useState<ApiWorkout[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(!propWorkoutId);
  const [workoutsError, setWorkoutsError] = useState<string | null>(null);

  // --- form state
  const [selectedId, setSelectedId] = useState<string>(propWorkoutId ?? "");
  const [effort, setEffort] = useState(5);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | "">("");
  const [note, setNote] = useState("");

  // --- submission state
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the last 20 workouts for the selector
  useEffect(() => {
    if (propWorkoutId) return; // No need to fetch — the caller already told us
    (async () => {
      try {
        const { data } = await api.get<ApiWorkout[]>("/workouts?limit=20");
        setWorkouts(data);
        if (data.length > 0 && data[0]) setSelectedId(data[0].id);
      } catch {
        setWorkoutsError("Could not load your recent workouts.");
      } finally {
        setLoadingWorkouts(false);
      }
    })();
  }, [propWorkoutId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;

    setLoading(true);
    setError(null);
    try {
      await api.post(`/workouts/${selectedId}/reflection`, {
        effort_rating: effort,
        energy_level: energyLevel || undefined,
        notes: note || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Failed to save reflection";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadingWorkouts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Log a Reflection</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 pt-0 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your workouts…
        </CardContent>
      </Card>
    );
  }

  if (workoutsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Log a Reflection</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-status-concerning">
          {workoutsError}
        </CardContent>
      </Card>
    );
  }

  // If there are no workouts from the API and no prop was passed, prompt to log one first.
  if (!propWorkoutId && workouts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Log a Reflection</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-text-muted">
          No workouts found. Log or upload a workout first, then come back to
          add a reflection.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a Reflection</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {submitted ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-control bg-status-positive-soft px-4 py-3 text-sm font-medium text-status-positive"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Reflection saved successfully.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded bg-status-concerning-soft px-4 py-3 text-sm text-status-concerning">
                {error}
              </div>
            )}

            {/* ── Workout selector (hidden when workoutId is pre-supplied) ── */}
            {!propWorkoutId && (
              <div>
                <label
                  htmlFor="reflection-workout"
                  className="text-sm font-medium text-text-primary"
                >
                  Workout
                </label>
                <p className="mt-0.5 text-xs text-text-muted">
                  Choose the session you want to reflect on.
                </p>
                <div className="relative mt-2">
                  <select
                    id="reflection-workout"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="w-full appearance-none rounded-control border border-border-strong bg-surface-base px-3 py-2 pr-8 text-sm text-text-primary focus-visible:outline-none"
                  >
                    {workouts.map((w) => (
                      <option key={w.id} value={w.id}>
                        {formatWorkoutOption(w)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                </div>
              </div>
            )}

            {/* ── Notes ── */}
            <div>
              <label
                htmlFor="reflection-note"
                className="text-sm font-medium text-text-primary"
              >
                How did it feel?
              </label>
              <p
                id="reflection-hint"
                className="mt-0.5 text-xs text-text-muted"
              >
                Subjective notes help Numa explain deviations that numbers alone
                can&apos;t.
              </p>
              <textarea
                id="reflection-note"
                aria-describedby="reflection-hint"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. Skipped breakfast, felt sluggish on the commute"
                className="mt-2 w-full rounded-control border border-border-strong bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none"
              />
            </div>

            {/* ── Perceived effort ── */}
            <fieldset>
              <legend className="text-sm font-medium text-text-primary">
                Perceived effort
              </legend>
              <div
                className="mt-2 flex items-center gap-1.5"
                role="radiogroup"
                aria-label="Perceived effort"
              >
                {EFFORT_LABELS.map((label, i) => {
                  const value = i + 1;
                  const active = effort === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      role="radio"
                      aria-checked={active}
                      aria-label={`${value} — ${label}`}
                      onClick={() => setEffort(value)}
                      className={`flex h-9 flex-1 items-center justify-center rounded-control border text-sm font-semibold transition-colors ${
                        active
                          ? "border-accent-emerald bg-accent-emerald text-text-inverse"
                          : "border-border-strong text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {effort} — {EFFORT_LABELS[effort - 1]}
              </p>
            </fieldset>

            {/* ── Energy level ── */}
            <fieldset>
              <legend className="text-sm font-medium text-text-primary">
                Energy level
              </legend>
              <div
                className="mt-2 flex gap-3"
                role="radiogroup"
                aria-label="Energy level"
              >
                {ENERGY_OPTIONS.map(({ value, label, color }) => {
                  const active = energyLevel === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setEnergyLevel(active ? "" : value)}
                      className={`flex-1 rounded-control border px-3 py-2 text-sm font-semibold transition-colors ${
                        active
                          ? color
                          : "border-border-strong text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Button type="submit" disabled={loading || !selectedId}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save reflection
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
