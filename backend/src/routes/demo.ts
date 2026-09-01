/**
 * demo.ts
 *
 * POST /api/demo/provision
 *
 * Creates an isolated, pre-seeded Supabase account for a hackathon demo
 * visitor. The visitor picks a persona (runner / cyclist / gym) on the
 * login page; this endpoint:
 *
 *   1. Finds the source demo account for that persona.
 *   2. Creates a brand-new temp Supabase auth user.
 *   3. Copies all workouts, reflections, baselines, and discovered_patterns
 *      from the source account into the new account — full isolation.
 *   4. Signs in as the new user and returns the JWT + demo metadata.
 *
 * The copy takes ~100-200 ms at Supabase free-tier latency. Acceptable
 * for a hackathon demo with low concurrent traffic.
 *
 * Rate limited: max 3 provisions per IP per 5 minutes (in-memory Map).
 * No Redis required.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabase, supabaseSecret } from "../config/supabase";
import { logger } from "../utils/logger";

export const demoRouter = Router();

// ---------------------------------------------------------------------------
// In-memory IP rate limiter (3 provisions / 5 min per IP)
// ---------------------------------------------------------------------------

interface RateEntry {
  count: number;
  resetAt: number; // ms timestamp
}

const rateLimitMap = new Map<string, RateEntry>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true; // allowed
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // blocked
  }

  entry.count++;
  return true;
}

// Periodically clean up stale entries so the Map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 10 * 60 * 1000); // every 10 min

// ---------------------------------------------------------------------------
// Persona → source account mapping
// ---------------------------------------------------------------------------

const DEMO_PERSONAS = {
  runner_demo: {
    email: "demo.runner@numa-seed.internal",
    displayName: "Alex",
    activityLabel: "Runner",
  },
  cyclist_demo: {
    email: "demo.cyclist@numa-seed.internal",
    displayName: "Jordan",
    activityLabel: "Cyclist",
  },
  gym_demo: {
    email: "demo.gym@numa-seed.internal",
    displayName: "Morgan",
    activityLabel: "Gym athlete",
  },
} as const;

type PersonaId = keyof typeof DEMO_PERSONAS;

const provisionSchema = z.object({
  persona_id: z.enum(["runner_demo", "cyclist_demo", "gym_demo"]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random alphanumeric string of length n. */
function randomToken(n: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Find a Supabase auth user by email (scans up to 1000 users). */
async function findUserByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabaseSecret.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => u.email === email)?.id ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/demo/provision
// ---------------------------------------------------------------------------

