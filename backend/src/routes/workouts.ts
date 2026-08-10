import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { supabase } from "../config/supabase";
import { baselineQueue, correlationQueue } from "../jobs/queues";
import { computeDeviation } from "../utils/progress";
import { deviationLabel, type DeviationLabel } from "../utils/stats";
import { metricsForActivity } from "../utils/metrics";
import { logger } from "../utils/logger";

export const workoutRouter = Router();

const workoutSchema = z.object({
  activity_type: z.enum(["running", "cycling", "gym", "other"]),
  start_time: z.string().datetime(),
  duration_seconds: z.number().positive(),
  metrics: z.record(z.string(), z.any()).default({}),
});

const reflectionSchema = z.object({
  effort_rating: z.number().min(1).max(10).optional(),
  energy_level: z.enum(["low", "normal", "high"]).optional(),
  notes: z.string().optional(),
});

/**
 * Fetch the short-window baseline rows for a user. Returns a Map keyed
 * by `${activity_type}|${metric_name}` so we can do O(1) lookups while
 * enriching a list of workouts. Rows that are missing (insufficient
 * data) are simply absent — callers treat that as "don't render a
 * deviation badge for this metric".
 */
async function loadShortBaselines(userId: string) {
  const { data: rows } = await supabase
    .from("baselines")
    .select("metric_name, activity_type, rolling_mean, rolling_stddev, sample_count, window_days")
    .eq("user_id", userId)
    .eq("window_days", 14);
  const map = new Map<
    string,
    {
      metric_name: string;
      activity_type: string;
      rolling_mean: number;
      rolling_stddev: number;
      sample_count: number;
      window_days: number;
    }
  >();
  for (const r of rows ?? []) {
    map.set(`${r.activity_type}|${r.metric_name}`, {
      ...r,
      rolling_mean: Number(r.rolling_mean),
      rolling_stddev: Number(r.rolling_stddev),
    });
  }
  return map;
}

workoutRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const parsed = workoutSchema.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error });
    }

    const { activity_type, start_time, duration_seconds, metrics } =
      parsed.data;

    // Simple fingerprint based on start time and duration to avoid exact duplicates
    const fingerprint = `${start_time}_${duration_seconds}`;

    const { data: workout, error } = await supabase
      .from("workouts")
      .insert({
        user_id: userId,
        activity_type,
        source: "manual",
        start_time,
        duration_seconds,
        metrics,
        fingerprint,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique violation
        return res.status(409).json({ error: "Workout already exists" });
      }
      console.error("Workout insert error:", error);
      return res.status(500).json({ error: "Failed to save workout" });
    }

    // Trigger baseline recalculation
    await baselineQueue.add("computeBaselines", {
      userId,
      activityType: activity_type,
    });

    // Trigger correlation recompute — cheap, only fires when the user
    // has enough history, and keeps discovered_patterns fresh.
    await correlationQueue.add("computeCorrelations", {
      userId,
      activityType: activity_type,
    });

    return res.status(201).json(workout);
  } catch (error) {
    console.error("Create workout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/workouts
 *
 * Returns the user's workouts with baseline-enriched `comparison` data:
 *   - per-metric { value, baseline_mean, baseline_stddev, deviation_pct, z_score, label }
 *   - only metrics the activity type applies to
 *   - missing baselines collapse to `insufficient_data`
 *
 * The enrichment is computed on read (cheap — one row per metric per
 * workout) and not persisted; the live worker rewrites the baselines
 * once new workouts arrive.
 */
workoutRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt((req.query.limit as string) || "50", 10);
    const offset = parseInt((req.query.offset as string) || "0", 10);

    const [{ data, error }, baselines] = await Promise.all([
      supabase
        .from("workouts")
        .select("*")
        .eq("user_id", userId)
        .order("start_time", { ascending: false })
        .range(offset, offset + limit - 1),
      loadShortBaselines(userId),
    ]);

    if (error) {
      return res.status(500).json({ error: "Failed to fetch workouts" });
    }

    if (!data || data.length === 0) return res.status(200).json([]);

    if (baselines.size === 0) {
      // No baseline data yet — return workouts plain. The frontend will
      // recognize the absence of `comparison` and render "no baseline yet".
      return res.status(200).json(data);
    }

    const enriched = data.map((w) => {
      const metrics = (w.metrics ?? {}) as Record<string, unknown>;
      const applicable = metricsForActivity(w.activity_type as never);
      const comparison: Record<string, unknown> = {};
      for (const metric of applicable) {
        const value = metric.extract({
          activity_type: w.activity_type as never,
          start_time: w.start_time,
          duration_seconds: w.duration_seconds,
          metrics,
        });
        if (value === null) continue;

        const base = baselines.get(`${w.activity_type}|${metric.name}`) ?? null;
        if (!base) {
          comparison[metric.name] = {
            value,
            baseline_mean: null,
            baseline_stddev: null,
            deviation_pct: null,
            z_score: null,
            label: "insufficient_data" as DeviationLabel,
          };
          continue;
        }
        const { z, deviation_pct } = computeDeviation(value, base);
        const sign: 1 | -1 | 0 = z === null ? 1 : z > 0 ? 1 : z < 0 ? -1 : 1;
        const label = deviationLabel(z, sign);
        comparison[metric.name] = {
          value,
          baseline_mean: base.rolling_mean,
          baseline_stddev: base.rolling_stddev,
          deviation_pct,
          z_score: z,
          label,
        };
      }
      return { ...w, comparison };
    });

    return res.status(200).json(enriched);
  } catch (error) {
    logger.error("List workouts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

workoutRouter.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const { data, error } = await supabase
        .from("workouts")
        .select(
          `
        *,
        reflections (*)
      `,
        )
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "Workout not found" });
      }

      return res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * GET /api/workouts/:id/comparison
 *
 * Returns the per-metric baseline comparison for a single workout. This
 * is the heavy comparison endpoint used by the activity detail page —
 * the list endpoint returns a stripped-down version inline.
 *
 * Shape:
 *   {
 *     workout: {...},
 *     comparison: {
 *       avg_hr: { value, baseline_mean, baseline_stddev, deviation_pct, z_score, label },
 *       ...
 *     },
 *     baseline_window_days: 14
 *   }
 */
