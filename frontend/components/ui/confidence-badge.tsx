import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/types";

const CONFIG: Record<Confidence, { label: string; fillClass: string; bars: number }> = {
  high: { label: "High confidence", fillClass: "bg-accent-emerald", bars: 3 },
  moderate: { label: "Moderate confidence", fillClass: "bg-accent-slate", bars: 2 },
  low: { label: "Low confidence", fillClass: "bg-text-muted", bars: 1 },
};

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const c = CONFIG[level];
  return (
    <div className="inline-flex items-center gap-2" role="img" aria-label={c.label}>
      <div className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={cn(
              "w-1 rounded-sm bg-border-strong",
              bar === 1 && "h-2",
              bar === 2 && "h-3",
              bar === 3 && "h-4",
              bar <= c.bars && c.fillClass
            )}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-text-secondary">{c.label}</span>
    </div>
  );
}
