"use client";

import { useEffect } from "react";
import { useUnits } from "./units-context";
import { getProfile } from "./api-client";

/**
 * Background sync between the server-side profile preference and the
 * client-side units provider. Mounted once near the root of the app
 * shell. After hydration, if the profile's stored `units` differs from
 * the local value, we trust the server.
 *
 * Failures are silent — the localStorage fallback keeps the UI working
 * even when the profile endpoint is offline.
 *
 * Renders nothing — it only runs an effect.
 */
export function UnitsHydrator() {
  const { units, setUnits, hydrated } = useUnits();

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await getProfile();
        if (cancelled) return;
        if (
          (profile.units === "metric" || profile.units === "imperial") &&
          profile.units !== units
        ) {
          setUnits(profile.units);
        }
      } catch {
        // Network failure — keep the locally-cached preference.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, units, setUnits]);

  return null;
}