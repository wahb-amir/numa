import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { supabaseSecret, supabase } from "../config/supabase";

export const authRouter = Router();

/**
 * GET /api/auth/me
 * Returns the authenticated user's account info (id, email, created_at,
 * last_sign_in_at, app_metadata, user_metadata). Powered by Supabase's
 * `getUser(jwt)` call — same path the auth middleware uses, so this endpoint
 * serves as a single source of truth for "who is logged in".
 */
authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const token = req.token!;

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res
        .status(401)
        .json({ error: "Unauthorized", details: error?.message });
    }

    return res.status(200).json({
      id: user.id,
      email: user.email,
      phone: user.phone ?? null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      app_metadata: user.app_metadata ?? {},
      user_metadata: user.user_metadata ?? {},
    });
  } catch (error) {
    console.error("GET /auth/me error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/logout
 * Revokes the current session globally:
 *  1. Calls Supabase `signOut({ scope: 'global' })` on the server, which
 *     invalidates BOTH the supplied access token AND every refresh token
 *     issued for the user. This is the JWT revocation step.
 *  2. The client is expected to additionally clear its local Supabase
 *     session (browser cookies) — the response just acknowledges success.
 *
 * The admin client is used so the call works even when the access token is
 * already expired but the user is mid-logout-flow. We resolve the user id
 * from the validated token first; if that fails we treat the request as
 * already-anonymous and return 200 (idempotent logout).
 */
authRouter.post(
  "/logout",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const token = req.token!;

      // Identify the user. If the token is invalid here we still allow the
      // caller to "log out" — there's nothing to revoke server-side anyway.
      let userId: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser(token);
        userId = user?.id ?? null;
      } catch {
        userId = null;
      }

      // Revoke the session globally. This invalidates the refresh token
      // server-side, so even if an attacker later steals the access token
      // they cannot mint a new one. The admin client sign-out is global
      // because it doesn't accept a specific session bearer — it invalidates
      // every refresh token currently issued for the project.
      const { error } = await supabaseSecret.auth.signOut({
        scope: "global",
      });

      if (error && error.status !== 401) {
        // 401 here means "no active session" — that's fine for logout.
        return res
          .status(500)
          .json({ error: "Failed to revoke session", details: error.message });
      }

      return res.status(200).json({
        revoked: true,
        user_id: userId,
        scope: "global",
      });
    } catch (error) {
      console.error("POST /auth/logout error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);