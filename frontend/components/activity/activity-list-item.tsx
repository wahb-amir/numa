import Link from "next/link";
import { formatDayLabel } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { Workout } from "@/lib/types";

const TYPE_LABEL_COLOR: Record<Workout["type"], string> = {
  Run: "text-accent-emerald bg-accent-emerald-soft",
  Ride: "text-accent-slate bg-accent-slate-soft",
  Strength: "text-status-attention bg-status-attention-soft",
  Swim: "text-accent-slate bg-accent-slate-soft",
  Mobility: "text-status-info bg-status-info-soft",
};

export function ActivityListItem({ workout }: { workout: Workout }) {
  const delta = workout.baselineDeltaPct;
  return (
    <li>
      <Link
        href={`/activity/${workout.id}`}
        className="flex items-center justify-between gap-4 rounded-card border border-transparent px-4 py-3.5 transition-colors hover:border-border hover:bg-surface-sunken"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`rounded-chip px-2 py-1 text-xs font-semibold ${TYPE_LABEL_COLOR[workout.type]}`}
          >
            {workout.type}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">{workout.title}</p>
            <p className="text-xs text-text-muted">
              {formatDayLabel(workout.dateIndex)} · {workout.durationMin} min
              {workout.distanceKm ? ` · ${workout.distanceKm} km` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {delta !== null && (
            <span
              className={`tabular text-xs font-semibold ${
                delta < -5 ? "text-status-concerning" : delta > 5 ? "text-status-positive" : "text-text-muted"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta}% vs baseline
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden="true" />
        </div>
      </Link>
    </li>
  );
}
