"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
exports.userRouter = (0, express_1.Router)();
exports.userRouter.get(
  "/me/baselines",
  auth_1.requireAuth,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { data, error } = await supabase_1.supabase
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
