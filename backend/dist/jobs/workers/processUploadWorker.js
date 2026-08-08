"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processUploadWorker = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../config/redis");
const supabase_1 = require("../../config/supabase");
const queues_1 = require("../queues");
const csvParser_1 = require("../../utils/csvParser");
const gpxParser_1 = require("../../utils/gpxParser");
exports.processUploadWorker = new bullmq_1.Worker("uploadQueue", async (job) => {
    const { uploadId, userId, fileKey, fileType } = job.data;
    try {
        // 1. Mark as processing
        await supabase_1.supabase
            .from("raw_uploads")
            .update({ upload_status: "processing" })
            .eq("id", uploadId);
        // 2. Download from storage
        const { data: fileData, error: downloadError } = await supabase_1.supabase.storage
            .from("raw-uploads")
            .download(fileKey);
        if (downloadError || !fileData) {
            throw new Error(`Failed to download file: ${downloadError?.message}`);
        }
        // 3. Parse file
        const fileBuffer = Buffer.from(await fileData.arrayBuffer());
        const parsedWorkouts = fileType === "csv"
            ? await (0, csvParser_1.parseCsv)(fileBuffer, userId, uploadId)
            : await (0, gpxParser_1.parseGpx)(fileBuffer, userId, uploadId);
        // 4. Validate & Insert
        for (const workout of parsedWorkouts) {
            const { error: insertError } = await supabase_1.supabase
                .from("workouts")
                .insert(workout);
            if (insertError && insertError.code !== "23505") {
                // Ignore unique violations
                console.error(`Failed to insert workout from upload ${uploadId}:`, insertError);
            }
        }
        // 5. Complete
        await supabase_1.supabase
            .from("raw_uploads")
            .update({ upload_status: "complete" })
            .eq("id", uploadId);
        // 6. Enqueue baselines (pass an array of unique activity types found)
        const activityTypes = [
            ...new Set(parsedWorkouts.map((w) => w.activity_type)),
        ];
        for (const type of activityTypes) {
            await queues_1.baselineQueue.add("computeBaselines", {
                userId,
                activityType: type,
            });
        }
    }
    catch (error) {
        console.error(`Upload processing failed for ${uploadId}:`, error);
        await supabase_1.supabase
            .from("raw_uploads")
            .update({
            upload_status: "failed",
            error_message: error.message || "Unknown error occurred during processing",
        })
            .eq("id", uploadId);
        throw error;
    }
}, {
    connection: redis_1.redisConnection,
    concurrency: 5,
});
exports.processUploadWorker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
});
