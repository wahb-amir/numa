import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { StatusChip } from "@/components/ui/status";
import { Sparkline } from "@/components/charts/sparkline";
import type { DailyMetrics } from "@/lib/types";
import type { Confidence, StatusLevel } from "@/lib/types";

interface Props {
  today: DailyMetrics;
  recent: DailyMetrics[]; // most-recent-last
}

function resolveStatus(score: number | null): StatusLevel {
  if (score === null) return "info";
  if (score >= 70) return "positive";
  if (score >= 50) return "attention";
  return "concerning";
}

function resolveConfidence(recent: DailyMetrics[]): Confidence {
  const missingCount = recent.filter((d) => d.recoveryScore === null).length;
  if (missingCount >= 3) return "low";
  if (missingCount >= 1) return "moderate";
  return "high";
}

export function TodayStateCard({ today, recent }: Props) {
  const status = resolveStatus(today.recoveryScore);
  const confidence = resolveConfidence(recent);
  const trend = recent.map((d) => d.recoveryScore);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Today&apos;s State
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              {today.recoveryScore !== null ? (
                <span className="text-editorial-num tabular text-text-primary">
                  {today.recoveryScore}
                </span>
              ) : (
                <span className="text-editorial-num text-text-muted">—</span>
              )}
              <span className="text-sm text-text-muted">/ 100 recovery</span>
            </div>
            <div className="mt-3">
              <StatusChip status={status}>
                {status === "positive"
                  ? "Well recovered"
                  : status === "attention"
                  ? "Moderate recovery"
                  : status === "concerning"
                  ? "Recovery is low"
                  : "No data logged"}
              </StatusChip>
            </div>
            <div className="mt-4">
              <ConfidenceBadge level={confidence} />
            </div>
          </div>

          <div className="min-w-[180px] flex-1 sm:max-w-xs">
            <p className="mb-2 text-xs font-medium text-text-muted">14-day trend</p>
            <Sparkline data={trend} height={64} />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-xs text-text-muted">Resting HR</dt>
            <dd className="tabular font-semibold text-text-primary">
              {today.restingHR ?? "—"} {today.restingHR && <span className="text-xs font-normal text-text-muted">bpm</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">HRV</dt>
            <dd className="tabular font-semibold text-text-primary">
              {today.hrv ?? "—"} {today.hrv && <span className="text-xs font-normal text-text-muted">ms</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Sleep</dt>
            <dd className="tabular font-semibold text-text-primary">
              {today.sleepHours ?? "—"} {today.sleepHours && <span className="text-xs font-normal text-text-muted">hrs</span>}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
