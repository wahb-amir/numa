import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { supabase } from "../config/supabase";
import { narrate, isLlmConfigured } from "../utils/llm";
import { getMetric } from "../utils/metrics";
import { logger } from "../utils/logger";

export const chatRouter = Router();

/**
 * POST /api/chat/narrate
 *
 * Body:
 *   {
 *     question: string,                     // user question
 *     workout_id?: string                   // optional focus workout
 *   }
 *
 * Pulls the pre-computed context (baseline comparison for the workout +
 * verified correlation patterns + recent reflection notes), feeds it to
 * the Groq model, and returns a structured narration.
 *
 * The route deliberately fails soft: if GROQ_API_KEY is missing or the
 * model errors, we return a 503 with a clear message rather than
 * crashing the server. The frontend can fall back to a templated
 * explanation in that case.
 */
const narrateSchema = z.object({
  question: z.string().trim().min(1).max(800),
  workout_id: z.string().uuid().optional(),
});

chatRouter.post(
  "/narrate",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = narrateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { question, workout_id } = parsed.data;
      const userId = req.user!.id;

      if (!isLlmConfigured()) {
        return res.status(503).json({
          error: "LLM not configured",
          detail:
            "Set GROQ_API_KEY on the backend to enable narration. The stats pipeline still works without it.",
        });
      }

      // 1. Resolve the focus workout — either the one the user passed,
      //    or their most recent workout so the chat always has *some*
      //    concrete anchor.
      let focus: {
        id: string;
        activity_type: string;
        start_time: string;
        duration_seconds: number;
        metrics: Record<string, unknown>;
      } | null = null;
      if (workout_id) {
        const { data } = await supabase
          .from("workouts")
          .select("id, activity_type, start_time, duration_seconds, metrics")
          .eq("id", workout_id)
          .eq("user_id", userId)
          .single();
        focus = data;
      } else {
        const { data } = await supabase
          .from("workouts")
          .select("id, activity_type, start_time, duration_seconds, metrics")
          .eq("user_id", userId)
          .eq("status", "valid")
          .order("start_time", { ascending: false })
          .limit(1)
          .single();
        focus = data;
      }

      if (!focus) {
        return res.status(404).json({
          error: "No workout available to anchor the question",
        });
      }

      // 2. Build the baseline-comparison context for the focus workout.
      //    We pick avg_hr if present, otherwise avg_pace_min_km. The UI
      //    shows whichever exists.
      const metricNames = ["avg_hr", "avg_pace_min_km", "distance_km", "duration_seconds"];
      let comparison: Parameters<typeof narrate>[1]["comparison"] = null;
      for (const name of metricNames) {
        const metric = getMetric(name);
        if (!metric) continue;
        const value = metric.extract({
          activity_type: focus.activity_type as never,
          start_time: focus.start_time,
          duration_seconds: focus.duration_seconds,
          metrics: focus.metrics,
        });
        if (value === null) continue;
        const { data: baseline } = await supabase
          .from("baselines")
          .select("rolling_mean, rolling_stddev")
          .eq("user_id", userId)
          .eq("activity_type", focus.activity_type)
          .eq("metric_name", name)
          .eq("window_days", 14)
          .maybeSingle();
        if (!baseline) continue;
        const mu = Number(baseline.rolling_mean);
        const sigma = Number(baseline.rolling_stddev);
        const z = sigma <= 0 ? null : (value - mu) / sigma;
        const devPct = mu === 0 ? null : ((value - mu) / mu) * 100;
        const safeZ = z ?? 0;
        const absZ = Math.abs(safeZ);
        const label =
          absZ < 0.5
            ? "typical"
            : absZ < 1.5
              ? safeZ > 0
                ? "somewhat_above"
                : "somewhat_below"
              : safeZ > 0
                ? "notably_above"
                : "notably_below";
        comparison = {
          metric_label: metric.label,
          value,
          baseline_mean: mu,
          baseline_stddev: sigma,
          deviation_pct: devPct,
          label,
        };
        break;
      }

      // 3. Patterns + recent reflection notes for context.
      const [{ data: patterns }, { data: reflections }] = await Promise.all([
        supabase
          .from("discovered_patterns")
          .select("check_name, template_summary, pearson_r, sample_count")
          .eq("user_id", userId)
          .order("computed_at", { ascending: false })
          .limit(5),
        supabase
          .from("reflections")
          .select("notes")
          .eq("user_id", userId)
          .not("notes", "is", null)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const payload = await narrate(question, {
        displayName:
          (req.user!.email?.split("@")[0] ?? "athlete").replace(/[._-]+/g, " "),
        comparison,
        patterns: (patterns ?? []).map((p) => ({
          check_name: p.check_name as string,
          template_summary: p.template_summary as string,
          pearson_r: Number(p.pearson_r),
          sample_count: Number(p.sample_count),
        })),
        reflectionNotes: (reflections ?? [])
          .map((r) => r.notes)
          .filter((n): n is string => typeof n === "string" && n.length > 0),
      });

      if (!payload) {
        return res.status(503).json({
          error: "Narration failed",
          detail:
            "The model call did not return a valid response. Please try again.",
        });
      }

      return res.status(200).json(payload);
    } catch (error) {
      logger.error("chat narrate error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);