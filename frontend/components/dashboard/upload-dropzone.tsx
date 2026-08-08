"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, CheckCircle, AlertCircle, Loader2, CloudUpload } from "lucide-react";
import { signUpload, completeUpload, getUploadStatus } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type UploadStatus = "idle" | "signing" | "uploading" | "processing" | "success" | "error";

export function UploadDropzone() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filename, setFilename] = useState("");

  // Poll the backend until the background worker finishes (or fails)
  const pollStatus = (uploadId: string) => {
    setStatus("processing");
    const interval = setInterval(async () => {
      try {
        const data = await getUploadStatus(uploadId);
        if (data.upload_status === "complete") {
          setStatus("success");
          clearInterval(interval);
        } else if (data.upload_status === "failed") {
          setStatus("error");
          setErrorMessage(data.error_message || "Processing failed");
          clearInterval(interval);
        }
      } catch {
        setStatus("error");
        setErrorMessage("Failed to check processing status");
        clearInterval(interval);
      }
    }, 2000);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setErrorMessage("");
    setUploadProgress(0);
    setFilename(file.name);

    try {
      // ── Step 1: Ask the backend to create a signed upload URL ──────────
      setStatus("signing");
      const { signedUrl, uploadId } = await signUpload(file.name);

      // ── Step 2: Upload the file DIRECTLY to Supabase Storage ───────────
      setStatus("uploading");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage upload failed with status ${xhr.status}`));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      // ── Step 3: Notify the backend to enqueue the processing job ───────
      await completeUpload(uploadId);

      // ── Step 4: Poll until the worker finishes ─────────────────────────
      pollStatus(uploadId);
    } catch (err: unknown) {
      setStatus("error");
      const apiErr = err as { response?: { data?: { error?: string } }; message?: string };
      setErrorMessage(apiErr?.response?.data?.error ?? apiErr?.message ?? "Upload failed");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/gpx+xml": [".gpx"],
      "application/xml": [".gpx"],
      "text/xml": [".gpx"],
    },
    maxFiles: 1,
    disabled: status !== "idle",
  });

  const resetState = () => {
    setStatus("idle");
    setErrorMessage("");
    setUploadProgress(0);
    setFilename("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Activity Data</CardTitle>
        <p className="text-xs text-text-muted mt-1">
          Drag &amp; drop a CSV or GPX file — uploads directly and securely to storage.
        </p>
      </CardHeader>

      <CardContent>
        {/* ── Idle / Dropzone ── */}
        {status === "idle" && (
          <div
            {...getRootProps()}
            id="upload-dropzone"
            className={`cursor-pointer rounded-card border-2 border-dashed p-12 text-center transition-colors duration-150 ${
              isDragActive
                ? "border-accent-emerald bg-accent-emerald-soft/40"
                : "border-border hover:border-accent-emerald/50 hover:bg-surface-sunken"
            }`}
          >
            <input {...getInputProps()} aria-label="Upload CSV or GPX file" />
            <CloudUpload
              className={`mx-auto mb-4 h-10 w-10 transition-colors ${
                isDragActive ? "text-accent-emerald" : "text-text-muted"
              }`}
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-text-primary">
              {isDragActive ? "Drop the file here" : "Drag & drop a CSV or GPX file"}
            </p>
            <p className="mt-1.5 text-xs text-text-muted">or click to browse your files</p>
            <div className="mt-4 flex justify-center gap-2">
              {[".csv", ".gpx"].map((ext) => (
                <span
                  key={ext}
                  className="rounded-chip border border-border-strong bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                >
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Signing (getting upload URL) ── */}
        {status === "signing" && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-accent-emerald" aria-hidden="true" />
            <p className="text-sm font-semibold text-text-primary">Preparing secure upload…</p>
            <p className="mt-1 text-xs text-text-muted">Generating a signed URL</p>
          </div>
        )}

        {/* ── Uploading directly to Supabase ── */}
        {status === "uploading" && (
          <div className="flex flex-col items-center justify-center gap-5 p-12 text-center">
            <Upload className="h-10 w-10 text-accent-emerald" aria-hidden="true" />
            <div className="w-full max-w-xs">
              <div className="mb-2 flex justify-between text-xs text-text-muted">
                <span className="truncate font-medium text-text-primary">{filename}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
                className="w-full overflow-hidden rounded-full bg-surface-sunken"
              >
                <div
                  className="h-2 rounded-full bg-accent-emerald transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-text-secondary">Uploading directly to secure storage…</p>
          </div>
        )}

        {/* ── Processing (background worker) ── */}
        {status === "processing" && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-status-attention" aria-hidden="true" />
            <p className="text-sm font-semibold text-text-primary">Processing activity data…</p>
            <p className="mt-1.5 text-xs text-text-muted">
              Numa is parsing your file and extracting metrics. This usually takes a few seconds.
            </p>
          </div>
        )}

        {/* ── Success ── */}
        {status === "success" && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-positive-soft">
              <CheckCircle className="h-7 w-7 text-status-positive" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-text-primary">Upload processed!</p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Your data has been ingested. Head to the Dashboard to see it reflected.
            </p>
            <button
              onClick={resetState}
              className="mt-6 rounded-control border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken transition-colors"
            >
              Upload another file
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-concerning-soft">
              <AlertCircle className="h-7 w-7 text-status-concerning" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-status-concerning">Upload failed</p>
            <p className="mt-1.5 text-sm text-text-secondary">
              {errorMessage || "Something went wrong during the upload."}
            </p>
            <button
              onClick={resetState}
              className="mt-6 rounded-control border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
