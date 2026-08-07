import { TopHeader } from "@/components/shell/top-header";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityListItem } from "@/components/activity/activity-list-item";
import { workouts } from "@/lib/mock-data";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activity — Numa" };

export default function ActivityPage() {
  const sorted = [...workouts].sort((a, b) => a.dateIndex - b.dateIndex);

  return (
    <div>
      <TopHeader title="Activity" subtitle={`${sorted.length} sessions logged in the last 30 days`} />
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
        <Card>
          <CardContent className="p-2">
            <ul className="divide-y divide-border">
              {sorted.map((w) => (
                <ActivityListItem key={w.id} workout={w} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
