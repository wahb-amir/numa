import { cn } from "@/lib/utils";
import type { StatusLevel } from "@/lib/types";

const STATUS_STYLES: Record<
  StatusLevel,
  { dot: string; text: string; bg: string; label: string }
> = {
  positive: {
    dot: "bg-status-positive",
    text: "text-status-positive",
    bg: "bg-status-positive-soft",
    label: "Positive",
  },
  attention: {
    dot: "bg-status-attention",
    text: "text-status-attention",
    bg: "bg-status-attention-soft",
    label: "Attention",
  },
  concerning: {
    dot: "bg-status-concerning",
    text: "text-status-concerning",
    bg: "bg-status-concerning-soft",
    label: "Concerning",
  },
  info: {
    dot: "bg-status-info",
    text: "text-status-info",
    bg: "bg-status-info-soft",
    label: "Informational",
  },
};

export function StatusDot({
  status,
  className,
}: {
  status: StatusLevel;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        STATUS_STYLES[status].dot,
        className,
      )}
    />
  );
}

export function StatusChip({
  status,
  children,
}: {
  status: StatusLevel;
  children?: React.ReactNode;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs font-medium",
        s.bg,
        s.text,
      )}
    >
      <StatusDot status={status} />
      {children ?? s.label}
    </span>
  );
}
