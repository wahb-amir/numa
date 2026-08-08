"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const queues_1 = require("../jobs/queues");
exports.uploadRouter = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// POST /uploads/sign
// Generate a signed upload URL so the frontend can PUT a file directly to
// Supabase Storage without routing the bytes through the backend.
// Body: { filename: string }
// Returns: { signedUrl: string, uploadId: string, fileKey: string }
// ---------------------------------------------------------------------------
exports.uploadRouter.post("/sign", auth_1.requireAuth, async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename || typeof filename !== "string") {
            return res.status(400).json({ error: "filename is required" });
        }
        const fileExt = filename.split(".").pop()?.toLowerCase() ?? "";
        if (!["csv", "gpx"].includes(fileExt)) {
            return res.status(400).json({
                error: "Unsupported file type. Only CSV and GPX files are allowed.",
            });
        }
        const userId = req.user.id;
        const fileKey = `${userId}/${Date.now()}_${filename}`;
        // Create a signed upload URL (the frontend will PUT directly to this URL)
        const { data: signedData, error: signError } = await supabase_1.supabase.storage
            .from("raw-uploads")
            .createSignedUploadUrl(fileKey);
        if (signError || !signedData) {
            console.error("Signed URL error:", signError);
            return res.status(500).json({ error: "Failed to generate upload URL" });
        }
        // Record the pending upload in the database so we can track it
        const { data: dbData, error: dbError } = await supabase_1.supabase
            .from("raw_uploads")
            .insert({
            user_id: userId,
            file_key: fileKey,
            original_filename: filename,
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
        return res.status(200).json({
            signedUrl: signedData.signedUrl,
            token: signedData.token,
            fileKey,
            uploadId: dbData.id,
        });
    }
    catch (error) {
        console.error("Sign upload error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// ---------------------------------------------------------------------------
// POST /uploads/:id/complete
// Called by the frontend after it has successfully PUT the file to Supabase.
// Enqueues the background processing job.
// ---------------------------------------------------------------------------
exports.uploadRouter.post("/:id/complete", auth_1.requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        // Look up the upload, verifying ownership
        const { data: upload, error: fetchError } = await supabase_1.supabase
            .from("raw_uploads")
            .select("id, file_key, file_type, upload_status")
            .eq("id", id)
            .eq("user_id", userId)
            .single();
        if (fetchError || !upload) {
            return res.status(404).json({ error: "Upload not found" });
        }
        if (upload.upload_status !== "pending") {
            return res.status(409).json({
                error: `Upload is already in status '${upload.upload_status}'`,
            });
        }
        // Enqueue processing job
        await queues_1.uploadQueue.add("processUpload", {
            uploadId: upload.id,
            userId,
            fileKey: upload.file_key,
            fileType: upload.file_type,
        });
        return res.status(202).json({
            message: "Processing started",
            uploadId: upload.id,
        });
    }
    catch (error) {
        console.error("Complete upload error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// ---------------------------------------------------------------------------
// GET /uploads/:id/status
// Poll the processing status of a given upload.
// ---------------------------------------------------------------------------
exports.uploadRouter.get("/:id/status", auth_1.requireAuth, async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
