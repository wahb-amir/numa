import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { uploadRouter } from "./routes/uploads";
import { workoutRouter } from "./routes/workouts";
import { userRouter } from "./routes/users";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/uploads", uploadRouter);
app.use("/api/workouts", workoutRouter);
app.use("/api/users", userRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
