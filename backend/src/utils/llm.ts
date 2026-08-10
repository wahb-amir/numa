/**
 * Groq client for the Phase 2 narration layer.
 *
 * The LLM's job is narrow and well-scoped: given (a) a user question,
 * (b) the relevant baseline/comparison numbers, (c) any fired
 * correlation patterns, produce a natural-language explanation in the
 * Observation / Possible Contributors / Evidence Count structure the
 * frontend already knows how to render.
 *
 * Crucially: the LLM is NEVER asked to invent statistics. Every number
 * in the prompt is pre-computed by the stats layer. The model is a
 * narrator, not an analyst.
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
 * chat-interface already renders { observation, possible_contributors,
 * evidence_count, confidence, alternatives }.
 */
export interface NarrationPayload {
  observation: string;
  possible_contributors: string[];
  evidence_count: number;
  confidence: "low" | "moderate" | "high";
  alternatives: string[];
}

/**
 * Build the prompt. We deliberately:
 *   - Restate every number we're given so the model can't hallucinate.
 *   - Require the model to respond in JSON.
 *   - Forbid the model from citing any number it wasn't given.
 */
const buildPrompt = (
  question: string,
  ctx: {
    displayName: string;
    comparison?: {
      metric_label: string;
      value: number;
      baseline_mean: number;
      baseline_stddev: number;
      deviation_pct: number | null;
      label: string;
    } | null;
    patterns: Array<{
      check_name: string;
      template_summary: string;
      pearson_r: number;
      sample_count: number;
    }>;
    reflectionNotes: string[];
  },
): string => {
  const comparisonBlock = ctx.comparison
    ? `Metric: ${ctx.comparison.metric_label}
Today: ${ctx.comparison.value.toFixed(2)}
Baseline (14d): ${ctx.comparison.baseline_mean.toFixed(2)} ± ${ctx.comparison.baseline_stddev.toFixed(2)}
Deviation: ${ctx.comparison.deviation_pct !== null ? ctx.comparison.deviation_pct.toFixed(1) + "%" : "n/a"}
Bucket: ${ctx.comparison.label}
`
    : "No baseline comparison data available.";

  const patternsBlock =
    ctx.patterns.length === 0
      ? "No verified patterns available."
      : ctx.patterns
          .map(
            (p) =>
              `- (${p.check_name}, r=${p.pearson_r.toFixed(2)}, n=${p.sample_count}) ${p.template_summary}`,
          )
          .join("\n");

  const notesBlock =
    ctx.reflectionNotes.length === 0
      ? "No recent reflection notes."
      : ctx.reflectionNotes.map((n) => `- "${n}"`).join("\n");

  return `You are Numa, a careful health-data narrator for ${ctx.displayName}.

You must respond with a single JSON object (no prose, no markdown) matching this schema:
{
  "observation": string,             // 1–2 sentences, ONLY using numbers from the context below
  "possible_contributors": string[], // 0–4 short clauses explaining the deviation
  "evidence_count": number,          // integer — how many sessions back the observation is
  "confidence": "low" | "moderate" | "high",
  "alternatives": string[]           // 0–3 alternative explanations the user could consider
}

Rules:
- NEVER invent a number. Every figure must come from the Context block.
- If the context is empty / insufficient, set observation to a single sentence saying so and confidence to "low".
- "alternatives" should not contradict the observation — they're things the user could verify or rule out.
- Keep the tone calm, non-judgmental, and aligned with Numa's epistemic-humility design.

User question:
"""
${question}
"""

Context:
${comparisonBlock}

Verified patterns:
${patternsBlock}

Recent reflection notes:
${notesBlock}

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
  ctx: Parameters<typeof buildPrompt>[1],
): Promise<NarrationPayload | null> => {
  const client = getClient();
  if (!client) return null;

  const prompt = buildPrompt(question, ctx);

  try {
    const completion = await client.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "You are Numa. Always reply with a single JSON object — no markdown, no prose.",
        },
        { role: "user", content: prompt },
      ],
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
    };
  } catch (err) {
    logger.error("Groq narration failed:", err);
    return null;
  }
};