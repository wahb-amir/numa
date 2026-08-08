import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Determine default key for backend server operations (Secret Key preferred, fallback to Publishable Key)
const primaryKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY;

// Primary Supabase client for backend operations
export const supabase = createClient(env.SUPABASE_URL, primaryKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Explicit Secret Key client for backend administrative / bypass-RLS operations
export const supabaseSecret = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY || primaryKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

// Explicit Publishable Key client for public / client-scoped operations
export const supabasePublishable = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY || primaryKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

/**
 * Creates a Supabase client scoped to a specific user's JWT token.
 * This client respects Row Level Security (RLS) policies for the authenticated user.
 */
export const getScopedSupabaseClient = (jwtToken: string) => {
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY || primaryKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
};
