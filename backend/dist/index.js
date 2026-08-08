"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./config/env");
const uploads_1 = require("./routes/uploads");
const workouts_1 = require("./routes/workouts");
const users_1 = require("./routes/users");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
app.use((0, morgan_1.default)("dev"));
app.use((0, cors_1.default)({ origin: env_1.env.FRONTEND_URL }));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/api/uploads", uploads_1.uploadRouter);
app.use("/api/workouts", workouts_1.workoutRouter);
app.use("/api/users", users_1.userRouter);
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});
app.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`Server running on port ${env_1.env.PORT}`);
});
