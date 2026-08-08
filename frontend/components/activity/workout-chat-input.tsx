"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkoutChatInput({ workoutTitle }: { workoutTitle: string }) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setSent(value.trim());
    setValue("");
  }

  return (
    <div className="rounded-card border border-border bg-surface-sunken p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Ask about this workout
      </p>
      {sent && (
        <div className="mt-3 rounded-control border border-border bg-surface-raised p-3 text-sm">
          <p className="font-medium text-text-primary">&ldquo;{sent}&rdquo;</p>
          <p className="mt-2 text-text-secondary">
            Numa would answer using this session&apos;s data plus your
            surrounding sleep and training history — try the full conversation
            in{" "}
            <a
              href="/chat"
              className="font-semibold text-accent-emerald hover:underline"
            >
              Chat
            </a>
            .
          </p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <label htmlFor="workout-question" className="sr-only">
          {`Ask a question about ${workoutTitle}`}
        </label>
        <input
          id="workout-question"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`e.g. Why did this run feel harder than usual?`}
          className="flex-1 rounded-control border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none min-h-[44px]"
        />
        <Button type="submit" size="default" aria-label="Send question">
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
