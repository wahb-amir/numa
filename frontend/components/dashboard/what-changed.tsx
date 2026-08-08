"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { StatusLevel, ApiBaseline, ApiWorkout } from "@/lib/types";

interface Deviation {
  label: string;
  value: string;
  deltaLabel: string;
  direction: "up" | "down" | "flat";
  status: StatusLevel;
}

interface Props {
  baselines?: ApiBaseline[];
  latestWorkout?: ApiWorkout;
}

// ─── Map API baselines to display rows ───────────────────────────────────────

function buildDeviations(
  baselines: ApiBaseline[],
  latest?: ApiWorkout
): Deviation[] {
  if (!baselines.length || !latest) return [];

  const rows: Deviation[] = [];
  const latestMetrics = (latest.metrics ?? {}) as Record<string, number | null>;

  // Helper: find the baseline value for a given metric name (any activity type)
  const findBaseline = (name: string) =>
    baselines.find((b) => b.metric_name === name)?.value ?? null;

  // Duration
  const durationMin = Math.round(latest.duration_seconds / 60);
  const baselineDurationSec = findBaseline("avg_duration_seconds");
  const baselineDurationMin = baselineDurationSec ? Math.round(baselineDurationSec / 60) : null;
  if (baselineDurationMin !== null) {
    const delta = durationMin - baselineDurationMin;
    rows.push({
      label: "Session duration",
      value: `${durationMin} min`,
      deltaLabel:
        delta === 0
          ? "In line with your baseline"
          : `${delta > 0 ? "+" : ""}${delta} min vs. your baseline`,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      status:
        Math.abs(delta) > 10 ? "attention" : delta >= 0 ? "positive" : "info",
    });
  }

  // Avg HR (if present in latest metrics)
  const latestHR = latestMetrics["avg_hr"] ?? null;
  const baselineHR = findBaseline("avg_hr");
  if (latestHR !== null && baselineHR !== null) {
    const delta = Math.round(latestHR - baselineHR);
    rows.push({
      label: "Average heart rate",
      value: `${Math.round(latestHR)} bpm`,
      deltaLabel:
        delta === 0
          ? "On par with your baseline"
          : `${delta > 0 ? "+" : ""}${delta} bpm vs. your baseline`,
      direction: delta > 5 ? "up" : delta < -5 ? "down" : "flat",
      status: delta > 10 ? "attention" : delta < -10 ? "positive" : "info",
    });
  }

  // Resting HR (from metrics snapshot)
  const restingHR = latestMetrics["resting_hr"] ?? null;
  const baselineRestingHR = findBaseline("avg_resting_hr");
  if (restingHR !== null && baselineRestingHR !== null) {
    const delta = Math.round(restingHR - baselineRestingHR);
    rows.push({
      label: "Resting heart rate",
      value: `${Math.round(restingHR)} bpm`,
      deltaLabel:
        delta === 0
          ? "At your typical baseline"
          : `${delta > 0 ? "+" : ""}${delta} bpm vs. your 30-day baseline`,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      status: delta > 6 ? "attention" : delta < -4 ? "positive" : "info",
    });
  }

  return rows;
}

const ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus };

export function WhatChanged({ baselines = [], latestWorkout }: Props) {
  const deviations = buildDeviations(baselines, latestWorkout);

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
                      <p className="text-sm font-medium text-text-primary">{d.label}</p>
                      <p className="text-xs text-text-muted">{d.deltaLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold tabular text-text-primary">
                    {d.value}
                    <Icon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
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
