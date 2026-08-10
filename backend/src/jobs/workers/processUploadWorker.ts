import { Worker, Job } from "bullmq";
import { EventEmitter } from "events";
import { redisConnection } from "../../config/redis";
import { supabase } from "../../config/supabase";
import { baselineQueue, correlationQueue } from "../queues";
import { parseCsvDetailed } from "../../utils/csvParser";
import { parseGpxDetailed } from "../../utils/gpxParser";
import { logger } from "../../utils/logger";

/**
 * Phases emitted on the `uploadEvents` EventEmitter so the WSS layer can
 * stream live progress to the frontend. `percent` is a coarse 0-100
 * estimate; `message` is a short human-readable label safe for UI use.
 */
export type UploadPhase =
  | "received"
  | "downloading"
  | "parsing"
  | "parsed"
  | "inserting"
  | "persisted"
  | "baselines"
  | "complete"
  | "failed";

export interface UploadProgressEvent {
  uploadId: string;
  userId: string;
  phase: UploadPhase;
  percent: number;
  message: string;
  accepted?: number;
  rejected?: number;
  inserted?: number;
  skipped?: number;
  error_message?: string;
  ts: number; // Date.now()
}

const emitProgress = (e: Omit<UploadProgressEvent, "ts">) => {
  const event: UploadProgressEvent = { ...e, ts: Date.now() };
  uploadEvents.emit("progress", event);
};

/**
 * Process-local EventEmitter the WSS layer subscribes to. Keyed by
 * `uploadId` so subscribers only get events for their upload.
 */
export const uploadEvents = new EventEmitter();
// Allow many concurrent WSS subscribers without warnings.
uploadEvents.setMaxListeners(0);

export const processUploadWorker = new Worker(
  "uploadQueue",
  async (job: Job) => {
    const { uploadId, userId, fileKey, fileType } = job.data;

    let parsedWorkouts: any[] = [];
    let parsedAccepted = 0;
    let parsedRejected = 0;

    try {
      emitProgress({
        uploadId,
        userId,
        phase: "received",
        percent: 5,
        message: "Job received",
      });

      // 1. Mark as processing
      await supabase
        .from("raw_uploads")
        .update({ upload_status: "processing" })
        .eq("id", uploadId);

      // 2. Download from storage
      emitProgress({
        uploadId,
        userId,
        phase: "downloading",
        percent: 15,
        message: "Downloading file from storage",
      });

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("raw-uploads")
        .download(fileKey);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      // 3. Parse file
      emitProgress({
        uploadId,
        userId,
        phase: "parsing",
        percent: 30,
        message: `Parsing ${fileType.toUpperCase()}`,
      });

      const fileBuffer = Buffer.from(await fileData.arrayBuffer());

      if (fileType === "csv") {
        const result = await parseCsvDetailed(fileBuffer, userId, uploadId);
        parsedWorkouts = result.workouts;
        parsedAccepted = result.stats.accepted;
        parsedRejected = result.stats.rejected;
      } else {
        const result = await parseGpxDetailed(fileBuffer, userId, uploadId);
        parsedWorkouts = result.workouts;
        parsedAccepted = result.stats.tracksParsed;
        parsedRejected = result.parseErrors.length;
      }

      emitProgress({
        uploadId,
        userId,
        phase: "parsed",
        percent: 60,
        message: `Parsed ${parsedAccepted} row(s)`,
        accepted: parsedAccepted,
        rejected: parsedRejected,
      });

      // 4. Validate & Insert
      emitProgress({
        uploadId,
        userId,
        phase: "inserting",
        percent: 70,
        message: `Inserting ${parsedWorkouts.length} workout(s)`,
      });

      let inserted = 0;
      let skipped = 0;
      for (const workout of parsedWorkouts) {
        const { error: insertError } = await supabase
          .from("workouts")
          .insert(workout);

        if (insertError) {
          if (insertError.code === "23505") {
            skipped++;
            continue;
          }
          // Surface other errors but don't abort the whole upload —
          // a single bad row shouldn't kill the batch.
          logger.error(
            `Failed to insert workout from upload ${uploadId}:`,
            insertError,
          );
          skipped++;
          continue;
        }
        inserted++;
      }

      emitProgress({
        uploadId,
        userId,
        phase: "persisted",
        percent: 90,
        message: `Saved ${inserted} workout(s)`,
        inserted,
        skipped,
      });

      // 5. Complete
      await supabase
        .from("raw_uploads")
        .update({ upload_status: "complete" })
        .eq("id", uploadId);

      // 6. Enqueue baselines (pass an array of unique activity types found)
      emitProgress({
        uploadId,
        userId,
        phase: "baselines",
        percent: 95,
        message: "Scheduling baseline recompute",
      });

      const activityTypes = [
        ...new Set(parsedWorkouts.map((w: any) => w.activity_type)),
      ];
      for (const type of activityTypes) {
        await baselineQueue.add("computeBaselines", {
          userId,
          activityType: type,
        });
        await correlationQueue.add("computeCorrelations", {
          userId,
          activityType: type,
        });
      }

      emitProgress({
        uploadId,
        userId,
        phase: "complete",
        percent: 100,
        message: "Upload complete",
        inserted,
        skipped,
      });
    } catch (error: any) {
      logger.error(`Upload processing failed for ${uploadId}:`, error);

      // Best-effort cleanup: remove the broken file from storage so it
      // doesn't accumulate as junk in the bucket. If removal fails we
      // log and continue — the failure to mark-as-failed is the more
      // important write to land.
      try {
        const { error: removeError } = await supabase.storage
          .from("raw-uploads")
          .remove([fileKey]);
        if (removeError) {
          logger.warn(
            `Could not delete errored file ${fileKey} from storage:`,
            removeError,
          );
        } else {
          logger.info(`Deleted errored file ${fileKey} from storage`);
        }
      } catch (cleanupErr) {
        logger.warn(
          `Storage cleanup threw for ${fileKey}:`,
          cleanupErr,
        );
      }

      await supabase
        .from("raw_uploads")
        .update({
          upload_status: "failed",
          error_message:
            error.message || "Unknown error occurred during processing",
        })
        .eq("id", uploadId);

      emitProgress({
        uploadId,
        userId,
        phase: "failed",
        percent: 100,
        message: "Upload failed",
        error_message:
          error.message || "Unknown error occurred during processing",
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

processUploadWorker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});
