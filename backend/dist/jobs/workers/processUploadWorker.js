"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processUploadWorker = exports.uploadEvents = void 0;
const bullmq_1 = require("bullmq");
const events_1 = require("events");
const redis_1 = require("../../config/redis");
const supabase_1 = require("../../config/supabase");
const queues_1 = require("../queues");
const csvParser_1 = require("../../utils/csvParser");
const gpxParser_1 = require("../../utils/gpxParser");
const logger_1 = require("../../utils/logger");
const emitProgress = (e) => {
    const event = { ...e, ts: Date.now() };
    exports.uploadEvents.emit("progress", event);
};
/**
 * Process-local EventEmitter the WSS layer subscribes to. Keyed by
 * `uploadId` so subscribers only get events for their upload.
 */
exports.uploadEvents = new events_1.EventEmitter();
// Allow many concurrent WSS subscribers without warnings.
exports.uploadEvents.setMaxListeners(0);
exports.processUploadWorker = new bullmq_1.Worker("uploadQueue", async (job) => {
    const { uploadId, userId, fileKey, fileType } = job.data;
    let parsedWorkouts = [];
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
        await supabase_1.supabase
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
        const { data: fileData, error: downloadError } = await supabase_1.supabase.storage
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
            const result = await (0, csvParser_1.parseCsvDetailed)(fileBuffer, userId, uploadId);
            parsedWorkouts = result.workouts;
            parsedAccepted = result.stats.accepted;
            parsedRejected = result.stats.rejected;
        }
        else {
            const result = await (0, gpxParser_1.parseGpxDetailed)(fileBuffer, userId, uploadId);
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
            const { error: insertError } = await supabase_1.supabase
                .from("workouts")
                .insert(workout);
            if (insertError) {
                if (insertError.code === "23505") {
                    skipped++;
                    continue;
                }
                // Surface other errors but don't abort the whole upload —
                // a single bad row shouldn't kill the batch.
                logger_1.logger.error(`Failed to insert workout from upload ${uploadId}:`, insertError);
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
        await supabase_1.supabase
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
            ...new Set(parsedWorkouts.map((w) => w.activity_type)),
        ];
        for (const type of activityTypes) {
            await queues_1.baselineQueue.add("computeBaselines", {
                userId,
                activityType: type,
            });
            await queues_1.correlationQueue.add("computeCorrelations", {
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
    }
    catch (error) {
        logger_1.logger.error(`Upload processing failed for ${uploadId}:`, error);
        // Best-effort cleanup: remove the broken file from storage so it
        // doesn't accumulate as junk in the bucket. If removal fails we
        // log and continue — the failure to mark-as-failed is the more
        // important write to land.
        try {
            const { error: removeError } = await supabase_1.supabase.storage
                .from("raw-uploads")
                .remove([fileKey]);
            if (removeError) {
                logger_1.logger.warn(`Could not delete errored file ${fileKey} from storage:`, removeError);
            }
            else {
                logger_1.logger.info(`Deleted errored file ${fileKey} from storage`);
            }
        }
        catch (cleanupErr) {
            logger_1.logger.warn(`Storage cleanup threw for ${fileKey}:`, cleanupErr);
        }
        await supabase_1.supabase
            .from("raw_uploads")
            .update({
            upload_status: "failed",
            error_message: error.message || "Unknown error occurred during processing",
        })
            .eq("id", uploadId);
        emitProgress({
            uploadId,
            userId,
            phase: "failed",
            percent: 100,
            message: "Upload failed",
            error_message: error.message || "Unknown error occurred during processing",
        });
        throw error;
    }
}, {
    connection: redis_1.redisConnection,
    concurrency: 5,
});
exports.processUploadWorker.on("failed", (job, err) => {
    logger_1.logger.error(`Job ${job?.id} failed:`, err);
});