demoRouter.post("/provision", async (req: Request, res: Response) => {
  // --- Rate limit ---
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: "Too many demo requests. Please wait a few minutes and try again.",
    });
  }

  // --- Validate body ---
  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid persona_id. Must be runner_demo, cyclist_demo, or gym_demo.",
    });
  }

  const { persona_id } = parsed.data;
  const persona = DEMO_PERSONAS[persona_id as PersonaId];

  try {
    // 1. Find the source demo account
    const sourceUserId = await findUserByEmail(persona.email);
    if (!sourceUserId) {
      logger.error(`Demo provision: source account not found for ${persona_id}`);
      return res.status(503).json({
        error:
          "Demo accounts are not seeded yet. Please run `npm run seed` in data-gen/ first.",
      });
    }

    // 2. Create a new temp auth user
    const token = randomToken(10);
    const tempEmail = `demo-${persona_id.replace("_demo", "")}-${token}@numa-demo.tmp`;
    const tempPassword = randomToken(24);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2h

    const { data: newUserData, error: createError } =
      await supabaseSecret.auth.admin.createUser({
        email: tempEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          display_name: `${persona.displayName} (Demo)`,
          is_demo: true,
          demo_persona_id: persona_id,
        },
      });

    if (createError || !newUserData.user) {
      throw new Error(`Failed to create demo user: ${createError?.message}`);
    }

    const newUserId = newUserData.user.id;

    // 3. Copy workouts from source → new user
    // Fetch all valid workouts from the source account
    const { data: sourceWorkouts, error: wFetchErr } = await supabaseSecret
      .from("workouts")
      .select("*")
      .eq("user_id", sourceUserId)
      .eq("status", "valid");

    if (wFetchErr) throw new Error(`Workout fetch failed: ${wFetchErr.message}`);

    // Build the new workout rows, keeping all metrics intact
    const oldToNewId = new Map<string, string>(); // old workout id → new workout id
    const fingerprintToNewId = new Map<string, string>();

    const CHUNK = 50;
    const workoutRows = (sourceWorkouts ?? []).map((w) => ({
      user_id: newUserId,
      activity_type: w.activity_type,
      source: w.source ?? "manual",
      start_time: w.start_time,
      duration_seconds: w.duration_seconds,
      metrics: w.metrics,
      raw_metrics: w.raw_metrics ?? null,
      fingerprint: `demo-${newUserId.slice(0, 8)}-${w.fingerprint}`,
      status: w.status,
      // Preserve ingested_at for timeline ordering
      ingested_at: w.ingested_at,
    }));

    // Batch insert workouts and collect the new IDs
    for (let i = 0; i < workoutRows.length; i += CHUNK) {
      const chunk = workoutRows.slice(i, i + CHUNK);
      const sourceChunk = (sourceWorkouts ?? []).slice(i, i + CHUNK);

      const { data: inserted, error: wInsertErr } = await supabaseSecret
        .from("workouts")
        .insert(chunk)
        .select("id, fingerprint");

      if (wInsertErr) {
        logger.warn(`Demo workout insert warning: ${wInsertErr.message}`);
        continue;
      }

      for (let j = 0; j < (inserted ?? []).length; j++) {
        const newRow = inserted![j];
        const oldRow = sourceChunk[j];
        if (newRow && oldRow) {
          oldToNewId.set(oldRow.id, newRow.id);
          fingerprintToNewId.set(newRow.fingerprint, newRow.id);
        }
      }
    }

    // 4. Copy reflections (rewrite user_id + workout_id)
    const { data: sourceReflections } = await supabaseSecret
      .from("reflections")
      .select("*")
      .eq("user_id", sourceUserId);

    const reflectionRows = (sourceReflections ?? [])
      .map((r) => {
        const newWorkoutId = oldToNewId.get(r.workout_id);
        if (!newWorkoutId) return null;
        return {
          user_id: newUserId,
          workout_id: newWorkoutId,
          effort_rating: r.effort_rating,
          energy_level: r.energy_level,
          notes: r.notes,
          created_at: r.created_at,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (reflectionRows.length > 0) {
      for (let i = 0; i < reflectionRows.length; i += CHUNK) {
        const chunk = reflectionRows.slice(i, i + CHUNK);
        const { error: rErr } = await supabaseSecret
          .from("reflections")
          .insert(chunk);
        if (rErr) logger.warn(`Demo reflection insert warning: ${rErr.message}`);
      }
    }

    // 5. Copy baselines
    const { data: sourceBaselines } = await supabaseSecret
      .from("baselines")
      .select("*")
      .eq("user_id", sourceUserId);

    const baselineRows = (sourceBaselines ?? []).map((b) => ({
      user_id: newUserId,
      metric_name: b.metric_name,
      activity_type: b.activity_type,
      window_days: b.window_days,
      rolling_mean: b.rolling_mean,
      rolling_stddev: b.rolling_stddev,
      sample_count: b.sample_count,
      computed_at: b.computed_at,
    }));

    if (baselineRows.length > 0) {
      const { error: bErr } = await supabaseSecret
        .from("baselines")
        .insert(baselineRows);
      if (bErr) logger.warn(`Demo baseline insert warning: ${bErr.message}`);
    }

    // 6. Copy discovered_patterns
    const { data: sourcePatterns } = await supabaseSecret
      .from("discovered_patterns")
      .select("*")
      .eq("user_id", sourceUserId);

    const patternRows = (sourcePatterns ?? []).map((p) => ({
      user_id: newUserId,
      check_name: p.check_name,
      activity_type: p.activity_type,
      metric_x: p.metric_x,
      metric_y: p.metric_y,
      pearson_r: p.pearson_r,
      sample_count: p.sample_count,
      direction: p.direction,
      threshold: p.threshold,
      template_summary: p.template_summary,
      computed_at: p.computed_at,
    }));

    if (patternRows.length > 0) {
      const { error: pErr } = await supabaseSecret
        .from("discovered_patterns")
        .insert(patternRows);
      if (pErr) logger.warn(`Demo pattern insert warning: ${pErr.message}`);
    }

    // 7. Upsert demo metadata in the users table
    const { error: upsertErr } = await supabaseSecret.from("users").upsert(
      {
        id: newUserId,
        email: tempEmail,
        profile: {
          onboarding_complete: true,
          account_type: "demo_readonly",
          display_name: `${persona.displayName} (Demo)`,
        },
        demo_persona_id: persona_id,
        demo_narrate_count: 0,
        demo_narrate_limit: 5,
        demo_expires_at: expiresAt,
      },
      { onConflict: "id" },
    );
    if (upsertErr) {
      logger.warn(`Demo users upsert warning: ${upsertErr.message}`);
    }

    // 8. Sign in as the new user to get a real session JWT
    const { data: sessionData, error: signInErr } =
      await supabase.auth.signInWithPassword({
        email: tempEmail,
        password: tempPassword,
      });

    const session = sessionData.session;

    if (signInErr || !session) {
      throw new Error(
        `Failed to create demo session: ${signInErr?.message ?? "no session returned"}`,
      );
    }

    logger.info(
      `[demo] Provisioned ${persona_id} → ${newUserId} (${workoutRows.length} workouts copied)`,
    );

    return res.status(201).json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: expiresAt,
      persona_id,
      display_name: persona.displayName,
      activity_label: persona.activityLabel,
      narrate_remaining: 5,
      user_id: newUserId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[demo] provision failed: ${msg}`);
    return res.status(500).json({ error: "Demo provisioning failed. Please try again." });
  }
});
