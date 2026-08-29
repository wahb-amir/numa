"use client";

import { useEffect, useState } from "react";

/**
 * Theme preference, persisted to localStorage. When set to "system", the
 * active theme tracks the OS-level prefers-color-scheme media query and
 * updates when the user changes their system preference.
 */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "numa-theme";

const isValidPref = (value: unknown): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

const readStoredPref = (): ThemePreference => {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isValidPref(raw) ? raw : "system";
  } catch {
    // localStorage can be unavailable (Safari private mode, sandboxed
    // iframes). Falling back to system is the safe default — the inline
    // boot script has already painted the right theme, so this only
    // affects in-session toggles.
    return "system";
  }
};

const systemPrefersDark = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/**
 * Apply the preference to the <html> element. Called from the inline
 * boot script on first paint, and from the hook on every toggle.
 *
 * Returns the *effective* theme ("light" | "dark") so callers can label
 * the toggle button or sync server-side preferences later if needed.
 */
export function applyTheme(pref: ThemePreference): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const effective =
    pref === "system" ? (systemPrefersDark() ? "dark" : "light") : pref;
  const root = document.documentElement;
  root.classList.toggle("dark", effective === "dark");
  return effective;
}

/**
 * Read/write the user's theme preference, reconcile with the OS-level
 * preference when set to "system", and keep the DOM in sync. Mount it
 * once near the root of the tree (used inside ThemeToggle today, plus
 * any other client component that wants to label itself).
 */
export function useTheme() {
  // Use SSR-safe defaults for the initial render so that the server HTML
  // and the first client render always agree (avoiding hydration mismatches).
  // A useEffect below immediately syncs to the real client values after mount.
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState<boolean>(false);

  // Sync to actual stored preference + OS dark-mode state after hydration.
  useEffect(() => {
    setPreference(readStoredPref());
    setSystemDark(systemPrefersDark());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply + persist whenever the preference changes.
  useEffect(() => {
    applyTheme(preference);
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Same rationale as readStoredPref — silently ignore quota or
      // availability errors.
    }
  }, [preference]);

  // Subscribe to OS-level changes so "system" mode updates live.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
      if (preference === "system") {
        applyTheme("system");
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
    // preference is read at handler-time via closure-free re-check; we
    // intentionally don't depend on it so the listener isn't torn down
    // on every toggle.
  }, [preference]);

  const effective: "light" | "dark" =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  const cycle = () => {
    // System → Light → Dark → System. The label on the button reflects
    // the *next* state, not the current one — this matches what users
    // expect from the iOS / macOS appearance toggles.
    setPreference((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  return {
    preference,
    effective,
    cycle,
    setPreference,
  } as const;
}
