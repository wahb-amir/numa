import { TopHeader } from "@/components/shell/top-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { MetricStat } from "@/components/ui/metric-stat";
import { dailyMetrics, workouts } from "@/lib/mock-data";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports — Numa" };

function average(nums: (number | null)[]) {
  const valid = nums.filter((n): n is number => n !== null);
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

export default function ReportsPage() {
  const last7 = dailyMetrics.slice(-7);
  const prev7 = dailyMetrics.slice(-14, -7);

  const avgRecoveryThisWeek = average(last7.map((d) => d.recoveryScore));
  const avgRecoveryLastWeek = average(prev7.map((d) => d.recoveryScore));
  const avgSleepThisWeek = average(last7.map((d) => d.sleepHours));
  const weekWorkouts = workouts.filter((w) => w.dateIndex < 7);
  const monthWorkouts = workouts;

  const recoveryDelta =
    avgRecoveryThisWeek !== null && avgRecoveryLastWeek !== null
      ? Math.round((avgRecoveryThisWeek - avgRecoveryLastWeek) * 10) / 10
      : null;

  return (
    <div>
      <TopHeader title="Reports" subtitle="Aggregated intelligence across weeks and months" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <Card>
          <CardHeader>
            <CardTitle>This Week vs. Last Week</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricStat
                label="Avg. recovery"
                value={avgRecoveryThisWeek}
                unit="/100"
                hint={
                  recoveryDelta === null
                    ? undefined
                    : `${recoveryDelta > 0 ? "+" : ""}${recoveryDelta} vs. last week`
                }
              />
              <MetricStat label="Avg. sleep" value={avgSleepThisWeek} unit="hrs" />
              <MetricStat label="Sessions logged" value={weekWorkouts.length} />
              <MetricStat
                label="Total training time"
                value={weekWorkouts.reduce((sum, w) => sum + w.durationMin, 0)}
                unit="min"
              />
            </div>
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium text-text-muted">30-day recovery trend</p>
              <Sparkline data={dailyMetrics.map((d) => d.recoveryScore)} height={72} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <p className="text-sm leading-relaxed text-text-secondary">
              Over the last 30 days you logged{" "}
              <span className="font-semibold text-text-primary">{monthWorkouts.length} sessions</span>{" "}
              across {new Set(monthWorkouts.map((w) => w.type)).size} activity types. Your recovery
              trend has been{" "}
              <span className="font-semibold text-text-primary">
                {recoveryDelta !== null && recoveryDelta > 0 ? "improving" : "holding steady"}
              </span>
              , with short-sleep nights appearing as the most consistent contributor to lower recovery
              days — see Insights for the full reasoning.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(["Run", "Ride", "Strength", "Swim", "Mobility"] as const).map((type) => {
                const count = monthWorkouts.filter((w) => w.type === type).length;
                if (!count) return null;
                return <MetricStat key={type} label={type} value={count} unit="sessions" />;
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
