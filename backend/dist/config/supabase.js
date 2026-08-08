"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScopedSupabaseClient = exports.supabasePublishable = exports.supabaseSecret = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
// Determine default key for backend server operations (Secret Key preferred, fallback to Publishable Key)
const primaryKey = env_1.env.SUPABASE_SECRET_KEY || env_1.env.SUPABASE_PUBLISHABLE_KEY;
// Primary Supabase client for backend operations
exports.supabase = (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, primaryKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});
// Explicit Secret Key client for backend administrative / bypass-RLS operations
exports.supabaseSecret = (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, env_1.env.SUPABASE_SECRET_KEY || primaryKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});
// Explicit Publishable Key client for public / client-scoped operations
exports.supabasePublishable = (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, env_1.env.SUPABASE_PUBLISHABLE_KEY || primaryKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});
/**
 * Creates a Supabase client scoped to a specific user's JWT token.
 * This client respects Row Level Security (RLS) policies for the authenticated user.
 */
const getScopedSupabaseClient = (jwtToken) => {
    return (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, env_1.env.SUPABASE_PUBLISHABLE_KEY || primaryKey, {
        global: {
            headers: {
                Authorization: `Bearer ${jwtToken}`,
            },
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
};
exports.getScopedSupabaseClient = getScopedSupabaseClient;
