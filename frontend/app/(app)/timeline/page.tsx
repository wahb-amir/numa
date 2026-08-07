import { TopHeader } from "@/components/shell/top-header";
import { StatusDot } from "@/components/ui/status";
import { timelineEvents } from "@/lib/mock-data";
import { formatDayLabel } from "@/lib/utils";
import { Dumbbell, MessageSquareText, Moon, Trophy, MapPin } from "lucide-react";
import type { Metadata } from "next";
import type { TimelineEvent } from "@/lib/types";

export const metadata: Metadata = { title: "Timeline — Numa" };

const CATEGORY_ICON: Record<TimelineEvent["category"], typeof Dumbbell> = {
  workout: Dumbbell,
  reflection: MessageSquareText,
  sleep: Moon,
  milestone: Trophy,
  context: MapPin,
};

export default function TimelinePage() {
  const reversed = [...timelineEvents].reverse();

  // group by dateIndex for day headers
  const groups = new Map<number, TimelineEvent[]>();
  for (const e of reversed) {
    const arr = groups.get(e.dateIndex) ?? [];
    arr.push(e);
    groups.set(e.dateIndex, arr);
  }

  return (
    <div>
      <TopHeader title="Timeline" subtitle="A chronological ledger of everything Numa has logged" />
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
        <ol className="relative border-l border-border pl-6">
          {Array.from(groups.entries()).map(([dateIndex, events]) => (
            <li key={dateIndex} className="mb-8 last:mb-0">
              <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent-emerald" aria-hidden="true" />
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                {formatDayLabel(dateIndex)}
              </p>
              <ul className="space-y-3">
                {events.map((e) => {
                  const Icon = CATEGORY_ICON[e.category];
                  return (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 rounded-card border border-border bg-surface-raised p-4"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text-secondary">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">{e.title}</p>
                          <StatusDot status={e.status} />
                        </div>
                        <p className="mt-0.5 text-sm text-text-secondary">{e.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
