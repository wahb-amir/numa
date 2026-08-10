"use client";

import { useState } from "react";
import { ChevronDown, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiNarrationSources } from "@/lib/types";

/**
 * "View the data" disclosure on a chat message.
 *
 * Collapsed by default. When opened, shows the structured numbers /
 * patterns / dated notes / progress that the narration model was
 * given — every claim in the prose can be traced back to one of
 * these. The user can collapse it back to keep the chat readable.
 *
 * This exists because the LLM is a narrator, not an analyst — it
 * must never invent statistics. Showing the source data lets the
 * user audit the claim directly.
 */
export function ChatSourcesDisclosure({
  sources,
}: {
  sources: ApiNarrationSources;
}) {
  const [open, setOpen] = useState(false);

  // Empty progress array is normal (only populated for trend
  // questions). Everything else being empty is rare and means the
  // narrator had nothing to work with — we still show the section so
  // the user sees "no data" rather than a missing block.
  const hasComparisons = sources.comparisons.length > 0;
  const hasPatterns = sources.patterns.length > 0;
  const hasNotes = sources.notes.length > 0;
  const hasProgress = sources.progress.length > 0;
  const nothingToShow =
    !hasComparisons && !hasPatterns && !hasNotes && !hasProgress;

  return (
    <div className="border-t border-border pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="chat-sources-panel"
        className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
      >
        <span className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          {open ? "Hide the data" : "View the data"}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="chat-sources-panel"
          className="mt-2 space-y-3 rounded-control border border-border bg-surface-sunken px-3 py-2.5 text-xs"
        >
          {nothingToShow && (
            <p className="italic text-text-muted">
              No structured data was available for this response.
            </p>
          )}

          {hasComparisons && (
            <SourcesSection title="Focus workout vs 14-day baseline">
              <table className="w-full text-left text-[11px]">
                <thead className="text-text-muted">
                  <tr>
                    <th className="pb-1 pr-2 font-medium">Metric</th>
                    <th className="pb-1 pr-2 font-medium">Today</th>
                    <th className="pb-1 pr-2 font-medium">Baseline</th>
                    <th className="pb-1 pr-2 font-medium">Deviation</th>
                    <th className="pb-1 font-medium">Bucket</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  {sources.comparisons.map((c) => (
                    <tr key={c.metric_name} className="border-t border-border/60">
                      <td className="py-1 pr-2 font-medium text-text-primary">
                        {c.metric_label}
                      </td>
                      <td className="py-1 pr-2 tabular-nums">
                        {formatValue(c.value, c.unit)}
                      </td>
                      <td className="py-1 pr-2 tabular-nums">
                        {formatValue(c.baseline_mean, c.unit)} ±{" "}
                        {formatValue(c.baseline_stddev, c.unit)}
                      </td>
                      <td className="py-1 pr-2 tabular-nums">
                        {c.deviation_pct !== null
                          ? `${c.deviation_pct >= 0 ? "+" : ""}${c.deviation_pct.toFixed(1)}%`
                          : "n/a"}
                      </td>
                      <td className="py-1">
                        <BucketPill label={c.label} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SourcesSection>
          )}

          {hasPatterns && (
            <SourcesSection title="Verified patterns">
              <ul className="space-y-1.5">
                {sources.patterns.map((p) => (
                  <li key={p.check_name}>
                    <span className="font-medium text-text-primary">
                      {p.check_name}
                    </span>
                    <span className="ml-1 tabular-nums text-text-muted">
                      r={p.pearson_r.toFixed(2)}, n={p.sample_count}
                    </span>
                    <p className="mt-0.5 text-text-secondary">
                      {p.template_summary}
                    </p>
                  </li>
                ))}
              </ul>
            </SourcesSection>
          )}

          {hasNotes && (
            <SourcesSection title="Reflection notes">
              <ul className="space-y-1">
                {sources.notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-text-muted">
                      {n.date}
                    </span>
                    <span className="text-text-secondary">&ldquo;{n.note}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </SourcesSection>
          )}

          {hasProgress && (
            <SourcesSection title="Progress over the past months">
              <ul className="space-y-1.5">
                {sources.progress.map((p) => (
                  <li key={`${p.activity_type}-${p.metric_name}`}>
                    <span className="font-medium text-text-primary">
                      {p.metric_label} ({p.activity_type})
                    </span>
                    <span className="ml-1.5 text-text-secondary">
                      {p.direction}
                      {p.pct_change !== null &&
                        `, ${p.pct_change >= 0 ? "+" : ""}${p.pct_change.toFixed(1)}%`}
                    </span>
                    <span className="ml-1.5 text-text-muted">
                      ({p.confidence} confidence, {p.earliest_month} →{" "}
                      {p.latest_month})
                    </span>
                  </li>
                ))}
              </ul>
            </SourcesSection>
          )}
        </div>
      )}
    </div>
  );
}

function SourcesSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function BucketPill({ label }: { label: string }) {
  // Map the same z-bucket the comparison endpoint uses to a small
  // color hint, so a glance at the table tells the user which rows
  // are off-baseline.
  const tone =
    label === "typical"
      ? "bg-status-positive-soft text-status-positive"
      : label === "somewhat_above" || label === "somewhat_below"
        ? "bg-status-attention-soft text-status-attention"
        : label === "notably_above" || label === "notably_below"
          ? "bg-status-concerning-soft text-status-concerning"
          : "bg-surface-base text-text-muted";

  return (
    <span
      className={cn(
        "inline-block rounded-chip px-1.5 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

/**
 * Format a numeric value with up to 2 decimals, dropping trailing
 * zeros. Unit suffix omitted when value is 0 to keep the table tight.
 */
function formatValue(value: number, unit: string): string {
  const formatted = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${formatted} ${unit}` : formatted;
}