import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { supabase } from "../config/supabase";

export const userRouter = Router();

userRouter.get(
  "/me/baselines",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      const { data, error } = await supabase
        .from("baselines")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        return res.status(500).json({ error: "Failed to fetch baselines" });
      }

      return res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
