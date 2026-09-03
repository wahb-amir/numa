/**
 * Groq client for the Phase 2 narration layer.
 *
 * The LLM's job is narrow and well-scoped: given (a) a user question,
 * (b) the relevant baseline/comparison numbers, (c) any fired
 * correlation patterns, (d) month-over-month progress, and (e) dated
 * reflection notes, produce a natural-language explanation in the
 * Observation / Possible Contributors / Evidence Count structure the
 * frontend already knows how to render.
 *
 * Crucially: the LLM is NEVER asked to invent statistics. Every number
 * in the prompt is pre-computed by the stats layer. The model is a
 * narrator — the route is responsible for picking the right context to
 * show it, and the prompt is responsible for telling it HOW to use
 * that context.
 */

import Groq from "groq-sdk";
import { env } from "../config/env";
import { logger } from "../utils/logger";

let cachedClient: Groq | null = null;

/**
 * Lazily create a Groq client. If GROQ_API_KEY is unset we surface a
 * sentinel `null` so callers can return a 503 without crashing.
 */
const getClient = (): Groq | null => {
  if (!env.GROQ_API_KEY) return null;
  if (!cachedClient) {
    cachedClient = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return cachedClient;
};

export const isLlmConfigured = (): boolean => Boolean(env.GROQ_API_KEY);

/**
 * The exact shape we want back from the model. The frontend's
 * chat-interface renders { observation, possible_contributors,
 * evidence_count, confidence, alternatives }, and exposes the
 * structured `sources` payload as a collapsible "View the data"
 * disclosure so users can see exactly what numbers backed the claim.
 */
export interface NarrationPayload {
  observation: string;
  /**
   * 1–2 sentences giving a grounded interpretation of the question
   * when the data supports one. Optional — the model leaves it empty
   * when it doesn't. Designed to be the "what Numa actually thinks"
   * field, distinct from `observation` (which strictly restates the
   * pre-computed numbers). Citable from the Context blocks; never
   * from outside knowledge.
   */
  takeaway?: string;
  possible_contributors: string[];
  evidence_count: number;
  confidence: "low" | "moderate" | "high";
  alternatives: string[];
  questions_for_you: string[];
  sources: NarrationSources;
}

/**
 * Structured data backing the narration. Returned alongside the
 * narrator's prose so the UI can show the actual numbers — every
 * field here is pre-computed by the stats layer (the model never
 * adds to it). `progress` is empty unless the question's intent is
 * "trend".
 */
export interface NarrationSources {
  focus_workout: {
    id: string;
    activity_type: string;
    start_time: string;
  };
  comparisons: ComparisonContext[];
  patterns: PatternContext[];
  notes: DatedNote[];
  progress: ProgressContext[];
}

/**
 * One metric's deviation vs the focus workout's 14-day baseline. The
 * route builds one entry per metric that has a baseline; the model
 * picks which to surface.
 */
export interface ComparisonContext {
  metric_name: string;
  metric_label: string;
  unit: string;
  value: number;
  baseline_mean: number;
  baseline_stddev: number;
  deviation_pct: number | null;
  label: string;
}

/**
 * One verified correlation pattern. The `template_summary` is the
 * fixed string the worker wrote; the model should paraphrase it in
 * context, not restate it verbatim.
 */
export interface PatternContext {
  check_name: string;
  template_summary: string;
  pearson_r: number;
  sample_count: number;
  activity_type: string | null;
}

/**
 * One month-over-month direction for a (metric, activity). The model
 * uses this to answer "how is my progress going" without making up
 * numbers.
 */
export interface ProgressContext {
  metric_name: string;
  metric_label: string;
  activity_type: string;
  earliest_month_mean: number | null;
  latest_month_mean: number | null;
  pct_change: number | null;
  direction: "improving" | "declining" | "stable";
  confidence: "high" | "moderate" | "low";
  earliest_month: string | null;
  latest_month: string | null;
}

/**
 * A reflection note pinned to a specific past session. The model is
 * told to surface these only when they are temporally relevant to the
 * focus workout or the question.
 */
export interface DatedNote {
  date: string; // YYYY-MM-DD
  workout_id: string | null; // null if not the focus workout
  note: string;
}

/**
 * The accumulated-load evidence bundle, fetched only when intent is
 * `load`. Combines the training_load_vs_avg_hr pattern (the only
 * pre-computed correlation that talks about load) with the last
 * several reflection notes + their numeric effort rating + the
 * energy_level chip. Together they're enough for the model to reason
 * about whether the user is overdoing it without inventing a metric.
 */
export interface LoadContext {
  pattern: PatternContext | null;
  /**
   * Most recent first. Empty effort_rating / energy_level / note
   * fields are allowed — the model is told which are present vs
   * absent so it doesn't quote blanks.
   */
  recentSessions: Array<{
    date: string;
    workout_id: string | null;
    effort_rating: number | null; // 1–10
    energy_level: string | null; // "low" | "normal" | "high"
    note: string | null;
  }>;
}

/**
 * A cheap heuristic classification of the user's question into one of
 * four intents. The route uses this to decide which context blocks to
 * fetch. The prompt also receives the intent label so the model can
 * orient itself.
 */
export type QuestionIntent = "deviation" | "trend" | "pattern" | "load" | "general";

/**
 * One turn from the conversation history (frontend → backend → LLM).
 * Only the prose matters for the model; the structured sources are
 * re-built by the route from fresh DB reads on each call.
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The shape the route hands to `narrate`. The contract is:
 *   - `comparisons` is always populated (every metric with a baseline
 *     for the focus workout's activity).
 *   - `patterns` is up to 5 verified patterns, freshest first.
 *   - `reflectionNotes` is a SHORT date-stamped list — focus workout's
 *     note first, then the 3 most recent. Never a "menu" of 5 random
 *     notes.
 *   - `progress` is populated only when intent is "trend".
 *   - `conversationHistory` is the recent chat (last ~6 turns). Used
 *     so the model can reference its own previous responses when the
 *     user follows up with subjective experience.
 */
export interface NarrateContext {
  displayName: string;
  intent: QuestionIntent;
  focusWorkout: {
    id: string;
    activity_type: string;
    start_time: string;
  };
  comparisons: ComparisonContext[];
  patterns: PatternContext[];
  reflectionNotes: DatedNote[];
  progress: ProgressContext[];
  /**
   * Loaded only for `load` intent (training-load / overtraining /
   * "am I doing too much" questions). Null otherwise. The route
   * keeps it null when intent is anything else so the prompt doesn't
   * distract the model with extra evidence it didn't ask for.
   */
  loadContext: LoadContext | null;
  conversationHistory: ConversationTurn[];
}

/**
 * Build the prompt. We deliberately:
 *   - Restate every number we're given so the model can't hallucinate.
 *   - Require the model to respond in JSON.
 *   - Forbid the model from citing any number it wasn't given.
 *   - Force the model to read the question, detect contradictions, and
 *     ground evidence in patterns / dated notes (not make them up).
 */
const buildPrompt = (question: string, ctx: NarrateContext): string => {
  const comparisonsBlock =
    ctx.comparisons.length === 0
      ? "No baseline comparison data available."
      : ctx.comparisons
          .map(
            (c) =>
              `- ${c.metric_label} (${ctx.focusWorkout.activity_type}): ` +
              `today ${c.value.toFixed(2)} ${c.unit}, ` +
              `baseline ${c.baseline_mean.toFixed(2)} ± ${c.baseline_stddev.toFixed(2)}, ` +
              `deviation ${c.deviation_pct !== null ? c.deviation_pct.toFixed(1) + "%" : "n/a"}, ` +
              `bucket "${c.label}"`,
          )
          .join("\n");

  const patternsBlock =
    ctx.patterns.length === 0
      ? "No verified patterns available."
      : ctx.patterns
          .map(
            (p) =>
              `- (${p.check_name}, r=${p.pearson_r.toFixed(2)}, n=${p.sample_count}) ${p.template_summary}`,
          )
          .join("\n");

  // For deviation intents the focus workout's note is at the top. The
  // model is told to prefer it when explaining the focus workout.
  const notesBlock =
    ctx.reflectionNotes.length === 0
      ? "No recent reflection notes."
      : ctx.reflectionNotes
          .map((n) => {
            const tag = n.workout_id === ctx.focusWorkout.id ? "focus workout" : "recent";
            return `- ${n.date} (${tag}): "${n.note}"`;
          })
          .join("\n");

  const progressBlock =
    ctx.progress.length === 0
      ? "Not requested for this question."
      : ctx.progress
          .map(
            (p) =>
              `- ${p.metric_label} (${p.activity_type}): ${p.direction}, ` +
              `${p.pct_change !== null ? p.pct_change.toFixed(1) + "%" : "n/a"} change ` +
              `from ${p.earliest_month ?? "earliest month"} to ${p.latest_month ?? "latest month"}, ` +
              `${p.confidence} confidence, n=${p.earliest_month_mean !== null && p.latest_month_mean !== null ? "" : ""}means ${p.earliest_month_mean?.toFixed(2) ?? "n/a"} → ${p.latest_month_mean?.toFixed(2) ?? "n/a"}`,
          )
          .join("\n");

  // Load block is only populated for `load` intent. When present, it
  // gives the model the accumulated-load evidence so the takeaway can
  // cite real signals (effort ratings, note text) instead of inventing
  // a TRIMP/ACWR number. Empty / null fields are marked so the model
  // doesn't paste blanks.
  const loadBlock =
    ctx.loadContext === null
      ? "Not requested for this question."
      : (() => {
          const lines: string[] = [];
          lines.push(
            ctx.loadContext.pattern
              ? `- pattern: ${ctx.loadContext.pattern.check_name} (r=${ctx.loadContext.pattern.pearson_r.toFixed(2)}, n=${ctx.loadContext.pattern.sample_count}) — ${ctx.loadContext.pattern.template_summary}`
              : "- pattern: training_load_vs_avg_hr has not yet accumulated enough samples.",
          );
          if (ctx.loadContext.recentSessions.length === 0) {
            lines.push("- recent sessions: no reflection entries yet.");
          } else {
            for (const s of ctx.loadContext.recentSessions) {
              const bits: string[] = [`date ${s.date}`];
              if (s.effort_rating !== null)
                bits.push(`effort ${s.effort_rating}/10`);
              if (s.energy_level) bits.push(`energy ${s.energy_level}`);
              if (s.note) bits.push(`note "${s.note}"`);
              lines.push(`- ${bits.join(", ")}`);
            }
          }
          return lines.join("\n");
        })();

  // Conversation history (Rule 7). Rendered as a transcript so the
  // model can see both sides. The current user turn is duplicated in
  // the explicit "User question" block below — that's intentional for
  // prompt clarity when history is empty.
  const historyBlock =
    ctx.conversationHistory.length === 0
      ? "No prior turns in this conversation."
      : ctx.conversationHistory
          .map((t) =>
            t.role === "user"
              ? `User: ${t.content}`
              : `Numa: ${t.content}`
          )
          .join("\n");

  const intentGuidance: Record<QuestionIntent, string> = {
    deviation:
      "The user is asking about a specific session. Anchor your answer on the focus workout and the Comparisons block.",
    trend:
      "The user is asking how things are changing over time. Anchor your answer on the Progress block. Comparisons describe ONE session, not a trend — only mention them if they illustrate the trend.",
    pattern:
      "The user is asking about a relationship between two variables. Anchor your answer on the Verified Patterns block. Cite the r value and sample count when you mention a pattern.",
    load:
      "The user is asking whether their training load is too high (overtraining, overreaching, 'am I training too much'). Anchor your answer on the Load block — the training_load_vs_avg_hr pattern plus the most recent reflection entries (effort rating + energy level + free-text note). The single-workout comparison is NOT the right frame for load questions; reach for it only if it illustrates the load story.",
    general:
      "No specific intent was detected. Use whichever context block is most relevant to the question. If the question is a casual follow-up (e.g. 'thanks', 'any thoughts?'), keep the reply short — a one- or two-sentence takeaway is enough; the UI will collapse it.",
  };

  return `You are Numa, a thoughtful health-data coach for ${ctx.displayName}. Your job is to read the user's question, ground your answer in the Context blocks below, and respond in a way that respects both the numbers and the user's lived experience.

QUESTION INTENT: ${ctx.intent}
${intentGuidance[ctx.intent]}

FOCUS WORKOUT:
- id: ${ctx.focusWorkout.id}
- activity: ${ctx.focusWorkout.activity_type}
- date: ${ctx.focusWorkout.start_time.slice(0, 10)}

You must respond with a single JSON object (no prose, no markdown) matching this schema:
{
  "observation": string,             // 1–3 sentences. Direct answer to the user's question, citing the specific numbers from the Context blocks (today's value vs the baseline mean ± stddev, the deviation %, the r value & n of any pattern cited, etc). May be empty "" for purely casual follow-ups — see Rule 6b.
  "takeaway": string,                // Optional. 1–2 sentences. A grounded interpretation or recommendation the user can act on. See Rule 8. May be empty "" when the data doesn't support a position.
  "possible_contributors": string[], // 0–4 items. Each is either a verified pattern (with r & n) or a dated reflection note whose date is relevant to the focus workout. Empty array when nothing qualifies.
  "evidence_count": number,          // integer. Number of sessions the observation is based on.
  "confidence": "low" | "moderate" | "high",
  "alternatives": string[],          // 0–3 items. Things the user could check that ARE NOT in the data.
  "questions_for_you": string[]      // 0–3 short clarifying questions. Use ONLY when the data alone cannot answer well — see Rule 6. Empty in most cases.
}

EIGHT RULES — follow them in order:

1. READ THE QUESTION. Find the metric or concept the user named and pull it from the Comparisons block (for a specific metric), the Progress block (for a trend), the Verified Patterns block (for a relationship), or the Load block (for overtraining / load questions). Do not paste blocks at random. If the question is casual and doesn't map to any block, focus on whatever block best fits and keep the reply short.

2. CHECK FOR CONTRADICTIONS GENTLY. If the user's question implies a deviation that the data does NOT show (for example, "why was my heart rate high" when the data shows heart rate is LOWER than baseline), say so explicitly — but do NOT lead with a hostile reframe. A simple, calm acknowledgement works: "Based on the data, your last run's heart rate was actually 6.7% lower than your 14-day baseline — was there a specific session you meant, or shall I look at the trend instead?" Set confidence to "low" when the question's premise does not match the data, but never read as a dismissal.

3. USE VERIFIED PATTERNS AS EVIDENCE. If a pattern directly explains the deviation, the trend, or the load, mention it in possible_contributors with its r value and sample count. Paraphrase the template_summary in the context of the question — do not restate it verbatim. If a pattern is not relevant to the question, do not mention it.

4. EVIDENCE IS NOT A MENU. Each reflection note is pinned to a specific past session (date, focus vs. recent). Only surface notes whose date is temporally relevant to the focus workout (same day) or clearly tied to the question. For load intent, the Load block's recentSessions list IS the evidence — surface entries whose effort ratings or notes speak to the question (e.g. multiple "not fully recovered" notes, escalating effort). If no entries are relevant, set possible_contributors to an empty array.

5. CITE THE SPECIFIC NUMBERS. Your observation is shown to the user as a claim — it must include the actual numbers from the Context blocks that back it. Quote today's value, baseline mean (with stddev), deviation %, the r value of any pattern cited, the effort ratings you surface. The user can collapse the message to see the raw data; if your prose and the numbers don't agree, the user loses trust.

6. HANDLE SUBJECTIVE GAPS WITH CARE. When the user describes subjective experience ("I feel tired/exhausted/sore/sluggish/off/burnt out/not recovering/sleeping at a different time") and the data does NOT corroborate it directly, do BOTH of these — not one or the other:
   (a) Acknowledge the gap honestly in the observation or takeaway. Never pretend the data confirms something it doesn't.
   (b) Reach for the user's OWN context before resorting to questions: check the reflection notes in the Recent Notes block and the recentSessions list in the Load block. If the user has multiple recent notes saying "not fully recovered" or "felt tired", THAT is evidence — surface it in possible_contributors. Only fall back to questions_for_you when neither notes nor patterns explain the gap.

   Do NOT replace this with the boilerplate "check your sleep / nutrition / hydration" suggestions — those read as dismissal. Alternatives may still mention things the user can rule out, but they should be specific (e.g. "if your schedule shifted in the last week, note-timing changes can mimic fatigue" — only when the user has actually said something about timing).

6b. CASUAL FOLLOW-UPS. If the conversation history shows the user just got a substantive answer and the new turn is a brief follow-up ('thanks', 'makes sense', 'what should I do tonight?'), set observation to an empty string, write the entire reply in takeaway, and leave possible_contributors / alternatives / questions_for_you empty. The UI renders the takeaway-only form well.

7. USE CONVERSATION HISTORY. When the conversation history below contains prior turns, the user's current question may be a follow-up to your previous response. Read your prior observation, then the user's follow-up. If the user is pushing back ("but I feel tired", "that's not what I asked"), DO NOT answer the follow-up as if it were standalone. Reference your previous response, acknowledge the contradiction, and use Rule 6's gap-handling. If the question doesn't reference prior context, ignore the history.

8. TAKE A POSITION WHEN YOU CAN. The takeaway field is where Numa states a grounded interpretation: "looks within range", "worth a deload week", "sleep timing is the most likely driver", "increase easy-day volume by ~10%". Only state the takeaway when the Context blocks — Comparisons, Verified Patterns, Load block, Recent Notes — support it. The takeaway must be citeable: if you say "sleep timing is the most likely driver", the user should be able to find the user's own note about shifted sleep timing in the Recent Notes block. NEVER pull from outside knowledge (e.g. don't quote generic recovery science the data doesn't speak to). If the data is genuinely thin, leave takeaway empty rather than speculate — that's what Rule 6's confidence="low" already signals.

OTHER RULES:
- NEVER invent a number. Every figure must come from one of the Context blocks below.
- If the context is empty / insufficient AND the question isn't casual, set observation to a single sentence saying so and confidence to "low".
- "alternatives" should not contradict the observation — they're things the user could verify or rule out in the future.
- Keep the tone calm, non-judgmental, coachlike. Numa takes positions when earned and admits "I can't tell" when not.

User question:
"""
${question}
"""

Conversation history (most recent turns — use for follow-ups):
${historyBlock}

Context:

Comparisons (focus workout vs 14-day baseline):
${comparisonsBlock}

Verified patterns:
${patternsBlock}

Recent reflection notes (dated):
${notesBlock}

Progress over the past months (per metric):
${progressBlock}

Load (recent training-load evidence — only populated for load intent):
${loadBlock}

Respond with JSON only.`;
};

/**
 * Call Groq and return the parsed narration. Returns null on parse /
 * API failure (the route layer translates null to 503). The model's
 * free-form prose is constrained by the prompt to JSON, so we parse
 * defensively.
 */
export const narrate = async (
  question: string,
  ctx: NarrateContext,
  retries: number = 1
): Promise<NarrationPayload | null> => {
  const client = getClient();
  if (!client) return null;

  const prompt = buildPrompt(question, ctx);

  try {
    // Build the message thread: system prompt → prior turns → this
    // turn (with the full prompt as user content). Using the messages
    // array lets the model treat prior turns as native conversation
    // context, even though the structured data only lives in the
    // current prompt.
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are Numa. Always reply with a single JSON object — no markdown, no prose.",
      },
      ...ctx.conversationHistory.map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      })),
      { role: "user", content: prompt },
    ];

    const completion = await client.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 2500,
      messages,
      response_format: { type: "json_object" },
    });

    const text = completion.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    return {
      observation: String(parsed.observation ?? ""),
      takeaway:
        typeof parsed.takeaway === "string" && parsed.takeaway.trim().length > 0
          ? parsed.takeaway.trim()
          : undefined,
      possible_contributors: Array.isArray(parsed.possible_contributors)
        ? parsed.possible_contributors.map(String)
        : [],
      evidence_count:
        Number.isFinite(parsed.evidence_count) ? Number(parsed.evidence_count) : 0,
      confidence: ["low", "moderate", "high"].includes(parsed.confidence)
        ? parsed.confidence
        : "low",
      alternatives: Array.isArray(parsed.alternatives)
        ? parsed.alternatives.map(String)
        : [],
      questions_for_you: Array.isArray(parsed.questions_for_you)
        ? parsed.questions_for_you.map(String)
        : [],
      sources: {
        focus_workout: ctx.focusWorkout,
        comparisons: ctx.comparisons,
        patterns: ctx.patterns,
        notes: ctx.reflectionNotes,
        progress: ctx.progress,
      },
    };
  } catch (err) {
    logger.error("Groq narration failed:", err);
    if (retries > 0) {
      logger.info(`Retrying narrate... (${retries} retries left)`);
      return narrate(question, ctx, retries - 1);
    }
    
    // Graceful fallback instead of returning null to prevent 503
    return {
      observation: "I encountered an error while analyzing the data. Please try rephrasing your question.",
      evidence_count: 0,
      confidence: "low",
      possible_contributors: [],
      alternatives: [],
      questions_for_you: [],
      sources: {
        focus_workout: ctx.focusWorkout,
        comparisons: ctx.comparisons,
        patterns: ctx.patterns,
        notes: ctx.reflectionNotes,
        progress: ctx.progress,
      },
    };
  }
};
