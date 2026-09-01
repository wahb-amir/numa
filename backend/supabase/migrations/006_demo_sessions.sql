-- 006_demo_sessions.sql
-- Adds demo session metadata to the users table.
-- Safe to apply on an existing populated table — all new columns have defaults.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS demo_persona_id    TEXT,
  ADD COLUMN IF NOT EXISTS demo_narrate_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS demo_narrate_limit INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS demo_expires_at    TIMESTAMPTZ;

-- Sparse index: only demo accounts have a persona_id set
CREATE INDEX IF NOT EXISTS idx_users_demo_persona
  ON users (demo_persona_id)
  WHERE demo_persona_id IS NOT NULL;

COMMENT ON COLUMN users.demo_persona_id    IS 'NULL = real account; one of runner_demo / cyclist_demo / gym_demo for hackathon demo sessions';
COMMENT ON COLUMN users.demo_narrate_count IS 'Number of AI narrate calls consumed in this demo session';
COMMENT ON COLUMN users.demo_narrate_limit IS 'Maximum AI narrate calls allowed per demo session (default 5)';
COMMENT ON COLUMN users.demo_expires_at    IS 'Demo session soft-expiry timestamp — the JWT stays valid but the UI shows an upgrade prompt';

-- Function to safely increment the demo narrate counter
CREATE OR REPLACE FUNCTION increment_demo_narrate_count(uid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE users
  SET demo_narrate_count = demo_narrate_count + 1
  WHERE id = uid;
$$;
