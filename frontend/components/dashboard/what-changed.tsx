import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { StatusLevel } from "@/lib/types";

interface Deviation {
  label: string;
  value: string;
  deltaLabel: string;
  direction: "up" | "down" | "flat";
  status: StatusLevel;
}

const DEVIATIONS: Deviation[] = [
  {
    label: "Resting heart rate",
    value: "58 bpm",
    deltaLabel: "+6 bpm vs. your 30-day baseline",
    direction: "up",
    status: "attention",
  },
  {
    label: "Sleep duration",
    value: "5.8 hrs",
    deltaLabel: "-1.4 hrs vs. your typical range",
    direction: "down",
    status: "concerning",
  },
  {
    label: "Training load",
    value: "Moderate",
    deltaLabel: "In line with recent weeks",
    direction: "flat",
    status: "info",
  },
  {
    label: "HRV",
    value: "44 ms",
    deltaLabel: "+3 ms, trending upward over 5 days",
    direction: "up",
    status: "positive",
  },
];

const ICONS = { up: ArrowUp, down: ArrowDown, flat: Minus };

export function WhatChanged() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What Changed</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {DEVIATIONS.map((d) => {
            const Icon = ICONS[d.direction];
            return (
              <li key={d.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
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
      </CardContent>
    </Card>
  );
}
