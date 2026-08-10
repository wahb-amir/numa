import http from "http";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import { uploadRouter } from "./routes/uploads";
import { workoutRouter } from "./routes/workouts";
import { userRouter } from "./routes/users";
import { authRouter } from "./routes/auth";
import { chatRouter } from "./routes/chat";
import { logger } from "./utils/logger";
// Side-effect import: registers the BullMQ Worker that processes uploads.
import "./jobs/workers/processUploadWorker";
// Side-effect imports: register the Phase 2 stats workers.
import "./jobs/workers/baselineWorker";
import "./jobs/workers/correlationWorker";
import { attachWss } from "./server/wss";

const app = express();

app.use(morgan("dev"));

app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/uploads", uploadRouter);
app.use("/api/workouts", workoutRouter);
app.use("/api/users", userRouter);
app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Hugging Face Spaces (and most single-port hosts) only expose one port.
// We must share that port between HTTP and WebSocket upgrades, so we build
// the http.Server explicitly and hand it to both express and the WSS layer.
const httpServer = http.createServer(app);
attachWss(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(
    `Server + upload worker + WSS running on port ${env.PORT}`,
  );
});