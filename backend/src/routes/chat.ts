import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { supabase } from "../config/supabase";
import {
  narrate,
  isLlmConfigured,
  type ComparisonContext,
  type PatternContext,
  type ProgressContext,
  type DatedNote,
  type QuestionIntent,
  type NarrateContext,
} from "../utils/llm";
import {
  getMetric,
  metricsForActivity,
  type ActivityType,
  type WorkoutForStats,
} from "../utils/metrics";
import { computeProgressForUser } from "../utils/progress";
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
 * Pulls the pre-computed context (baseline-comparison for the focus
 * workout + verified patterns + month-over-month progress when the
 * question is about a trend + the focus workout's reflection note +
 * the most recent few reflection notes for context), classifies the
 * question's intent, and feeds the right context bundle to Groq.
 *
 * The route deliberately fails soft: if GROQ_API_KEY is missing or the
 * model errors, we return a 503 with a clear message rather than
 * crashing the server.
 */
const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const narrateSchema = z.object({
  question: z.string().trim().min(1).max(800),
  workout_id: z.string().uuid().optional(),
  // Recent conversation history (max 6 turns kept to bound input
  // size). Used so the model can reference its own previous responses
  // when the user follows up with subjective experience that the data
  // doesn't corroborate. The route treats this as untrusted text —
  // the model is told it's user/assistant history in the prompt.
  history: z.array(turnSchema).max(6).optional(),
});

/**
 * Order matters here. The deviation intent has the most specific
 * vocabulary — checks first, then strips any matches from the question
 * before subsequent patterns fire. This avoids "why was my heart rate
 * high" being classified as a pattern question because of "why".
 */
const TREND_KEYWORDS =
  /\b(progress|trend|over time|over the past|recent weeks|recent months|getting better|getting worse|improving|declining|stable|long.term|this month|this week|last month|last few weeks|last few months|how have i been|am i getting)\b/;
const PATTERN_KEYWORDS =
  /\b(affect|impact|effect|cause[sd]?|correlate|relationship|because of|due to|related to|connected|linked|with less|with more|after less|after more|when i sleep|when i train|on days|less sleep|more sleep|training load|effort rating)\b/;
const DEVIATION_KEYWORDS =
  /\b(last|this|today|specific|why was|why is|why was|what happened|high|low|fast|slow|elevated|off|strange|unusual|out of|outlier|peak|spike|dip|drop)\b/;

const classifyIntent = (question: string): QuestionIntent => {
  const q = question.toLowerCase();
  if (DEVIATION_KEYWORDS.test(q)) return "deviation";
  if (TREND_KEYWORDS.test(q)) return "trend";
  if (PATTERN_KEYWORDS.test(q)) return "pattern";
  return "general";
};

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
      const { question, workout_id, history } = parsed.data;
      const userId = req.user!.id;

      if (!isLlmConfigured()) {
        return res.status(503).json({
          error: "LLM not configured",
          detail:
            "Set GROQ_API_KEY on the backend to enable narration. The stats pipeline still works without it.",
        });
      }

      const intent = classifyIntent(question);

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

      // 2. Build a comparison block for EVERY metric that has a 14-day
      //    baseline for the focus workout's activity. The model picks
      //    which to surface based on the question — it now has the
      //    full picture, not just one metric.
      const applicableMetrics = metricsForActivity(
        focus.activity_type as ActivityType
      );
      const comparisons: ComparisonContext[] = [];
      for (const metric of applicableMetrics) {
        const value = metric.extract({
          activity_type: focus.activity_type as ActivityType,
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
          .eq("metric_name", metric.name)
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

        comparisons.push({
          metric_name: metric.name,
          metric_label: metric.label,
          unit: metric.unit,
          value,
          baseline_mean: mu,
          baseline_stddev: sigma,
          deviation_pct: devPct,
          label,
        });
      }

      // 3. Patterns + the focus workout's reflection note + a few
      //    most-recent notes. Notes are date-stamped so the model can
      //    tell which are temporally relevant to the focus workout.
      const [{ data: patternsRows }, { data: focusReflection }, { data: recentNotes }] =
        await Promise.all([
          supabase
            .from("discovered_patterns")
            .select(
              "check_name, template_summary, pearson_r, sample_count, activity_type"
            )
            .eq("user_id", userId)
            .order("computed_at", { ascending: false })
            .limit(5),
          supabase
            .from("reflections")
            .select("workout_id, notes, created_at")
            .eq("workout_id", focus.id)
            .maybeSingle(),
          supabase
            .from("reflections")
            .select("workout_id, notes, created_at")
            .eq("user_id", userId)
            .not("notes", "is", null)
            .neq("workout_id", focus.id)
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

      const patterns: PatternContext[] = (patternsRows ?? []).map((p) => ({
        check_name: p.check_name as string,
        template_summary: p.template_summary as string,
        pearson_r: Number(p.pearson_r),
        sample_count: Number(p.sample_count),
        activity_type: (p.activity_type as string | null) ?? null,
      }));

      const reflectionNotes: DatedNote[] = [];
      if (focusReflection?.notes) {
        reflectionNotes.push({
          date: focus.start_time.slice(0, 10),
          workout_id: focus.id,
          note: focusReflection.notes as string,
        });
      }
      for (const n of recentNotes ?? []) {
        if (!n.notes) continue;
        reflectionNotes.push({
          date: (n.created_at as string).slice(0, 10),
          workout_id: (n.workout_id as string) ?? null,
          note: n.notes as string,
        });
      }

      // 4. For trend questions, fetch progress data so the model can
      //    answer "how is my progress going" without pasting the
      //    single-workout comparison as a substitute.
      let progress: ProgressContext[] = [];
      if (intent === "trend") {
        const { data: workoutRows } = await supabase
          .from("workouts")
          .select("activity_type, start_time, duration_seconds, metrics, status")
          .eq("user_id", userId)
          .eq("status", "valid")
          .order("start_time", { ascending: false })
          .limit(2000);

        const allWorkouts: WorkoutForStats[] = (workoutRows ?? []).map((w) => ({
          activity_type: w.activity_type as ActivityType,
          start_time: w.start_time as string,
          duration_seconds: w.duration_seconds as number,
          metrics: (w.metrics ?? {}) as Record<string, unknown>,
        }));

        const points = computeProgressForUser(allWorkouts);
        progress = points.map((p) => ({
          metric_name: p.metric_name,
          metric_label:
            metricsForActivity(p.activity_type).find(
              (m) => m.name === p.metric_name
            )?.label ?? p.metric_name,
          activity_type: p.activity_type,
          earliest_month_mean: p.earliest_month_mean,
          latest_month_mean: p.latest_month_mean,
          pct_change: p.pct_change,
          direction: p.direction,
          confidence: p.confidence,
          earliest_month: p.earliest_month,
          latest_month: p.latest_month,
        }));
      }

      const ctx: NarrateContext = {
        displayName:
          (req.user!.email?.split("@")[0] ?? "athlete").replace(/[._-]+/g, " "),
        intent,
        focusWorkout: {
          id: focus.id,
          activity_type: focus.activity_type,
          start_time: focus.start_time,
        },
        comparisons,
        patterns,
        reflectionNotes,
        progress,
        conversationHistory: history ?? [],
      };

      const payload = await narrate(question, ctx);

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
