"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logoutSession } from "@/lib/api-client";

interface UseLogoutResult {
  signOut: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Coordinated sign-out flow.
 *
 *   1. Hit the backend `/auth/logout` endpoint with the current JWT so
 *      the server revokes the session globally (refresh token invalidated
 *      in Supabase — any stolen access token can no longer be refreshed).
 *   2. Call Supabase `signOut({ scope: 'global' })` on the client to clear
 *      local session cookies / storage and drop the cached session so the
 *      api-client interceptor stops attaching the JWT.
 *   3. Push the user to /login.
 *
 * Each step is defensive: if the backend is unreachable we still clear
 * local state so the user is effectively signed out of this browser. If
 * Supabase client sign-out fails after the backend succeeded, the JWT
 * is already revoked server-side so the worst case is a stray cookie
 * that will be ignored by the middleware on the next request.
 */
export function useLogout(redirectTo = "/login"): UseLogoutResult {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);

    let serverRevoked = false;
    try {
      await logoutSession();
      serverRevoked = true;
    } catch (err) {
      // Backend might be unreachable — keep going so local state still
      // gets cleared and the user is logged out client-side.
      console.warn("[logout] backend revocation failed:", err);
    }

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "global",
      });
      if (signOutError) {
        throw signOutError;
      }
    } catch (err) {
      console.warn("[logout] supabase signOut failed:", err);
      if (!serverRevoked) {
        setError("Could not sign you out. Please try again.");
        setLoading(false);
        return;
      }
    }

    // Hard refresh so server components re-render with the anonymous
    // session — `router.refresh()` alone can keep cached pages.
    router.push(redirectTo);
    router.refresh();
    setLoading(false);
  }, [redirectTo, router]);

  return { signOut, loading, error };
}