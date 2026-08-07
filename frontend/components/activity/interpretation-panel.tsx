import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { Sparkles } from "lucide-react";
import type { Workout } from "@/lib/types";

export function InterpretationPanel({ workout }: { workout: Workout }) {
  const delta = workout.baselineDeltaPct ?? 0;
  const slower = delta < -5;

  return (
    <Card className="border-accent-emerald/20 bg-accent-emerald-soft/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-emerald" aria-hidden="true" />
          <CardTitle className="text-accent-emerald">Numa&apos;s Interpretation</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <p className="text-sm leading-relaxed text-text-primary">
          {slower
            ? `This session was ${Math.abs(delta)}% off your personal baseline. That appears related to reduced sleep and elevated training load in the two days prior — not a standalone sign of declining fitness.`
            : `This session was in line with, or ahead of, your personal baseline, consistent with your recent recovery trend.`}
        </p>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Cross-referenced with</p>
          <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
            <li>· Sleep duration over the prior 2 nights</li>
            <li>· 7-day rolling training load</li>
            <li>· Your logged perceived effort for this session</li>
          </ul>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <ConfidenceBadge level={slower ? "moderate" : "high"} />
          <p className="text-xs italic text-text-muted">Possible contributor, not a confirmed cause</p>
        </div>
      </CardContent>
    </Card>
  );
}
