"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Units = "metric" | "imperial";

interface UnitsContextValue {
  units: Units;
  setUnits: (next: Units) => void;
  /** True until we've read the persisted value / profile. */
  hydrated: boolean;
}

const STORAGE_KEY = "numa:units";

const UnitsContext = createContext<UnitsContextValue | null>(null);

/**
 * Provides the user's preferred units (metric vs imperial) to the whole app.
 *
 * Hydration order (first value wins):
 *   1. localStorage ("numa:units") — instant on the client, so the UI
 *      doesn't flash metric values before the profile API responds.
 *   2. The backend's profile response — overrides localStorage if it
 *      disagrees, so a change made on another device shows up after the
 *      page reloads.
 *
 * Components read `useUnits()` and call the format helpers in
 * `lib/units.ts` rather than hard-coding "km" / "min/km" strings.
 */
export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [units, setUnitsState] = useState<Units>("metric");
  const [hydrated, setHydrated] = useState(false);

  // Read persisted value on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "metric" || raw === "imperial") {
        setUnitsState(raw);
      }
    } catch {
      // localStorage may be unavailable (private mode, SSR edge cases);
      // silently fall back to the default.
    }
    setHydrated(true);
  }, []);

  const setUnits = useCallback((next: Units) => {
    setUnitsState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // No-op: the in-memory state still updates.
    }
  }, []);

  const value = useMemo(
    () => ({ units, setUnits, hydrated }),
    [units, setUnits, hydrated],
  );

  return (
    <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
  );
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) {
    throw new Error("useUnits must be used inside <UnitsProvider>");
  }
  return ctx;
}