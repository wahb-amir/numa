"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun, Check } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

/**
 * Compact theme control for the global Sidebar. The header has room
 * for a cycle button; here we want a single icon that opens a popover
 * listing the three preference options so the user can see the
 * current state at a glance without cycling.
 *
 * Implemented as a controlled absolute dropdown rather than a Radix
 * Popover — keeps the dep list flat (no new Radix package) and the
 * component is small enough that the overlay/dismiss plumbing is
 * trivial.
 */

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
  hint: string;
}> = [
  {
    value: "system",
    label: "System",
    Icon: Monitor,
    hint: "Match your OS preference",
  },
  {
    value: "light",
    label: "Light",
    Icon: Sun,
    hint: "Always use the light palette",
  },
  {
    value: "dark",
    label: "Dark",
    Icon: Moon,
    hint: "Always use the dark palette",
  },
];

const TriggerIcon = ({ effective }: { effective: "light" | "dark" }) =>
  effective === "dark" ? (
    <Moon className="h-4 w-4" aria-hidden="true" />
  ) : (
    <Sun className="h-4 w-4" aria-hidden="true" />
  );

export function ThemeNavControls() {
  const { preference, effective, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Outside click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The sidebar ignores the cycle button — pick a setting and close.
  function pick(pref: ThemePreference) {
    setPreference(pref);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative px-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
      >
        <span className="flex h-4 w-4 items-center justify-center">
          <TriggerIcon effective={effective} />
        </span>
        <span className="flex-1 text-left">Theme</span>
        <span className="text-xs font-medium text-text-muted">
          {preference === "system" ? "Auto" : preference === "light" ? "Light" : "Dark"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme preference"
          className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-card border border-border bg-surface-raised shadow-elevation-2"
        >
          {OPTIONS.map((opt) => {
            const selected = opt.value === preference;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={selected}
                type="button"
                onClick={() => pick(opt.value)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                  selected
                    ? "bg-accent-emerald-soft text-accent-emerald"
                    : "text-text-primary hover:bg-surface-sunken",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{opt.label}</span>
                  <span className="block text-xs text-text-muted">
                    {opt.hint}
                  </span>
                </span>
                {selected && (
                  <Check
                    className="h-4 w-4 shrink-0 text-accent-emerald"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
