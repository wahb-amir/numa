import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { supabase, getScopedSupabaseClient } from "../config/supabase";
import {
  narrate,
  isLlmConfigured,
  type ComparisonContext,
  type PatternContext,
  type ProgressContext,
  type DatedNote,
  type LoadContext,
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
 * Derive a short, human-readable title for a new chat session from the
 * first user message. We deliberately don't ask the LLM to do this — it
 * would add a round-trip on every new session, and a 60-char trim of the
 * question is "good enough" for a sidebar label.
 */
const deriveTitle = (question: string): string => {
  const cleaned = question.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 60).trimEnd() + "…";
};

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
  // Persistent chat session. When omitted, the route creates a new
  // session, derives a title from the first message, and returns the
  // id in the response. When provided, the prior turns are loaded
  // from chat_messages and used as the LLM's conversation history.
  session_id: z.string().uuid().optional(),
  // Recent conversation history (max 6 turns kept to bound input
  // size). Used so the model can reference its own previous responses
  // when the user follows up with subjective experience that the data
  // doesn't corroborate. The route treats this as untrusted text —
  // the model is told it's user/assistant history in the prompt.
  // Ignored when session_id is present — the DB is the source of
  // truth in that case.
  history: z.array(turnSchema).max(6).optional(),
});

/**
 * Order matters here. The load intent checks first so "am I training
 * too much right now" doesn't get caught by deviation's "right now" —
 * load questions need the training_load_vs_avg_hr pattern + the
 * last-7-sessions effort slice, not a one-workout comparison. Trend
 * checks second (it overlaps with load on "this month / last month"
 * phrasing). Deviation is last among the three — it stays useful for
 * "why was my HR high" style questions, but never for broad "am I …"
 * framing.
 */
const LOAD_KEYWORDS =
  /\b(too much|too hard|over.?training|over.?reaching|over.?doing|loading|training load|training volume|weekly load|last 7|this week|this cycle|burnt out|burned out|too fatigued|pushing too hard)\b/;
const TREND_KEYWORDS =
  /\b(progress|trend|over time|over the past|recent weeks|recent months|getting better|getting worse|improving|declining|stable|long.term|this month|last month|last few weeks|last few months|how have i been|am i getting)\b/;
const PATTERN_KEYWORDS =
  /\b(affect|impact|effect|cause[sd]?|correlate|relationship|because of|due to|related to|connected|linked|with less|with more|after less|after more|when i sleep|when i train|on days|less sleep|more sleep|effort rating)\b/;
const DEVIATION_KEYWORDS =
  /\b(last|this|today|specific|why was|why is|why was|what happened|high|low|fast|slow|elevated|off|strange|unusual|out of|outlier|peak|spike|dip|drop)\b/;

const classifyIntent = (question: string): QuestionIntent => {
  const q = question.toLowerCase();
  if (LOAD_KEYWORDS.test(q)) return "load";
  if (TREND_KEYWORDS.test(q)) return "trend";
  if (PATTERN_KEYWORDS.test(q)) return "pattern";
  if (DEVIATION_KEYWORDS.test(q)) return "deviation";
  return "general";
};

// ─── Session persistence ─────────────────────────────────────────────────────
// The /chat page renders a left rail of past conversations (Claude/ChatGPT
// style). These four endpoints back it: list, create, load messages, rename,
// delete. All four are RLS-scoped to req.token via getScopedSupabaseClient
// so a user can only ever touch their own sessions.

const sessionCreateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  focus_workout_id: z.string().uuid().optional(),
});

const sessionPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});

/**
 * GET /api/chat/sessions
 * Returns the current user's chat sessions ordered by most recently
 * updated. message_count is computed in a single round-trip via the
 * Supabase relational query API.
 */
