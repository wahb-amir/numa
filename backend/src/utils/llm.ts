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
 * A cheap heuristic classification of the user's question into one of
 * four intents. The route uses this to decide which context blocks to
 * fetch. The prompt also receives the intent label so the model can
 * orient itself.
 */
export type QuestionIntent = "deviation" | "trend" | "pattern" | "general";

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
    general:
      "No specific intent was detected. Use whichever context block is most relevant to the question.",
  };

  return `You are Numa, a careful health-data narrator for ${ctx.displayName}.

QUESTION INTENT: ${ctx.intent}
${intentGuidance[ctx.intent]}

FOCUS WORKOUT:
- id: ${ctx.focusWorkout.id}
- activity: ${ctx.focusWorkout.activity_type}
- date: ${ctx.focusWorkout.start_time.slice(0, 10)}

You must respond with a single JSON object (no prose, no markdown) matching this schema:
{
  "observation": string,             // 1–2 sentences. MUST directly address the user's question AND cite the specific number(s) from the Context block that back your claim (today's value, the baseline mean, and the deviation). Example shape: "Your last run's heart rate was 162 bpm — 1.1% higher than your 14-day baseline of 160.2 ± 5.4 bpm (n=6 sessions)."
  "possible_contributors": string[], // 0–4 items. Each is either a verified pattern (with its r & n) or a dated reflection note whose date is relevant to the focus workout.
  "evidence_count": number,          // integer. Number of sessions the observation is based on.
  "confidence": "low" | "moderate" | "high",
  "alternatives": string[],          // 0–3 items. Things the user could check that ARE NOT in the data.
  "questions_for_you": string[]      // 0–3 short clarifying questions for the user. Empty in most cases — use when the data alone cannot answer the question well. See Rule 6.
}

SEVEN RULES — follow them in order:

1. READ THE QUESTION. Find the metric or concept the user named and pull it from the Comparisons block (for a specific metric), the Progress block (for a trend), or the Verified Patterns block (for a relationship). Do not paste blocks at random.

2. CHECK FOR CONTRADICTIONS IN THE DATA. If the user's question implies a deviation that the data does NOT show (for example, "why was my heart rate high" when the data shows heart rate is LOWER than baseline), say so explicitly. Phrase it as: "Based on the data, your last run's heart rate was actually ${"`X%`"} lower than your 14-day baseline (lower by ${"`Y bpm`"}) — was there a different workout you meant?" Set confidence to "low" when the question's premise does not match the data. Do not silently describe the deviation as if the question were correct.

3. USE VERIFIED PATTERNS AS EVIDENCE. If a pattern directly explains the deviation or the trend, mention it in possible_contributors with its r value and sample count. Paraphrase the template_summary in the context of the question — do not restate it verbatim. If a pattern is not relevant to the question, do not mention it.

4. EVIDENCE IS NOT A MENU. Each reflection note is pinned to a specific past session (date, focus vs. recent). Only surface notes whose date is temporally relevant to the focus workout (same day) or clearly tied to the question. If no notes are relevant, set possible_contributors to an empty array. Do NOT pick notes at random to fill the field.

5. CITE THE SPECIFIC NUMBERS. Your observation is shown to the user as a claim — it must include the actual numbers from the Context block that back it. Quote the today's value, the baseline mean (with stddev), and the deviation. The user can collapse the message to see the raw data; if your prose and the numbers don't agree, the user loses trust.

6. DETECT USER-vs-DATA GAPS. When the user describes subjective experience ("I feel tired/exhausted/sore/sluggish/off/burnt out/not recovering") and the data does NOT corroborate it (training load is typical, HR is typical, no pattern suggests overtraining), name the gap explicitly. Do NOT just suggest "check your sleep" in alternatives — that reads as dismissal. Instead, populate the questions_for_you array with 1–3 short, specific questions that, if answered, would help explain the gap. Examples: "How many hours did you sleep last night?", "When did you last take a full rest day?", "Has anything outside training changed this week — stress, work, travel?". The observation should also acknowledge the gap: "Based on the data I can see, your training load doesn't suggest overtraining, but your experience matters more than the numbers — a few questions that would help me understand:".

7. USE CONVERSATION HISTORY. When the conversation history below contains prior turns, the user's current question may be a follow-up to your previous response. Read your prior observation, then the user's follow-up. If the user is pushing back ("but I feel tired", "that's not what I asked"), DO NOT answer the follow-up as if it were standalone. Reference your previous response, acknowledge the contradiction, and use Rule 6's gap-detection. If the question doesn't reference prior context, ignore the history.

OTHER RULES:
- NEVER invent a number. Every figure must come from one of the Context blocks below.
- If the context is empty / insufficient, set observation to a single sentence saying so and confidence to "low".
- "alternatives" should not contradict the observation — they're things the user could verify or rule out in the future.
- Keep the tone calm, non-judgmental, and aligned with Numa's epistemic-humility design.

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
      max_tokens: 700,
      messages,
      response_format: { type: "json_object" },
    });

    const text = completion.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    return {
      observation: String(parsed.observation ?? ""),
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
    return null;
  }
};
