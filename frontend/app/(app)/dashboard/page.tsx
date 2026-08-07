import { TopHeader } from "@/components/shell/top-header";
import { TodayStateCard } from "@/components/dashboard/today-state-card";
import { WhatChanged } from "@/components/dashboard/what-changed";
import { AIInsightCard } from "@/components/dashboard/ai-insight-card";
import { dailyMetrics, today, insights } from "@/lib/mock-data";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard — Numa" };

export default function DashboardPage() {
  const recent14 = dailyMetrics.slice(-14);

  return (
    <div>
      <TopHeader title="Dashboard" subtitle="How you're doing right now" />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <TodayStateCard today={today} recent={recent14} />
        <div className="grid gap-6 lg:grid-cols-2">
          <WhatChanged />
          {insights[0] && <AIInsightCard insight={insights[0]} />}
        </div>
      </div>
    </div>
  );
}
