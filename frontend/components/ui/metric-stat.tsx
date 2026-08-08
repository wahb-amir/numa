import { cn } from "@/lib/utils";

export function MetricStat({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface-raised p-4",
        className,
      )}
    >
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 tabular text-2xl font-semibold text-text-primary">
        {value ?? "—"}
        {value !== null && unit && (
          <span className="ml-1 text-sm font-normal text-text-muted">
            {unit}
          </span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
