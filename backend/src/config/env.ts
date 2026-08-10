import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file into process.env
dotenv.config();

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    FRONTEND_URL: z
      .string()
      .min(1, "FRONTEND_URL cannot be empty")
      .default("http://localhost:3000"),
    SUPABASE_URL: z
      .string()
      .url("SUPABASE_URL must be a valid URL")
      .min(1, "SUPABASE_URL is required"),
    // Supabase Keys: Publishable Key, Secret Key (replacing service_role key), and optional JWT Secret
    SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_JWT_SECRET: z.string().optional().default(""),
    REDIS_HOST: z.string().min(1).default("127.0.0.1"),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional().default(""),

    // Groq LLM (Phase 2 narration layer).
    // Optional at boot — the /chat/narrate endpoint surfaces a 503 if
    // missing so the rest of the app can run without an LLM.
    GROQ_API_KEY: z.string().optional().default(""),
    GROQ_MODEL: z.string().optional().default("llama-3.1-8b-instant"),
  })
  .transform((data) => {
    const publishableKey =
      data.SUPABASE_PUBLISHABLE_KEY || data.SUPABASE_ANON_KEY || "";
    const secretKey =
      data.SUPABASE_SECRET_KEY || data.SUPABASE_SERVICE_ROLE_KEY || "";
    return {
      ...data,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: secretKey,
    };
  })
  .refine(
    (data) =>
      data.SUPABASE_PUBLISHABLE_KEY.length > 0 ||
      data.SUPABASE_SECRET_KEY.length > 0,
    {
      message:
        "At least one of SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) is required.",
      path: ["SUPABASE_SECRET_KEY"],
    },
  );

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("\n❌ Invalid environment variable configuration:");
    const fieldErrors = result.error.flatten().fieldErrors;

    Object.entries(fieldErrors).forEach(([field, errors]) => {
      if (errors && errors.length > 0) {
        console.error(`  • ${field}: ${errors.join(", ")}`);
      }
    });
    console.error(
      "\nPlease verify your .env configuration file against .env.example.\n",
    );

    const missingOrInvalidFields = Object.keys(fieldErrors).join(", ");
    throw new Error(
      `Environment validation failed for fields: ${missingOrInvalidFields}`,
    );
  }

  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