workoutRouter.get(
  "/:id/comparison",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const [{ data: workout, error: wErr }, { data: baselines, error: bErr }] =
        await Promise.all([
          supabase
            .from("workouts")
            .select("*")
            .eq("id", id)
            .eq("user_id", userId)
            .single(),
          supabase
            .from("baselines")
            .select("metric_name, activity_type, rolling_mean, rolling_stddev, sample_count, window_days")
            .eq("user_id", userId)
            .eq("window_days", 14),
        ]);

      if (wErr || !workout) {
        return res.status(404).json({ error: "Workout not found" });
      }
      if (bErr) {
        logger.error("comparison baseline fetch failed:", bErr);
      }

      const metrics = (workout.metrics ?? {}) as Record<string, unknown>;
      const applicable = metricsForActivity(workout.activity_type as never);
      const baseMap = new Map<string, { rolling_mean: number; rolling_stddev: number }>();
      for (const b of baselines ?? []) {
        baseMap.set(`${b.activity_type}|${b.metric_name}`, {
          rolling_mean: Number(b.rolling_mean),
          rolling_stddev: Number(b.rolling_stddev),
        });
      }

      const comparison: Record<string, unknown> = {};
      for (const metric of applicable) {
        const value = metric.extract({
          activity_type: workout.activity_type as never,
          start_time: workout.start_time,
          duration_seconds: workout.duration_seconds,
          metrics,
        });
        if (value === null) continue;
        const base = baseMap.get(`${workout.activity_type}|${metric.name}`) ?? null;
        if (!base) {
          comparison[metric.name] = {
            value,
            baseline_mean: null,
            baseline_stddev: null,
            deviation_pct: null,
            z_score: null,
            label: "insufficient_data" as DeviationLabel,
          };
          continue;
        }
        const { z, deviation_pct } = computeDeviation(value, base);
        const sign: 1 | -1 | 0 = z === null ? 1 : z > 0 ? 1 : z < 0 ? -1 : 1;
        const label = deviationLabel(z, sign);
        comparison[metric.name] = {
          value,
          baseline_mean: base.rolling_mean,
          baseline_stddev: base.rolling_stddev,
          deviation_pct,
          z_score: z,
          label,
        };
      }

      return res.status(200).json({
        workout,
        comparison,
        baseline_window_days: 14,
      });
    } catch (error) {
      logger.error("Comparison endpoint error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * POST /api/workouts/:id/reflection
 */
workoutRouter.post(
  "/:id/reflection",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workoutId = req.params.id;

      const parsed = reflectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid input", details: parsed.error });
      }

      // Upsert reflection
      const { data, error } = await supabase
        .from("reflections")
        .upsert(
          {
            workout_id: workoutId,
            user_id: userId,
            ...parsed.data,
          },
          { onConflict: "workout_id" },
        )
        .select()
        .single();

      if (error) {
        console.error("Reflection upsert error:", error);
        return res.status(500).json({ error: "Failed to save reflection" });
      }

      // Reflection gives us effort_rating — that powers one of the
      // correlation checks. Refresh patterns asynchronously.
      const { data: workout } = await supabase
        .from("workouts")
        .select("activity_type")
        .eq("id", workoutId)
        .eq("user_id", userId)
        .single();
      if (workout) {
        await correlationQueue.add("computeCorrelations", {
          userId,
          activityType: workout.activity_type,
        });
      }

      return res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

workoutRouter.post(
  "/:id/recompute",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    /**
     * Manual recompute trigger — for the reports page when the user
     * wants fresh trend numbers without re-uploading. Idempotent.
     */
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const { data: workout, error } = await supabase
        .from("workouts")
        .select("activity_type")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (error || !workout) {
        return res.status(404).json({ error: "Workout not found" });
      }

      await baselineQueue.add("computeBaselines", {
        userId,
        activityType: workout.activity_type,
      });
      await correlationQueue.add("computeCorrelations", {
        userId,
        activityType: workout.activity_type,
      });

      return res.status(202).json({ queued: true });
    } catch (error) {
      logger.error("recompute error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);