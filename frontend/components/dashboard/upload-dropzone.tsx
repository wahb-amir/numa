"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  CloudUpload,
} from "lucide-react";
import { signUpload, completeUpload, getUploadStatus } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type UploadStatus =
  | "idle"
  | "signing"
  | "uploading"
  | "processing"
  | "success"
  | "error";

type UploadPhase =
  | "received"
  | "downloading"
  | "parsing"
  | "parsed"
  | "inserting"
  | "persisted"
  | "baselines"
  | "complete"
  | "failed";

// Phase label shown in the UI; falls back to a generic "Processing" label
// while we're connecting or before the first WS message lands.
const PHASE_LABELS: Partial<Record<UploadPhase, string>> = {
  received: "Job received",
  downloading: "Downloading file",
  parsing: "Parsing file",
  parsed: "File parsed",
  inserting: "Saving workouts",
  persisted: "Workouts saved",
  baselines: "Recomputing baselines",
  complete: "Done",
  failed: "Failed",
};

export function UploadDropzone() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filename, setFilename] = useState("");
  const [pipelinePhase, setPipelinePhase] = useState<UploadPhase | null>(null);
  const [pipelinePercent, setPipelinePercent] = useState(0);
  const [pipelineMessage, setPipelineMessage] = useState("");

  // Keep the fallback poller handle so we can clear it if the WS takes over.
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Cleanup WS + interval on unmount.
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Last-resort fallback if the WS server is unreachable (e.g. behind a
  // proxy that strips Upgrade headers). Polls `GET /uploads/:id/status`.
  const startFallbackPoll = (uploadId: string) => {
    if (pollIntervalRef.current) return;
    setStatus("processing");
    pollIntervalRef.current = setInterval(async () => {
      try {
        const data = await getUploadStatus(uploadId);
        if (data.upload_status === "complete") {
          setStatus("success");
          setPipelinePhase("complete");
          setPipelinePercent(100);
          setPipelineMessage(PHASE_LABELS.complete ?? "");
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } else if (data.upload_status === "failed") {
          setStatus("error");
          setErrorMessage(data.error_message || "Processing failed");
          setPipelinePhase("failed");
          setPipelineMessage(data.error_message || "Processing failed");
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch {
        // Swallow individual poll errors; the next tick will retry.
      }
    }, 2000);
  };

  // Subscribe to the backend's WebSocket progress channel. On any failure
  // (handshake rejected, network down, etc.) we fall back to polling so
  // uploads still complete.
  const subscribeToProgress = async (uploadId: string) => {
    if (typeof window === "undefined") return;
    setStatus("processing");

    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    // /api is the REST mount; WSS lives at the same host root.
    const wsBase = apiBase.replace(/\/api\/?$/, "").replace(/^http/, "ws");

    // JWT goes in the query string because browsers can't set custom
    // headers on a WebSocket upgrade request. Fetch the token fresh from
    // Supabase so we always send a non-expired one.
    let token: string | null = null;
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      token = session?.access_token ?? null;
    } catch {
      // fall through; we'll fall back to polling below if no token
    }

    const params = new URLSearchParams({ uploadId });
    if (token) params.set("token", token);
    const url = `${wsBase}/ws/uploads?${params.toString()}`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      startFallbackPoll(uploadId);
      return;
    }

    wsRef.current = socket;
    let settled = false;

    // 8s open timeout — if we don't get the upgrade, fall back to polling.
    const openTimeout = setTimeout(() => {
      if (settled) return;
      if (socket.readyState !== WebSocket.OPEN) {
        settled = true;
        socket.close();
        wsRef.current = null;
        startFallbackPoll(uploadId);
      }
    }, 8000);

    socket.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data) as {
          uploadId: string;
          phase: UploadPhase;
          percent: number;
          message?: string;
          error_message?: string;
        };

        if (e.uploadId !== uploadId) return;

        setPipelinePhase(e.phase);
        setPipelinePercent(e.percent);
        setPipelineMessage(
          e.message ?? PHASE_LABELS[e.phase] ?? "Processing…",
        );

        if (e.phase === "complete") {
          settled = true;
          clearTimeout(openTimeout);
          setStatus("success");
          socket.close();
          wsRef.current = null;
        } else if (e.phase === "failed") {
          settled = true;
          clearTimeout(openTimeout);
          setStatus("error");
          setErrorMessage(e.error_message || "Processing failed");
          socket.close();
          wsRef.current = null;
        }
      } catch {
        // ignore malformed messages
      }
    };

    socket.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(openTimeout);
      wsRef.current = null;
      startFallbackPoll(uploadId);
    };

    socket.onclose = (ev) => {
      clearTimeout(openTimeout);
      // 4408 = server-side rejection after we sent auth (unauthorized /
      // not found). Treat as a fallback trigger so the user still gets a
      // status update.
      if (!settled && ev.code !== 1000) {
        settled = true;
        wsRef.current = null;
        startFallbackPoll(uploadId);
      }
    };
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setErrorMessage("");
    setUploadProgress(0);
    setFilename(file.name);
    setPipelinePhase(null);
    setPipelinePercent(0);
    setPipelineMessage("");

    try {
      // ── Step 1: Ask the backend to create a signed upload URL ─────────
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
            reject(
              new Error(`Storage upload failed with status ${xhr.status}`),
            );
          }
        });
        xhr.addEventListener("error", () =>
          reject(new Error("Network error during upload")),
        );
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream",
        );
        xhr.send(file);
      });

      // ── Step 3: Notify the backend to enqueue the processing job ───────
      await completeUpload(uploadId);

      // ── Step 4: Subscribe to live pipeline progress via WebSocket ─────
      subscribeToProgress(uploadId);
    } catch (err: unknown) {
      setStatus("error");
      const apiErr = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setErrorMessage(
        apiErr?.response?.data?.error ?? apiErr?.message ?? "Upload failed",
      );
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
    setPipelinePhase(null);
    setPipelinePercent(0);
    setPipelineMessage("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Activity Data</CardTitle>
        <p className="text-xs text-text-muted mt-1">
          Drag &amp; drop a CSV or GPX file — uploads directly and securely to
          storage.
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
              {isDragActive
                ? "Drop the file here"
                : "Drag & drop a CSV or GPX file"}
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              or click to browse your files
            </p>
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
            <Loader2
              className="mb-4 h-10 w-10 animate-spin text-accent-emerald"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-text-primary">
              Preparing secure upload…
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Generating a signed URL
            </p>
          </div>
        )}

        {/* ── Uploading directly to Supabase ── */}
        {status === "uploading" && (
          <div className="flex flex-col items-center justify-center gap-5 p-12 text-center">
            <Upload
              className="h-10 w-10 text-accent-emerald"
              aria-hidden="true"
            />
            <div className="w-full max-w-xs">
              <div className="mb-2 flex justify-between text-xs text-text-muted">
                <span className="truncate font-medium text-text-primary">
                  {filename}
                </span>
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
            <p className="text-sm text-text-secondary">
              Uploading directly to secure storage…
            </p>
          </div>
        )}

        {/* ── Processing (background worker) ── */}
        {status === "processing" && (
          <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <Loader2
              className="h-10 w-10 animate-spin text-status-attention"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-text-primary">
              {pipelineMessage || "Processing activity data…"}
            </p>
            {pipelinePhase && (
              <p className="text-xs text-text-muted">
                Step: <span className="font-medium">{pipelinePhase}</span>
              </p>
            )}
            <div
              role="progressbar"
              aria-valuenow={pipelinePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Processing progress"
              className="w-full max-w-xs overflow-hidden rounded-full bg-surface-sunken"
            >
              <div
                className="h-2 rounded-full bg-status-attention transition-all duration-200"
                style={{ width: `${pipelinePercent}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              Numa is parsing your file and extracting metrics. This usually
              takes a few seconds.
            </p>
          </div>
        )}

        {/* ── Success ── */}
        {status === "success" && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-positive-soft">
              <CheckCircle
                className="h-7 w-7 text-status-positive"
                aria-hidden="true"
              />
            </div>
            <p className="text-base font-semibold text-text-primary">
              Upload processed!
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Your data has been ingested. Head to the Dashboard to see it
              reflected.
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
              <AlertCircle
                className="h-7 w-7 text-status-concerning"
                aria-hidden="true"
              />
            </div>
            <p className="text-base font-semibold text-status-concerning">
              Upload failed
            </p>
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