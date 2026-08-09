import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
  token?: string;
}

/**
 * Verify a Supabase JWT and return the user. Shared between the REST
 * `requireAuth` middleware and the WebSocket upgrade handler so both code
 * paths use the exact same token validation.
 */
export const verifyJwt = async (
  token: string,
): Promise<{ id: string; email?: string }> => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Error(error?.message ?? "Invalid token");
  }
  return { id: user.id, email: user.email };
};

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const user = await verifyJwt(token);
      req.user = user;
      req.token = token; // Can be used for RLS queries where we need the user's JWT
      next();
    } catch (err: any) {
      return res
        .status(401)
        .json({ error: "Unauthorized", details: err?.message });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
