import { Worker, Job } from "bullmq";
import { redisConnection } from "../../config/redis";
import { supabase } from "../../config/supabase";
import { baselineQueue } from "../queues";
import { parseCsv } from "../../utils/csvParser";
import { parseGpx } from "../../utils/gpxParser";

export const processUploadWorker = new Worker(
  "uploadQueue",
  async (job: Job) => {
    const { uploadId, userId, fileKey, fileType } = job.data;

    try {
      // 1. Mark as processing
      await supabase
        .from("raw_uploads")
        .update({ upload_status: "processing" })
        .eq("id", uploadId);

      // 2. Download from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("raw-uploads")
        .download(fileKey);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      // 3. Parse file
      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      const parsedWorkouts =
        fileType === "csv"
          ? await parseCsv(fileBuffer, userId, uploadId)
          : await parseGpx(fileBuffer, userId, uploadId);

      // 4. Validate & Insert
      for (const workout of parsedWorkouts) {
        const { error: insertError } = await supabase
          .from("workouts")
          .insert(workout);

        if (insertError && insertError.code !== "23505") {
          // Ignore unique violations
          console.error(
            `Failed to insert workout from upload ${uploadId}:`,
            insertError,
          );
        }
      }

      // 5. Complete
      await supabase
        .from("raw_uploads")
        .update({ upload_status: "complete" })
        .eq("id", uploadId);

      // 6. Enqueue baselines (pass an array of unique activity types found)
      const activityTypes = [
        ...new Set(parsedWorkouts.map((w: any) => w.activity_type)),
      ];
      for (const type of activityTypes) {
        await baselineQueue.add("computeBaselines", {
          userId,
          activityType: type,
        });
      }
    } catch (error: any) {
      console.error(`Upload processing failed for ${uploadId}:`, error);

      await supabase
        .from("raw_uploads")
        .update({
          upload_status: "failed",
          error_message:
            error.message || "Unknown error occurred during processing",
        })
        .eq("id", uploadId);

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

processUploadWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
