-- ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE (Linked to supabase auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  profile JSONB DEFAULT '{"onboarding_complete": false}'::jsonb
);

-- WORKOUTS TABLE
CREATE TABLE public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('running', 'cycling', 'gym', 'other')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'csv', 'gpx')),
  source_file_ref TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds > 0),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_metrics JSONB,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'flagged', 'needs_review')),
  CONSTRAINT unique_user_workout_fingerprint UNIQUE (user_id, fingerprint)
);

-- REFLECTIONS TABLE
CREATE TABLE public.reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID UNIQUE NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  effort_rating INT CHECK (effort_rating BETWEEN 1 AND 10),
  energy_level TEXT CHECK (energy_level IN ('low', 'normal', 'high')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BASELINES TABLE (Stubbed schema for Phase 2)
CREATE TABLE public.baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  rolling_mean FLOAT,
  rolling_stddev FLOAT,
  sample_count INT DEFAULT 0,
  window_days INT DEFAULT 30,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_metric_activity UNIQUE (user_id, metric_name, activity_type)
);

-- RAW UPLOADS TABLE
CREATE TABLE public.raw_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'gpx')),
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'processing', 'complete', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_workouts_user_start ON public.workouts(user_id, start_time DESC);
CREATE INDEX idx_workouts_fingerprint ON public.workouts(fingerprint);
CREATE INDEX idx_reflections_workout ON public.reflections(workout_id);

-- ROW LEVEL SECURITY
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_uploads ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
CREATE POLICY "Users access own record" ON public.users FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users access own workouts" ON public.workouts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own reflections" ON public.reflections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own baselines" ON public.baselines FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own uploads" ON public.raw_uploads FOR ALL USING (auth.uid() = user_id);

-- TRIGGER FOR NEW USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
