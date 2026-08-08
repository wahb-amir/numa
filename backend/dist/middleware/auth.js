"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const supabase_1 = require("../config/supabase");
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
    }
    const token = authHeader.split(" ")[1];
    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabase_1.supabase.auth.getUser(token);
    if (error || !user) {
      return res
        .status(401)
        .json({ error: "Unauthorized", details: error?.message });
    }
    req.user = {
      id: user.id,
      email: user.email,
    };
    req.token = token; // Can be used for RLS queries where we need the user's JWT
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
exports.requireAuth = requireAuth;
