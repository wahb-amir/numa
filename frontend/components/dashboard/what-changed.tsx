"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type {
  StatusLevel,
  ApiWorkout,
  ApiComparisonMetric,
} from "@/lib/types";

interface Deviation {
  label: string;
  value: string;
  deltaLabel: string;
  direction: "up" | "down" | "flat";
  status: StatusLevel;
}

interface Props {
  latestWorkout?: ApiWorkout;
}

const METRIC_LABEL: Record<string, string> = {
  avg_hr: "Average heart rate",
  duration_seconds: "Session duration",
  distance_km: "Distance",
  avg_pace_min_km: "Average pace",
  avg_speed_kmh: "Average speed",
  calories: "Calories",
};

// ─── Map a single metric's comparison to a row ──────────────────────────────

function deviationForMetric(
  metric: string,
  c: ApiComparisonMetric,
): Deviation | null {
  if (c.baseline_mean === null) return null;

  const label = METRIC_LABEL[metric] ?? metric;
  const mu = c.baseline_mean;
  const delta = c.value - mu;

  switch (metric) {
    case "avg_hr": {
      const d = Math.round(delta);
      const display = `${Math.round(c.value)} bpm`;
      return {
        label,
        value: display,
        deltaLabel:
          d === 0
            ? "On par with your baseline"
            : `${d > 0 ? "+" : ""}${d} bpm vs. your 14-day baseline`,
        direction: d > 3 ? "up" : d < -3 ? "down" : "flat",
        status: d > 8 ? "attention" : d < -6 ? "positive" : "info",
      };
    }
    case "duration_seconds": {
      const mins = Math.round(c.value / 60);
      const baseMins = Math.round(mu / 60);
      const d = mins - baseMins;
      return {
        label,
        value: `${mins} min`,
        deltaLabel:
          d === 0
            ? "In line with your baseline"
            : `${d > 0 ? "+" : ""}${d} min vs. your 14-day baseline`,
        direction: d > 5 ? "up" : d < -5 ? "down" : "flat",
        status:
          Math.abs(d) > 10 ? "attention" : d >= 0 ? "positive" : "info",
      };
    }
    case "distance_km": {
      const d = Number((c.value - mu).toFixed(2));
      return {
        label,
        value: `${d >= 0 ? "+" : ""}${d.toFixed(1)} km`,
        deltaLabel: `vs. ${mu.toFixed(1)} km baseline`,
        direction: d > 0.3 ? "up" : d < -0.3 ? "down" : "flat",
        status: d > 2 ? "positive" : d < -2 ? "attention" : "info",
      };
    }
    case "avg_pace_min_km": {
      // Pace: lower = faster = better. We invert the visual direction.
      const dMin = c.value - mu;
      const faster = dMin < 0;
      return {
        label,
        value: `${c.value.toFixed(2)} min/km`,
        deltaLabel: faster
          ? `${Math.abs(dMin).toFixed(2)} min/km faster than baseline`
          : `${dMin.toFixed(2)} min/km slower than baseline`,
        direction: faster ? "down" : "up",
        status: faster ? "positive" : "attention",
      };
    }
    default:
      return null;
  }
}

// ─── Page component ─────────────────────────────────────────────────────────

export function WhatChanged({ latestWorkout }: Props) {
  const deviations: Deviation[] = [];

  if (latestWorkout) {
    const comparison = (latestWorkout as ApiWorkout & {
      comparison?: Record<string, ApiComparisonMetric>;
    }).comparison;

    if (comparison) {
      // Prioritize the most-recognizable metrics first.
      const order = [
        "avg_hr",
        "duration_seconds",
        "distance_km",
        "avg_pace_min_km",
      ];
      for (const metric of order) {
        const c = comparison[metric];
        if (!c) continue;
        const d = deviationForMetric(metric, c);
        if (d) deviations.push(d);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What Changed</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {deviations.length === 0 ? (
          <p className="text-sm text-text-muted py-2">
            Deviations will appear here once Numa has computed your baselines.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {deviations.map((d) => {
              const Icon = ICONS[d.direction];
              return (
                <li
                  key={d.label}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={d.status} className="shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {d.label}
                      </p>
                      <p className="text-xs text-text-muted">{d.deltaLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold tabular text-text-primary">
                    {d.value}
                    <Icon
                      className="h-3.5 w-3.5 text-text-muted"
                      aria-hidden="true"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus };