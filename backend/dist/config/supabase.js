"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
// Create a single supabase client for interacting with your database
// We use the service role key for backend operations that need to bypass RLS 
// (or when we just need admin access). But for user specific endpoints, we will use RLS context.
exports.supabase = (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, env_1.env.SUPABASE_SERVICE_ROLE_KEY);
