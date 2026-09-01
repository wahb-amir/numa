"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const uploads_1 = require("./routes/uploads");
const workouts_1 = require("./routes/workouts");
const users_1 = require("./routes/users");
const auth_1 = require("./routes/auth");
const chat_1 = require("./routes/chat");
const demo_1 = require("./routes/demo");
const logger_1 = require("./utils/logger");
// Side-effect import: registers the BullMQ Worker that processes uploads.
require("./jobs/workers/processUploadWorker");
// Side-effect imports: register the Phase 2 stats workers.
require("./jobs/workers/baselineWorker");
require("./jobs/workers/correlationWorker");
const wss_1 = require("./server/wss");
const app = (0, express_1.default)();
app.use((0, morgan_1.default)("dev"));
app.use((0, cors_1.default)({ origin: env_1.env.FRONTEND_URL }));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/api/uploads", uploads_1.uploadRouter);
app.use("/api/workouts", workouts_1.workoutRouter);
app.use("/api/users", users_1.userRouter);
app.use("/api/auth", auth_1.authRouter);
app.use("/api/chat", chat_1.chatRouter);
app.use("/api/demo", demo_1.demoRouter);
app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});
// Hugging Face Spaces (and most single-port hosts) only expose one port.
// We must share that port between HTTP and WebSocket upgrades, so we build
// the http.Server explicitly and hand it to both express and the WSS layer.
const httpServer = http_1.default.createServer(app);
(0, wss_1.attachWss)(httpServer);
httpServer.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`Server + upload worker + WSS running on port ${env_1.env.PORT}`);
});
