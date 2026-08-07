import { notFound } from "next/navigation";
import { TopHeader } from "@/components/shell/top-header";
import { MetricStat } from "@/components/ui/metric-stat";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { InterpretationPanel } from "@/components/activity/interpretation-panel";
import { WorkoutChatInput } from "@/components/activity/workout-chat-input";
import { getWorkoutById, workouts } from "@/lib/mock-data";
import { formatDayLabel } from "@/lib/utils";
import type { Metadata } from "next";

export function generateStaticParams() {
  return workouts.map((w) => ({ id: w.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const workout = getWorkoutById(id);
  return { title: workout ? `${workout.title} — Numa` : "Activity — Numa" };
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workout = getWorkoutById(id);
  if (!workout) notFound();

  return (
    <div>
      <TopHeader title={workout.title} subtitle={formatDayLabel(workout.dateIndex)} />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <Card>
          <CardHeader>
            <CardTitle>Objective Metrics</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricStat label="Duration" value={workout.durationMin} unit="min" />
              <MetricStat label="Distance" value={workout.distanceKm} unit="km" />
              <MetricStat label="Avg pace" value={workout.avgPace} />
              <MetricStat label="Avg heart rate" value={workout.avgHR} unit="bpm" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subjective Metrics</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricStat label="Perceived effort" value={workout.perceivedEffort} unit="/10" />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Your reflection</p>
              <p className="mt-1 text-sm italic text-text-secondary">
                {workout.reflection ? `"${workout.reflection}"` : "No reflection logged for this session."}
              </p>
            </div>
          </CardContent>
        </Card>

        <InterpretationPanel workout={workout} />
        <WorkoutChatInput workoutTitle={workout.title} />
      </div>
    </div>
  );
}
