import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { supabase } from "../config/supabase";
import { baselineQueue } from "../jobs/queues";

export const workoutRouter = Router();

const workoutSchema = z.object({
  activity_type: z.enum(["running", "cycling", "gym", "other"]),
  start_time: z.string().datetime(),
  duration_seconds: z.number().positive(),
  metrics: z.record(z.string(), z.any()).default({}),
});

const reflectionSchema = z.object({
  effort_rating: z.number().min(1).max(10).optional(),
  energy_level: z.enum(["low", "normal", "high"]).optional(),
  notes: z.string().optional(),
});

workoutRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const parsed = workoutSchema.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error });
    }

    const { activity_type, start_time, duration_seconds, metrics } =
      parsed.data;

    // Simple fingerprint based on start time and duration to avoid exact duplicates
    const fingerprint = `${start_time}_${duration_seconds}`;

    const { data: workout, error } = await supabase
      .from("workouts")
      .insert({
        user_id: userId,
        activity_type,
        source: "manual",
        start_time,
        duration_seconds,
        metrics,
        fingerprint,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique violation
        return res.status(409).json({ error: "Workout already exists" });
      }
      console.error("Workout insert error:", error);
      return res.status(500).json({ error: "Failed to save workout" });
    }

    // Trigger baseline recalculation
    await baselineQueue.add("computeBaselines", {
      userId,
      activityType: activity_type,
    });

    return res.status(201).json(workout);
  } catch (error) {
    console.error("Create workout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

workoutRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt((req.query.limit as string) || "50", 10);
    const offset = parseInt((req.query.offset as string) || "0", 10);

    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .eq("user_id", userId)
      .order("start_time", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: "Failed to fetch workouts" });
    }

    return res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

workoutRouter.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const { data, error } = await supabase
        .from("workouts")
        .select(
          `
        *,
        reflections (*)
      `,
        )
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "Workout not found" });
      }

      return res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

workoutRouter.post(
  "/:id/reflection",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const workoutId = req.params.id;

      const parsed = reflectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid input", details: parsed.error });
      }

      // Upsert reflection
      const { data, error } = await supabase
        .from("reflections")
        .upsert(
          {
            workout_id: workoutId,
            user_id: userId,
            ...parsed.data,
          },
          { onConflict: "workout_id" },
        )
        .select()
        .single();

      if (error) {
        console.error("Reflection upsert error:", error);
        return res.status(500).json({ error: "Failed to save reflection" });
      }

      return res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
