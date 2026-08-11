"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/use-theme";

/**
 * The label of the button always describes what tapping it will do
 * next, matching the iOS / macOS appearance toggle idiom. The icon shows
 * the *current* effective theme so the user can verify at a glance.
 */
const NEXT_STATE: Record<
  ThemePreference,
  { label: string; next: ThemePreference }
> = {
  system: { label: "Theme: System (click for Light)", next: "light" },
  light: { label: "Theme: Light (click for Dark)", next: "dark" },
  dark: { label: "Theme: Dark (click for System)", next: "system" },
};

const CurrentIcon = ({ effective }: { effective: "light" | "dark" }) =>
  effective === "dark" ? (
    <Moon className="h-4 w-4" aria-hidden="true" />
  ) : (
    <Sun className="h-4 w-4" aria-hidden="true" />
  );

export function ThemeToggle() {
  const { preference, effective, cycle } = useTheme();
  const hint = NEXT_STATE[preference];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={hint.label}
      title={hint.label}
      className="relative flex h-9 w-9 items-center justify-center rounded-control text-text-secondary hover:bg-surface-sunken"
    >
      <CurrentIcon effective={effective} />
      {/* Tiny indicator dot when in "system" mode so users can tell it
          isn't pinned — the active icon alone doesn't communicate that. */}
      {preference === "system" && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-emerald"
        />
      )}
      {/* Hide the second icon (Monitor) from layout but keep it in the
          DOM for screen readers as a label cue when in system mode. */}
      <span className="sr-only">
        {preference === "system" ? "System" : preference === "light" ? "Light" : "Dark"}
      </span>
    </button>
  );
}
