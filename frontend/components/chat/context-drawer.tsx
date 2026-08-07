import { Database } from "lucide-react";

const CONTEXT_SOURCES = ["Recent workouts (30d)", "Sleep history", "Recovery trend", "Current goal: Base building"];

export function ContextDrawer() {
  return (
    <div className="border-b border-border bg-surface-sunken px-4 py-3 lg:px-8">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          Using:
        </div>
        {CONTEXT_SOURCES.map((s) => (
          <span
            key={s}
            className="rounded-chip border border-border-strong bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-secondary"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
