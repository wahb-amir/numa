import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { StatusChip } from "@/components/ui/status";
import type { Insight } from "@/lib/types";

export function InsightFullCard({ insight }: { insight: Insight }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {insight.relatedMetric}
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-snug text-text-primary">
              {insight.title}
            </h3>
          </div>
          <StatusChip status={insight.status} />
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Observation
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-text-primary">
              {insight.observation}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Supporting Evidence
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {insight.evidence.map((e, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-text-secondary"
                >
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted"
                    aria-hidden="true"
                  />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Alternative Explanations
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {insight.alternatives.map((a, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-text-secondary"
              >
                <span
                  className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted"
                  aria-hidden="true"
                />
                {a}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <ConfidenceBadge level={insight.confidence} />
          <p className="text-xs italic text-text-muted">
            Language reflects likelihood, not certainty
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
