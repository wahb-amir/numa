-- =============================================================================
-- Migration 003: user_profiles
-- =============================================================================
-- Per-user profile data surfaced by /api/users/me:
--   - display_name  : how Numa should address the user
--   - units         : metric (km / kg) or imperial (mi / lb)
--   - updated_at    : last write timestamp (managed by the app)
--
-- The auth.users record itself only carries user_metadata (which is set at
-- signup and rarely edited). Profiles live here so they can be updated
-- without touching Supabase auth, and so additional preferences can be
-- added over time without further schema migrations against auth.users.
--
-- The row is created on auth.users INSERT via the trigger defined at the
-- bottom of this file, mirroring the existing handle_new_user() pattern
-- from migration 001.
-- =============================================================================

CREATE TABLE public.user_profiles (
  user_id      UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT,
  units        TEXT        NOT NULL DEFAULT 'metric'
                            CHECK (units IN ('metric', 'imperial')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Split policies (rather than a single FOR ALL) so the WITH CHECK and USING
-- clauses can be expressed per command without ambiguity. They all key off
-- auth.uid() matching the row's user_id, matching the conventions set in
-- migration 001.
CREATE POLICY "Users read own profile"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Auto-create a profile row on signup so /api/users/me has something to
-- PATCH against from day one. display_name is left NULL; the app falls back
-- to user_metadata.full_name / a derived name from the email in that case.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile();