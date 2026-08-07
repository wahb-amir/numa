import { TopHeader } from "@/components/shell/top-header";
import { MetricStat } from "@/components/ui/metric-stat";
import { ReflectionForm } from "@/components/dashboard/reflection-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { today, dailyMetrics } from "@/lib/mock-data";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Today — Numa" };

export default function TodayPage() {
  const last7 = dailyMetrics.slice(-7).reverse();

  return (
    <div>
      <TopHeader title="Today" subtitle="Granular metrics for your current day" />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricStat label="Recovery" value={today.recoveryScore} unit="/100" />
          <MetricStat label="Resting HR" value={today.restingHR} unit="bpm" />
          <MetricStat label="HRV" value={today.hrv} unit="ms" />
          <MetricStat label="Sleep" value={today.sleepHours} unit="hrs" />
          <MetricStat
            label="Sleep quality"
            value={today.sleepQuality ? today.sleepQuality[0]?.toUpperCase() + today.sleepQuality.slice(1) : null}
          />
          <MetricStat label="Training load" value={today.trainingLoad} unit="/100" />
        </div>

        <ReflectionForm />

        <Card>
          <CardHeader>
            <CardTitle>Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Day</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Recovery</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Sleep</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Resting HR</th>
                    <th scope="col" className="py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {last7.map((d) => (
                    <tr key={d.dateIndex}>
                      <td className="py-2.5 pr-4 font-medium text-text-primary">
                        {d.dateIndex === 0 ? "Today" : d.dateIndex === 1 ? "Yesterday" : d.date.toLocaleDateString("en-US", { weekday: "short" })}
                      </td>
                      <td className="py-2.5 pr-4 tabular text-text-secondary">{d.recoveryScore ?? "—"}</td>
                      <td className="py-2.5 pr-4 tabular text-text-secondary">{d.sleepHours ?? "—"}</td>
                      <td className="py-2.5 pr-4 tabular text-text-secondary">{d.restingHR ?? "—"}</td>
                      <td className="py-2.5 text-text-muted">{d.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
