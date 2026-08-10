import { Worker, Job } from "bullmq";
import { redisConnection } from "../../config/redis";
import { supabase } from "../../config/supabase";
import {
  CORRELATION_CHECKS,
  evaluateCheck,
  type CheckInput,
  type DiscoveredPattern,
  type PairedSample,
} from "../../utils/correlation";
import { logger } from "../../utils/logger";

/**
 * BullMQ worker for the `correlationQueue`.
 *
 * Job payload: { userId, activityType? }. The worker fetches the user's
 * recent workouts + reflections, runs each pre-defined check, and
 * upserts the resulting DiscoveredPattern rows into `discovered_patterns`.
 *
 * Unlike the baseline worker, this one is REPLACING — every run wipes
 * the user's prior patterns for the affected checks and writes the
 * fresh results. That's the simplest way to handle "no longer
 * significant" without tracking soft-delete state.
 */

export interface CorrelationJobData {
  userId: string;
  activityType?: string;
}

const FETCH_LIMIT = 500;

export const correlationWorker = new Worker(
  "correlationQueue",
  async (job: Job<CorrelationJobData>) => {
    const { userId, activityType } = job.data;
    if (!userId) throw new Error("correlationWorker: missing userId");

    // 1. Pull workouts + reflections in one go. Reflections live in a
    //    separate table; Supabase's PostgREST lets us embed them via
    //    the `reflections(*)` select.
    const { data: rows, error } = await supabase
      .from("workouts")
      .select(
        "id, activity_type, start_time, metrics, status, reflections(effort_rating, energy_level, notes)",
      )
      .eq("user_id", userId)
      .eq("status", "valid")
      .order("start_time", { ascending: false })
      .limit(FETCH_LIMIT);

    if (error) {
      logger.error(`correlationWorker fetch failed for user ${userId}:`, error);
      throw error;
    }

    const workouts = (rows ?? []).filter((r) =>
      activityType ? r.activity_type === activityType : true,
    );

    // 2. Run each check on the relevant subset of workouts.
    const fired: Array<{
      check: (typeof CORRELATION_CHECKS)[number];
      pattern: DiscoveredPattern;
    }> = [];

    for (const check of CORRELATION_CHECKS) {
      const paired: PairedSample[] = [];
      for (const w of workouts) {
        // Only consider workouts of activity types this check applies to.
        if (!check.appliesTo.includes(w.activity_type as never)) continue;

        const input: CheckInput = {
          workout: {
            activity_type: w.activity_type as never,
            start_time: w.start_time as string,
            metrics: (w.metrics ?? {}) as Record<string, unknown>,
          },
          reflection:
            Array.isArray(w.reflections) && w.reflections.length > 0
              ? {
                  effort_rating: w.reflections[0].effort_rating ?? null,
                  energy_level: w.reflections[0].energy_level ?? null,
                  notes: w.reflections[0].notes ?? null,
                }
              : null,
        };
        const x = check.extractX(input);
        const y = check.extractY(input);
        if (x === null || y === null) continue;
        paired.push({ activity_type: input.workout.activity_type, x, y });
      }

      if (paired.length === 0) continue;
      const pattern = evaluateCheck(check, paired);
      if (pattern === null) continue;
      fired.push({ check, pattern });
    }

    // 3. Replace: wipe rows for any (user, check_name) we just evaluated,
    //    then re-insert the ones that fired. Wrapped in a try so a
    //    transient failure doesn't leave the user with stale patterns.
    const evaluatedCheckNames = CORRELATION_CHECKS.map((c) => c.name);
    if (evaluatedCheckNames.length > 0) {
      const { error: delErr } = await supabase
        .from("discovered_patterns")
        .delete()
        .eq("user_id", userId)
        .in("check_name", evaluatedCheckNames);
      if (delErr) {
        logger.warn(
          `correlationWorker: delete-before-write failed for user ${userId}:`,
          delErr,
        );
      }
    }

    if (fired.length === 0) {
      logger.info(`correlationWorker: nothing fired for user ${userId}`);
      return { fired: 0 };
    }

    const writeRows = fired.map(({ pattern }) => ({
      user_id: userId,
      check_name: pattern.check_name,
      activity_type: pattern.activity_type,
      metric_x: pattern.metric_x,
      metric_y: pattern.metric_y,
      pearson_r: pattern.pearson_r,
      sample_count: pattern.sample_count,
      direction: pattern.direction,
      threshold: pattern.threshold,
      template_summary: pattern.template_summary,
      computed_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from("discovered_patterns")
      .upsert(writeRows, {
        onConflict: "user_id,check_name,activity_type",
      });

    if (upsertErr) {
      logger.error("correlationWorker: upsert failed:", upsertErr);
      throw upsertErr;
    }

    logger.info(
      `correlationWorker: ${fired.length} pattern(s) for user ${userId}` +
        (activityType ? ` / ${activityType}` : ""),
    );

    return { fired: fired.length };
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

correlationWorker.on("failed", (job, err) => {
  logger.error(`correlationWorker job ${job?.id} failed:`, err);
});