chatRouter.get(
  "/sessions",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const token = req.token!;
      const userClient = getScopedSupabaseClient(token);

      const { data, error } = await userClient
        .from("chat_sessions")
        .select("id, title, focus_workout_id, created_at, updated_at, chat_messages(count)")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        logger.error("list chat sessions error:", error);
        return res.status(500).json({ error: "Failed to list sessions" });
      }

      // Flatten the relational count into a plain number for the client.
      const sessions = (data ?? []).map((row) => {
        const raw = row as typeof row & {
          chat_messages: Array<{ count: number }> | null;
        };
        return {
          id: raw.id,
          title: raw.title,
          focus_workout_id: raw.focus_workout_id,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
          message_count: raw.chat_messages?.[0]?.count ?? 0,
        };
      });

      return res.status(200).json(sessions);
    } catch (error) {
      logger.error("list chat sessions error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * POST /api/chat/sessions
 * Creates a new (empty) chat session. The narrate endpoint also creates
 * sessions lazily when called without a session_id, so this endpoint is
 * mainly used by the `+ New chat` button in the history sidebar.
 */
chatRouter.post(
  "/sessions",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const token = req.token!;
      const parsed = sessionCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const userClient = getScopedSupabaseClient(token);
      const { data, error } = await userClient
        .from("chat_sessions")
        .insert({
          user_id: userId,
          title: parsed.data.title ?? "New chat",
          focus_workout_id: parsed.data.focus_workout_id ?? null,
        })
        .select("id, title, focus_workout_id, created_at, updated_at")
        .single();

      if (error || !data) {
        logger.error("create chat session error:", error);
        return res.status(500).json({ error: "Failed to create session" });
      }

      return res.status(201).json({ ...data, message_count: 0 });
    } catch (error) {
      logger.error("create chat session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * GET /api/chat/sessions/:id/messages
 * Returns the full ordered transcript for one session. The frontend uses
 * this to hydrate a session that was loaded from the history sidebar.
 */
chatRouter.get(
  "/sessions/:id/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = sessionIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ error: "Invalid session id" });
      }
      const token = req.token!;
      const userClient = getScopedSupabaseClient(token);

      // RLS handles the ownership check — a session belonging to
      // another user simply returns 0 rows here.
      const { data, error } = await userClient
        .from("chat_messages")
        .select("id, role, content, narration, created_at")
        .eq("session_id", params.data.id)
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("load messages error:", error);
        return res.status(500).json({ error: "Failed to load messages" });
      }

      return res.status(200).json(data ?? []);
    } catch (error) {
      logger.error("load messages error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * PATCH /api/chat/sessions/:id
 * Rename a session. (focus_workout_id is settable on create only for v1.)
 */
chatRouter.patch(
  "/sessions/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = sessionIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ error: "Invalid session id" });
      }
      const parsed = sessionPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: parsed.error.flatten().fieldErrors,
        });
      }
      if (parsed.data.title === undefined) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const token = req.token!;
      const userClient = getScopedSupabaseClient(token);
      const { data, error } = await userClient
        .from("chat_sessions")
        .update({ title: parsed.data.title })
        .eq("id", params.data.id)
        .select("id, title, focus_workout_id, created_at, updated_at")
        .maybeSingle();

      if (error) {
        logger.error("rename session error:", error);
        return res.status(500).json({ error: "Failed to rename session" });
      }
      if (!data) {
        return res.status(404).json({ error: "Session not found" });
      }

      return res.status(200).json(data);
    } catch (error) {
      logger.error("rename session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * DELETE /api/chat/sessions/:id
 * Cascades to chat_messages via the FK ON DELETE CASCADE.
 */
chatRouter.delete(
  "/sessions/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const params = sessionIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ error: "Invalid session id" });
      }

      const token = req.token!;
      const userClient = getScopedSupabaseClient(token);
      const { error, count } = await userClient
        .from("chat_sessions")
        .delete({ count: "exact" })
        .eq("id", params.data.id);

      if (error) {
        logger.error("delete session error:", error);
        return res.status(500).json({ error: "Failed to delete session" });
      }
      if (!count) {
        return res.status(404).json({ error: "Session not found" });
      }

      return res.status(204).send();
    } catch (error) {
      logger.error("delete session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

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
      const { question, workout_id, session_id, history } = parsed.data;
      const userId = req.user!.id;
      const token = req.token!;

      if (!isLlmConfigured()) {
        return res.status(503).json({
          error: "LLM not configured",
          detail:
            "Set GROQ_API_KEY on the backend to enable narration. The stats pipeline still works without it.",
        });
      }

      // Resolve the chat session. RLS scopes both writes to the
      // current user — if session_id is provided but doesn't belong
      // to them, the insert/select returns 0 rows and we 404.
      const userClient = getScopedSupabaseClient(token);
      let sessionRow: { id: string; title: string } | null = null;
      if (session_id) {
        const { data } = await userClient
          .from("chat_sessions")
          .select("id, title")
          .eq("id", session_id)
          .maybeSingle();
        if (!data) {
          return res.status(404).json({ error: "Session not found" });
        }
        sessionRow = data;
      } else {
        const { data, error } = await userClient
          .from("chat_sessions")
          .insert({ user_id: userId, title: deriveTitle(question) })
          .select("id, title")
          .single();
        if (error || !data) {
          logger.error("create session error:", error);
          return res
            .status(500)
            .json({ error: "Failed to create session" });
        }
        sessionRow = data;
      }
      const activeSessionId = sessionRow.id;

      // Persist the user turn immediately so even a model failure
      // leaves the question in the transcript.
      await userClient.from("chat_messages").insert({
        session_id: activeSessionId,
        user_id: userId,
        role: "user",
        content: question,
      });

      // When we're persisting turns, the DB is the source of truth
      // for conversation history. Load the last 6 prior messages
      // (excluding the one we just inserted) and pass them to the
      // LLM in the same shape the legacy client-side `history`
      // field used.
      let resolvedHistory: Array<{ role: "user" | "assistant"; content: string }> =
        history ?? [];
      if (session_id) {
        const { data: priorMessages } = await userClient
          .from("chat_messages")
          .select("role, content, narration")
          .eq("session_id", activeSessionId)
          .order("created_at", { ascending: true });

        const last6 = (priorMessages ?? []).slice(-7, -1); // exclude the one we just wrote
        resolvedHistory = last6.map((m) => {
          const role = m.role as "user" | "assistant";
          if (role === "user") {
            return { role, content: m.content as string };
          }
          const narration = m.narration as
            | { observation?: string; takeaway?: string }
            | null;
          // For assistant turns prefer takeaway (the 1-2 sentence
          // grounded interpretation) since it's the most concise
          // representation of the reply. Fall back to the raw
          // observation, then the stored content.
          const text =
            narration?.takeaway?.trim() ||
            narration?.observation?.trim() ||
            (m.content as string);
          return { role, content: text };
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

      // 5. For load questions ("am I training too much right now?"),
      //    fetch a small accumulated-load slice: the
      //    training_load_vs_avg_hr pattern (already filtered into the
      //    `patterns` block above; we just pull it out here) and the
      //    last 7 reflections with their effort rating + energy level
      //    + free-text note. This gives the model evidence about how
      //    the user has actually FELT across the recent week — the
      //    dimension the single-workout comparison can't speak to.
      //    Deliberately not computing a new metric (no ACWR, no
      //    TRIMP) — the Phase-2 rule is that the LLM never invents
      //    numbers; a fresh calculation here would be the same kind
      //    of leak.
      let loadContext: LoadContext | null = null;
      if (intent === "load") {
        const loadPattern =
          patterns.find(
            (p) => p.check_name === "training_load_vs_avg_hr",
          ) ?? null;

        const { data: recentEffort } = await supabase
          .from("reflections")
          .select(
            "workout_id, notes, effort_rating, energy_level, created_at",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(7);

        const effortSlice = (recentEffort ?? [])
          .filter((r) => {
            const hasNumeric =
              r.effort_rating !== null && r.effort_rating !== undefined;
            const hasNote =
              typeof r.notes === "string" && r.notes.trim().length > 0;
            const hasEnergy =
              r.energy_level !== null && r.energy_level !== undefined;
            return hasNumeric || hasNote || hasEnergy;
          })
          .map((r) => ({
            date: (r.created_at as string).slice(0, 10),
            workout_id: (r.workout_id as string | null) ?? null,
            effort_rating: r.effort_rating as number | null,
            energy_level: (r.energy_level as string | null) ?? null,
            note: (r.notes as string | null) ?? null,
          }));

        loadContext = {
          pattern: loadPattern,
          recentSessions: effortSlice,
        };
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
        loadContext,
        conversationHistory: resolvedHistory,
      };

      const payload = await narrate(question, ctx);

      if (!payload) {
        return res.status(503).json({
          error: "Narration failed",
          detail:
            "The model call did not return a valid response. Please try again.",
        });
      }

      // Persist the assistant turn with the full narration JSON so
      // reloading the session later replays every signal (takeaway,
      // sources, questions_for_you, etc.) without re-running the LLM.
      await userClient.from("chat_messages").insert({
        session_id: activeSessionId,
        user_id: userId,
        role: "assistant",
        content: payload.observation,
        narration: payload,
      });

      return res.status(200).json({ ...payload, session_id: activeSessionId });
    } catch (error) {
      logger.error("chat narrate error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
