import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { Sparkles, ArrowRight } from "lucide-react";
import type { Insight } from "@/lib/types";

export function AIInsightCard({ insight }: { insight: Insight }) {
  return (
    <Card className="border-accent-emerald/20 bg-accent-emerald-soft/40">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-raised text-accent-emerald shadow-elevation-1">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent-emerald">
              Numa Insight
            </p>
            <h3 className="mt-1 text-base font-semibold leading-snug text-text-primary">
              {insight.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{insight.observation}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <ConfidenceBadge level={insight.confidence} />
              <Link
                href="/insights"
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent-emerald hover:underline"
              >
                See full reasoning
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
