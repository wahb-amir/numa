"use client";

import { Sparkles } from "lucide-react";

const SUGGESTED_PROMPTS: Array<{
  title: string;
  prompt: string;
  description: string;
}> = [
  {
    title: "Why was my heart rate high?",
    prompt: "Why was my heart rate high on my last run?",
    description: "Deviation · uses your focus workout + baselines",
  },
  {
    title: "Am I training too much?",
    prompt: "Am I training too much right now?",
    description: "Load · pulls in your last 7 reflections",
  },
  {
    title: "How has my pace changed?",
    prompt: "How is my pace changing over the past few months?",
    description: "Trend · month-over-month progress",
  },
  {
    title: "Does sleep affect my pace?",
    prompt: "How does my sleep affect my running pace?",
    description: "Pattern · uses verified correlations",
  },
];

/**
 * Centered hero for an empty chat. Renders only when there's no
 * active session — the parent routes the two cases. Suggested prompts
 * are 2×2 on sm+ and stack on smaller screens.
 */
export function ChatGreeting({
  displayName,
  onSelectPrompt,
}: {
  displayName?: string | null;
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div
          aria-hidden="true"
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-accent-emerald-soft text-accent-emerald"
        >
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-display-md text-text-primary">
          {displayName ? `Ask Numa, ${displayName}` : "Ask Numa"}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Look at your training, recovery, and reflections through one
          grounded lens. Every answer cites the data behind it.
        </p>

        <ul
          className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2"
          aria-label="Suggested questions"
        >
          {SUGGESTED_PROMPTS.map((p) => (
            <li key={p.prompt}>
              <button
                type="button"
                onClick={() => onSelectPrompt(p.prompt)}
                className="group flex h-full w-full flex-col items-start gap-1 rounded-card border border-border bg-surface-raised p-4 text-left transition-shadow hover:shadow-elevation-2"
              >
                <span className="text-sm font-semibold text-text-primary">
                  {p.title}
                </span>
                <span className="text-xs text-text-muted">
                  {p.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}