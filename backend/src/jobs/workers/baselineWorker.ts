import { Worker, Job } from "bullmq";
import { redisConnection } from "../../config/redis";
import { supabase } from "../../config/supabase";
import { computeBaselinesAllWindows } from "../../utils/baselines";
import { logger } from "../../utils/logger";

/**
 * BullMQ worker for the `baselineQueue`.
 *
 * Triggered whenever a new workout lands (upload, manual insert). Job
 * payload: { userId, activityType }. The worker fetches the user's full
 * valid-workout history for that activity type, recomputes both the
 * 14-day and 90-day rolling windows, and upserts one row per
 * (metric × activity × window) into the `baselines` table.
 *
 * Rows are gated by MIN_SAMPLES (defined in utils/baselines) — when a
 * window doesn't have enough data yet we simply don't write a row, and
 * the comparison endpoint reads the absence as `insufficient_data`.
 *
 * Concurrency 3: a busy user with multiple activities being recomputed
 * shouldn't serialize. Workers are isolated per-process via BullMQ.
 */

export interface BaselineJobData {
  userId: string;
  activityType?: string; // optional — when omitted, recompute all activities
}

export const baselineWorker = new Worker(
  "baselineQueue",
  async (job: Job<BaselineJobData>) => {
    const { userId, activityType } = job.data;
    if (!userId) throw new Error("baselineWorker: missing userId");

    // 1. Fetch all valid workouts for the user (small enough to fit in
    //    memory; the baselines module handles per-window filtering).
    const { data: rows, error } = await supabase
      .from("workouts")
      .select("activity_type, start_time, duration_seconds, metrics, status")
      .eq("user_id", userId)
      .eq("status", "valid")
      .order("start_time", { ascending: false })
      .limit(2000);

    if (error) {
      logger.error(`baselineWorker fetch failed for user ${userId}:`, error);
      throw error;
    }

    const allWorkouts = (rows ?? []).map((w) => ({
      activity_type: w.activity_type as
        | "running"
        | "cycling"
        | "gym"
        | "other",
      start_time: w.start_time as string,
      duration_seconds: w.duration_seconds as number,
      metrics: (w.metrics ?? {}) as Record<string, unknown>,
    }));

    const scope = activityType
      ? allWorkouts.filter((w) => w.activity_type === activityType)
      : allWorkouts;

    // 2. Compute both windows.
    const computed = activityType
      ? computeBaselinesAllWindows(
          activityType as "running" | "cycling" | "gym" | "other",
          scope,
        )
      : (() => {
          const out = [];
          const types = Array.from(
            new Set(scope.map((w) => w.activity_type)),
          );
          for (const t of types) {
            out.push(
              ...computeBaselinesAllWindows(
                t as "running" | "cycling" | "gym" | "other",
                scope,
              ),
            );
          }
          return out;
        })();

    if (computed.length === 0) {
      logger.info(
        `baselineWorker: no baseline rows to write for user ${userId}` +
          (activityType ? ` / activity ${activityType}` : ""),
      );
      return { written: 0 };
    }

    // 3. Upsert one row per (user, metric, activity, window_days). When
    //    a metric has gone from "enough data" → "not enough data", we
    //    delete the stale row so the comparison endpoint doesn't show a
    //    ghost baseline from a previous computation.
    const writeRows = computed.map((b) => ({
      user_id: userId,
      metric_name: b.metric_name,
      activity_type: b.activity_type,
      window_days: b.window_days,
      rolling_mean: b.rolling_mean,
      rolling_stddev: b.rolling_stddev,
      sample_count: b.sample_count,
      computed_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from("baselines")
      .upsert(writeRows, {
        onConflict: "user_id,metric_name,activity_type,window_days",
      });

    if (upsertErr) {
      logger.error(`baselineWorker upsert failed:`, upsertErr);
      throw upsertErr;
    }

    // 4. For each (metric, activity, window) the user has a baseline for,
    //    delete any other rows for the same triple that we didn't just
    //    write — these are stale windows (e.g. a 30d window from before
    //    we standardized on 14d/90d). Cheap because the table is small.
    const expected = new Set(
      computed.map(
        (b) =>
          `${b.metric_name}|${b.activity_type}|${b.window_days}`,
      ),
    );
    const { data: existing } = await supabase
      .from("baselines")
      .select("id, metric_name, activity_type, window_days")
      .eq("user_id", userId);
    const toDelete = (existing ?? [])
      .filter(
        (row) =>
          !expected.has(
            `${row.metric_name}|${row.activity_type}|${row.window_days}`,
          ),
      )
      .map((row) => row.id);
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("baselines")
        .delete()
        .in("id", toDelete);
      if (delErr) {
        logger.warn(
          `baselineWorker stale-row delete failed for user ${userId}:`,
          delErr,
        );
      }
    }

    logger.info(
      `baselineWorker: wrote ${writeRows.length} baseline row(s) for user ${userId}` +
        (activityType ? ` / ${activityType}` : ""),
    );

    return { written: writeRows.length };
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

baselineWorker.on("failed", (job, err) => {
  logger.error(`baselineWorker job ${job?.id} failed:`, err);
});