"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workoutRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const queues_1 = require("../jobs/queues");
const progress_1 = require("../utils/progress");
const stats_1 = require("../utils/stats");
const metrics_1 = require("../utils/metrics");
const logger_1 = require("../utils/logger");
exports.workoutRouter = (0, express_1.Router)();
const workoutSchema = zod_1.z.object({
    activity_type: zod_1.z.enum(["running", "cycling", "gym", "other"]),
    start_time: zod_1.z.string().datetime(),
    duration_seconds: zod_1.z.number().positive(),
    metrics: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).default({}),
});
const reflectionSchema = zod_1.z.object({
    effort_rating: zod_1.z.number().min(1).max(10).optional(),
    energy_level: zod_1.z.enum(["low", "normal", "high"]).optional(),
    notes: zod_1.z.string().optional(),
});
/**
 * Fetch the short-window baseline rows for a user. Returns a Map keyed
 * by `${activity_type}|${metric_name}` so we can do O(1) lookups while
 * enriching a list of workouts. Rows that are missing (insufficient
 * data) are simply absent — callers treat that as "don't render a
 * deviation badge for this metric".
 */
async function loadShortBaselines(userId) {
    const { data: rows } = await supabase_1.supabase
        .from("baselines")
        .select("metric_name, activity_type, rolling_mean, rolling_stddev, sample_count, window_days")
        .eq("user_id", userId)
        .eq("window_days", 14);
    const map = new Map();
    for (const r of rows ?? []) {
        map.set(`${r.activity_type}|${r.metric_name}`, {
            ...r,
            rolling_mean: Number(r.rolling_mean),
            rolling_stddev: Number(r.rolling_stddev),
        });
    }
    return map;
}
exports.workoutRouter.post("/", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const parsed = workoutSchema.safeParse(req.body);
        if (!parsed.success) {
            return res
                .status(400)
                .json({ error: "Invalid input", details: parsed.error });
        }
        const { activity_type, start_time, duration_seconds, metrics } = parsed.data;
        // Simple fingerprint based on start time and duration to avoid exact duplicates
        const fingerprint = `${start_time}_${duration_seconds}`;
        const { data: workout, error } = await supabase_1.supabase
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
        await queues_1.baselineQueue.add("computeBaselines", {
            userId,
            activityType: activity_type,
        });
        // Trigger correlation recompute — cheap, only fires when the user
        // has enough history, and keeps discovered_patterns fresh.
        await queues_1.correlationQueue.add("computeCorrelations", {
            userId,
            activityType: activity_type,
        });
        return res.status(201).json(workout);
    }
    catch (error) {
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
exports.workoutRouter.get("/", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit || "50", 10);
        const offset = parseInt(req.query.offset || "0", 10);
        const [{ data, error }, baselines] = await Promise.all([
            supabase_1.supabase
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
        if (!data || data.length === 0)
            return res.status(200).json([]);
        if (baselines.size === 0) {
            // No baseline data yet — return workouts plain. The frontend will
            // recognize the absence of `comparison` and render "no baseline yet".
            return res.status(200).json(data);
        }
        const enriched = data.map((w) => {
            const metrics = (w.metrics ?? {});
            const applicable = (0, metrics_1.metricsForActivity)(w.activity_type);
            const comparison = {};
            for (const metric of applicable) {
                const value = metric.extract({
                    activity_type: w.activity_type,
                    start_time: w.start_time,
                    duration_seconds: w.duration_seconds,
                    metrics,
                });
                if (value === null)
                    continue;
                const base = baselines.get(`${w.activity_type}|${metric.name}`) ?? null;
                if (!base) {
                    comparison[metric.name] = {
                        value,
                        baseline_mean: null,
                        baseline_stddev: null,
                        deviation_pct: null,
                        z_score: null,
                        label: "insufficient_data",
                    };
                    continue;
                }
                const { z, deviation_pct } = (0, progress_1.computeDeviation)(value, base);
                const sign = z === null ? 1 : z > 0 ? 1 : z < 0 ? -1 : 1;
                const label = (0, stats_1.deviationLabel)(z, sign);
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
    }
    catch (error) {
        logger_1.logger.error("List workouts error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
exports.workoutRouter.get("/:id", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { data, error } = await supabase_1.supabase
            .from("workouts")
            .select(`
        *,
        reflections (*)
      `)
            .eq("id", id)
            .eq("user_id", userId)
            .single();
        if (error || !data) {
            return res.status(404).json({ error: "Workout not found" });
        }
        return res.status(200).json(data);
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
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
exports.workoutRouter.get("/:id/comparison", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const [{ data: workout, error: wErr }, { data: baselines, error: bErr }] = await Promise.all([
            supabase_1.supabase
                .from("workouts")
                .select("*")
                .eq("id", id)
                .eq("user_id", userId)
                .single(),
            supabase_1.supabase
                .from("baselines")
                .select("metric_name, activity_type, rolling_mean, rolling_stddev, sample_count, window_days")
                .eq("user_id", userId)
                .eq("window_days", 14),
        ]);
        if (wErr || !workout) {
            return res.status(404).json({ error: "Workout not found" });
        }
        if (bErr) {
            logger_1.logger.error("comparison baseline fetch failed:", bErr);
        }
        const metrics = (workout.metrics ?? {});
        const applicable = (0, metrics_1.metricsForActivity)(workout.activity_type);
        const baseMap = new Map();
        for (const b of baselines ?? []) {
            baseMap.set(`${b.activity_type}|${b.metric_name}`, {
                rolling_mean: Number(b.rolling_mean),
                rolling_stddev: Number(b.rolling_stddev),
            });
        }
        const comparison = {};
        for (const metric of applicable) {
            const value = metric.extract({
                activity_type: workout.activity_type,
                start_time: workout.start_time,
                duration_seconds: workout.duration_seconds,
                metrics,
            });
            if (value === null)
                continue;
            const base = baseMap.get(`${workout.activity_type}|${metric.name}`) ?? null;
            if (!base) {
                comparison[metric.name] = {
                    value,
                    baseline_mean: null,
                    baseline_stddev: null,
                    deviation_pct: null,
                    z_score: null,
                    label: "insufficient_data",
                };
                continue;
            }
            const { z, deviation_pct } = (0, progress_1.computeDeviation)(value, base);
            const sign = z === null ? 1 : z > 0 ? 1 : z < 0 ? -1 : 1;
            const label = (0, stats_1.deviationLabel)(z, sign);
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
    }
    catch (error) {
        logger_1.logger.error("Comparison endpoint error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * POST /api/workouts/:id/reflection
 */
exports.workoutRouter.post("/:id/reflection", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const workoutId = req.params.id;
        const parsed = reflectionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res
                .status(400)
                .json({ error: "Invalid input", details: parsed.error });
        }
        // Upsert reflection
        const { data, error } = await supabase_1.supabase
            .from("reflections")
            .upsert({
            workout_id: workoutId,
            user_id: userId,
            ...parsed.data,
        }, { onConflict: "workout_id" })
            .select()
            .single();
        if (error) {
            console.error("Reflection upsert error:", error);
            return res.status(500).json({ error: "Failed to save reflection" });
        }
        // Reflection gives us effort_rating — that powers one of the
        // correlation checks. Refresh patterns asynchronously.
        const { data: workout } = await supabase_1.supabase
            .from("workouts")
            .select("activity_type")
            .eq("id", workoutId)
            .eq("user_id", userId)
            .single();
        if (workout) {
            await queues_1.correlationQueue.add("computeCorrelations", {
                userId,
                activityType: workout.activity_type,
            });
        }
        return res.status(200).json(data);
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
exports.workoutRouter.post("/:id/recompute", auth_1.requireAuth, async (req, res) => {
    /**
     * Manual recompute trigger — for the reports page when the user
     * wants fresh trend numbers without re-uploading. Idempotent.
     */
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { data: workout, error } = await supabase_1.supabase
            .from("workouts")
            .select("activity_type")
            .eq("id", id)
            .eq("user_id", userId)
            .single();
        if (error || !workout) {
            return res.status(404).json({ error: "Workout not found" });
        }
        await queues_1.baselineQueue.add("computeBaselines", {
            userId,
            activityType: workout.activity_type,
        });
        await queues_1.correlationQueue.add("computeCorrelations", {
            userId,
            activityType: workout.activity_type,
        });
        return res.status(202).json({ queued: true });
    }
    catch (error) {
        logger_1.logger.error("recompute error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
