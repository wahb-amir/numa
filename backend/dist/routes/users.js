"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const progress_1 = require("../utils/progress");
const metrics_1 = require("../utils/metrics");
const logger_1 = require("../utils/logger");
exports.userRouter = (0, express_1.Router)();
/**
 * GET /api/users/me/baselines
 * Existing endpoint — kept as-is.
 */
exports.userRouter.get("/me/baselines", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase_1.supabase
            .from("baselines")
            .select("*")
            .eq("user_id", userId);
        if (error) {
            return res.status(500).json({ error: "Failed to fetch baselines" });
        }
        return res.status(200).json(data);
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /api/users/me
 * Returns the user's profile. Profile data lives in a `user_profiles`
 * table keyed by user_id, with `display_name`, `units`, and `updated_at`.
 * Falls back to deriving display_name from user_metadata if the row
 * doesn't exist yet.
 */
exports.userRouter.get("/me", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const token = req.token;
        const [{ data: { user } }, profileResult] = await Promise.all([
            supabase_1.supabase.auth.getUser(token),
            supabase_1.supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
        ]);
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const meta = (user.user_metadata ?? {});
        const profile = profileResult.data ?? null;
        return res.status(200).json({
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at ?? null,
            display_name: profile?.display_name ??
                meta.full_name ??
                meta.name ??
                deriveNameFromEmail(user.email),
            units: profile?.units ?? "metric",
            profile_exists: Boolean(profile),
            updated_at: profile?.updated_at ?? null,
        });
    }
    catch (error) {
        console.error("GET /users/me error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
const profileUpdateSchema = zod_1.z
    .object({
    display_name: zod_1.z.string().trim().min(1).max(80).optional(),
    units: zod_1.z.enum(["metric", "imperial"]).optional(),
})
    .refine((data) => data.display_name !== undefined || data.units !== undefined, {
    message: "At least one field must be provided",
});
/**
 * PATCH /api/users/me
 * Upserts the user_profiles row. We use the admin (service-role) client
 * so we can write to the row even if RLS hasn't been provisioned yet —
 * the caller is already validated by `requireAuth` so this is safe.
 */
exports.userRouter.patch("/me", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const parsed = profileUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: "Invalid profile update",
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const update = {
            user_id: userId,
            ...parsed.data,
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase_1.supabaseSecret
            .from("user_profiles")
            .upsert(update, { onConflict: "user_id" })
            .select("*")
            .single();
        if (error) {
            return res
                .status(500)
                .json({ error: "Failed to update profile", details: error.message });
        }
        return res.status(200).json({
            id: userId,
            display_name: data?.display_name ?? null,
            units: data?.units ?? "metric",
            updated_at: data?.updated_at ?? null,
        });
    }
    catch (error) {
        console.error("PATCH /users/me error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
function deriveNameFromEmail(email) {
    if (!email)
        return "Numa athlete";
    const local = email.split("@")[0] ?? "";
    if (!local)
        return "Numa athlete";
    // "alex.rivera" -> "Alex Rivera"
    return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
/**
 * GET /api/users/me/progress
 *
 * Month-over-month progress trend per (activity_type, metric). Pulls the
 * user's full workout history once, groups by month, and computes the
 * stats inline — no separate `progress` table to keep in sync.
 *
 * Empty list = user hasn't been around long enough to span 2 months.
 */
exports.userRouter.get("/me/progress", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data: rows, error } = await supabase_1.supabase
            .from("workouts")
            .select("activity_type, start_time, duration_seconds, metrics, status")
            .eq("user_id", userId)
            .eq("status", "valid")
            .order("start_time", { ascending: true })
            .limit(2000);
        if (error) {
            logger_1.logger.error("progress fetch failed:", error);
            return res.status(500).json({ error: "Failed to fetch progress" });
        }
        const workouts = (rows ?? []).map((w) => ({
            activity_type: w.activity_type,
            start_time: w.start_time,
            duration_seconds: w.duration_seconds,
            metrics: (w.metrics ?? {}),
        }));
        const progress = (0, progress_1.computeProgressForUser)(workouts);
        // Annotate each row with the metric's UI label / unit so the
        // frontend doesn't have to look anything up.
        const enriched = progress.map((p) => {
            const metric = (0, metrics_1.getMetric)(p.metric_name);
            return {
                ...p,
                metric_label: metric?.label ?? p.metric_name,
                metric_unit: metric?.unit ?? "",
            };
        });
        return res.status(200).json(enriched);
    }
    catch (error) {
        logger_1.logger.error("progress endpoint error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /api/users/me/patterns
 *
 * Returns rows from `discovered_patterns` for the authenticated user,
 * most recent first. These are the verified correlation checks — the
 * LLM downstream only narrates the `template_summary` of each row.
 */
exports.userRouter.get("/me/patterns", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await supabase_1.supabase
            .from("discovered_patterns")
            .select("*")
            .eq("user_id", userId)
            .order("computed_at", { ascending: false });
        if (error) {
            logger_1.logger.error("patterns fetch failed:", error);
            return res.status(500).json({ error: "Failed to fetch patterns" });
        }
        return res.status(200).json(data ?? []);
    }
    catch (error) {
        logger_1.logger.error("patterns endpoint error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /api/users/me/insights
 *
 * Composed insight feed — combines raw pattern rows, baselines, and a
 * recent-workout overview into the shape the frontend's /insights page
 * already knows how to render.
 *
 * Returned shape:
 *   {
 *     patterns: [...],      // templated summaries ready to display
 *     baselines: [...],     // all baseline rows
 *     summary: { workouts, activity_types, first_session_at }
 *   }
 */
exports.userRouter.get("/me/insights", auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [patternsRes, baselinesRes, workoutsRes] = await Promise.all([
            supabase_1.supabase
                .from("discovered_patterns")
                .select("*")
                .eq("user_id", userId)
                .order("computed_at", { ascending: false }),
            supabase_1.supabase.from("baselines").select("*").eq("user_id", userId),
            supabase_1.supabase
                .from("workouts")
                .select("id, activity_type, start_time")
                .eq("user_id", userId)
                .eq("status", "valid")
                .order("start_time", { ascending: true })
                .limit(1),
        ]);
        if (patternsRes.error || baselinesRes.error || workoutsRes.error) {
            logger_1.logger.error("insights fetch failed:", {
                patterns: patternsRes.error,
                baselines: baselinesRes.error,
                workouts: workoutsRes.error,
            });
            return res.status(500).json({ error: "Failed to load insights" });
        }
        const firstWorkout = workoutsRes.data?.[0];
        const activityTypes = Array.from(new Set((patternsRes.data ?? []).map((p) => p.activity_type).filter(Boolean)));
        return res.status(200).json({
            patterns: patternsRes.data ?? [],
            baselines: baselinesRes.data ?? [],
            summary: {
                workouts_count: (baselinesRes.data ?? []).length,
                first_session_at: firstWorkout?.start_time ?? null,
                activity_types: activityTypes,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("insights endpoint error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
