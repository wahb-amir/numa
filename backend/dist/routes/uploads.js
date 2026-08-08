"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const queues_1 = require("../jobs/queues");
exports.uploadRouter = (0, express_1.Router)();
const upload = (0, multer_1.default)({
  storage: multer_1.default.memoryStorage(),
});
exports.uploadRouter.post(
  "/",
  auth_1.requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const userId = req.user.id;
      const originalFilename = file.originalname;
      const fileExt = originalFilename.split(".").pop()?.toLowerCase() || "";
      if (!["csv", "gpx"].includes(fileExt)) {
        return res.status(400).json({
          error: "Unsupported file type. Only CSV and GPX are allowed.",
        });
      }
      const fileKey = `${userId}/${Date.now()}_${originalFilename}`;
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } =
        await supabase_1.supabase.storage
          .from("raw-uploads")
          .upload(fileKey, file.buffer, {
            contentType: file.mimetype,
          });
      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        return res
          .status(500)
          .json({ error: "Failed to upload file to storage" });
      }
      // Insert to raw_uploads table using the admin client because the user might not have
      // an active session in the backend context if we only have the token for RLS.
      // Actually, we can use standard insert with service key or try to pass token.
      // We will use service key for this background job orchestration.
      const { data: dbData, error: dbError } = await supabase_1.supabase
        .from("raw_uploads")
        .insert({
          user_id: userId,
          file_key: fileKey,
          original_filename: originalFilename,
          file_type: fileExt,
          upload_status: "pending",
        })
        .select()
        .single();
      if (dbError) {
        console.error("Database insert error:", dbError);
        return res
          .status(500)
          .json({ error: "Failed to record upload in database" });
      }
      // Enqueue job
      await queues_1.uploadQueue.add("processUpload", {
        uploadId: dbData.id,
        userId,
        fileKey,
        fileType: fileExt,
      });
      return res.status(202).json({
        message: "Upload accepted and processing started",
        uploadId: dbData.id,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
exports.uploadRouter.get(
  "/:id/status",
  auth_1.requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { data, error } = await supabase_1.supabase
        .from("raw_uploads")
        .select("upload_status, error_message")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (error || !data) {
        return res.status(404).json({ error: "Upload not found" });
      }
      return res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
