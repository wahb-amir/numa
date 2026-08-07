import { TopHeader } from "@/components/shell/top-header";
import { InsightFullCard } from "@/components/dashboard/insight-full-card";
import { insights } from "@/lib/mock-data";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Insights — Numa" };

export default function InsightsPage() {
  return (
    <div>
      <TopHeader title="Insights" subtitle="Patterns Numa has noticed in your data" />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-8 lg:py-8">
        {insights.map((insight) => (
          <InsightFullCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
