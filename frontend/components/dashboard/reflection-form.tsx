"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const EFFORT_LABELS = ["Very light", "Light", "Moderate", "Somewhat hard", "Hard", "Very hard"];

export function ReflectionForm() {
  const [note, setNote] = useState("");
  const [effort, setEffort] = useState(3);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
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
            Reflection saved to today&apos;s log.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reflection-note" className="text-sm font-medium text-text-primary">
                How did today feel?
              </label>
              <p id="reflection-hint" className="mt-0.5 text-xs text-text-muted">
                Subjective notes help Numa explain deviations that numbers alone can&apos;t.
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

            <fieldset>
              <legend className="text-sm font-medium text-text-primary">Perceived effort today</legend>
              <div className="mt-2 flex items-center gap-2" role="radiogroup" aria-label="Perceived effort today">
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
                      className={`flex h-9 min-w-[36px] flex-1 items-center justify-center rounded-control border text-sm font-semibold transition-colors ${
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
              <p className="mt-1 text-xs text-text-muted">{EFFORT_LABELS[effort - 1]}</p>
            </fieldset>

            <Button type="submit">Save reflection</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
