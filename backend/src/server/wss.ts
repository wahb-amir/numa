import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyJwt } from "../middleware/auth";
import { uploadEvents, UploadProgressEvent } from "../jobs/workers/processUploadWorker";
import { supabase } from "../config/supabase";
import { logger } from "../utils/logger";

/**
 * Augment WebSocket with our per-connection fields so we can identify
 * which upload/user each connection belongs to without a Map.
 */
interface UploadSocket extends WebSocket {
  userId: string;
  uploadId: string;
}

/**
 * Attach a WebSocket server to the same HTTP server Express is running on.
 * Required because Hugging Face Spaces only exposes a single port — we
 * can't `listen` twice.
 *
 * Path: /ws/uploads?token=<jwt>&uploadId=<uuid>
 *
 * The socket pushes a stream of UploadProgressEvent JSON messages for the
 * matching upload. If the client connects after the job already finished,
 * we replay the terminal status from the DB so the UI can catch up.
 */
export const attachWss = (httpServer: HttpServer): void => {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "", "http://localhost");
      if (url.pathname !== "/ws/uploads") {
        socket.destroy();
        return;
      }

      const token = url.searchParams.get("token");
      const uploadId = url.searchParams.get("uploadId");
      if (!token || !uploadId) {
        socket.destroy();
        return;
      }

      const user = await verifyJwt(token);

      wss.handleUpgrade(req, socket, head, (ws) => {
        const uploadWs = ws as UploadSocket;
        uploadWs.userId = user.id;
        uploadWs.uploadId = uploadId;
        wss.emit("connection", uploadWs, req);
      });
    } catch (err) {
      logger.error("WSS upgrade error:", err);
      socket.destroy();
    }
  });

  wss.on("connection", (ws: UploadSocket) => {
    const { userId, uploadId } = ws;
    logger.info(`WSS connected for upload ${uploadId} (user ${userId})`);

    // Ownership check: ensure the upload exists and belongs to this user.
    // Done in parallel with the event subscription so we don't block.
    supabase
      .from("raw_uploads")
      .select("id")
      .eq("id", uploadId)
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (!data) {
          ws.close(1008, "upload not found");
        }
      });

    const onProgress = (e: UploadProgressEvent) => {
      if (e.uploadId !== uploadId) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(e));
      }
    };
    uploadEvents.on("progress", onProgress);

    // Late-reconnect replay: if the job already finished, push the
    // terminal state so the UI can render the right outcome immediately.
    supabase
      .from("raw_uploads")
      .select("upload_status, error_message")
      .eq("id", uploadId)
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (!data || ws.readyState !== WebSocket.OPEN) return;
        if (data.upload_status === "complete") {
          ws.send(
            JSON.stringify({
              uploadId,
              userId,
              phase: "complete",
              percent: 100,
              message: "Upload complete",
              ts: Date.now(),
            } satisfies UploadProgressEvent),
          );
        } else if (data.upload_status === "failed") {
          ws.send(
            JSON.stringify({
              uploadId,
              userId,
              phase: "failed",
              percent: 100,
              message: "Upload failed",
              error_message: data.error_message ?? undefined,
              ts: Date.now(),
            } satisfies UploadProgressEvent),
          );
        }
      });

    ws.on("close", () => {
      uploadEvents.off("progress", onProgress);
      logger.info(`WSS closed for upload ${uploadId}`);
    });

    ws.on("error", (err) => {
      logger.error(`WSS error for upload ${uploadId}:`, err);
    });
  });

  logger.info("WSS attached (path: /ws/uploads)");
};