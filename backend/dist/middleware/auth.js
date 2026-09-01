"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.verifyJwt = void 0;
const supabase_1 = require("../config/supabase");
/**
 * Verify a Supabase JWT and return the user. Shared between the REST
 * `requireAuth` middleware and the WebSocket upgrade handler so both code
 * paths use the exact same token validation.
 */
const verifyJwt = async (token) => {
    const { data: { user }, error, } = await supabase_1.supabase.auth.getUser(token);
    if (error || !user) {
        throw new Error(error?.message ?? "Invalid token");
    }
    return { id: user.id, email: user.email };
};
exports.verifyJwt = verifyJwt;
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res
                .status(401)
                .json({ error: "Missing or invalid authorization header" });
        }
        const token = authHeader.split(" ")[1];
        try {
            const user = await (0, exports.verifyJwt)(token);
            req.user = user;
            req.token = token; // Can be used for RLS queries where we need the user's JWT
            next();
        }
        catch (err) {
            return res
                .status(401)
                .json({ error: "Unauthorized", details: err?.message });
        }
    }
    catch (error) {
        console.error("Auth middleware error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.requireAuth = requireAuth;
