-- =============================================================================
-- Migration 004: Phase 2 — baselines (multi-window), discovered_patterns,
-- and daily_metrics (sleep / training load daily series).
-- =============================================================================
-- This migration adds the storage needed for the Phase 2 statistics pipeline:
--
--   1. baselines already has `window_days`; we now use it to differentiate
--      the short (14-day) and long (90-day) rolling windows the baseline
--      worker writes. We drop the existing unique constraint and add one
--      keyed on (user_id, metric_name, activity_type, window_days) so each
--      (metric × activity × window) combo gets its own row.
--
--   2. discovered_patterns is the persistent result of the correlation
--      engine. Each row is one Pearson-check that fired (|r|>=0.4, n>=8).
--      The `template_summary` is the templated human-readable sentence so
--      the LLM only ever narrates an already-verified fact.
--
--   3. daily_metrics holds one row per (user, calendar_date). It is the
--      source of truth for prior-night sleep, training load, and resting
--      HR — the inputs the correlation engine pairs against the workout
--      table. The seed data-gen does not currently populate this; routes
--      can populate it over time from wearable uploads.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. baselines — multi-window uniqueness
-- ---------------------------------------------------------------------------

ALTER TABLE public.baselines
  DROP CONSTRAINT IF EXISTS unique_user_metric_activity;

ALTER TABLE public.baselines
  ADD CONSTRAINT unique_user_metric_activity_window
  UNIQUE (user_id, metric_name, activity_type, window_days);

-- Helpful index for the comparison endpoint (which always queries by
-- user × metric × activity × short window).
CREATE INDEX IF NOT EXISTS idx_baselines_lookup
  ON public.baselines (user_id, metric_name, activity_type, window_days);

-- ---------------------------------------------------------------------------
-- 2. discovered_patterns
-- ---------------------------------------------------------------------------

CREATE TABLE public.discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,                      -- e.g. 'sleep_vs_performance'
  activity_type TEXT,                             -- nullable when check is cross-activity
  metric_x TEXT NOT NULL,                        -- e.g. 'prior_night_sleep_hours'
  metric_y TEXT NOT NULL,                        -- e.g. 'avg_pace_min_km'
  pearson_r FLOAT NOT NULL,
  sample_count INT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('positive', 'negative')),
  threshold FLOAT NOT NULL DEFAULT 0.4,
  template_summary TEXT NOT NULL,                -- filled in from a fixed template
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_check_window UNIQUE (user_id, check_name, activity_type)
);

CREATE INDEX idx_discovered_patterns_user
  ON public.discovered_patterns (user_id, computed_at DESC);

ALTER TABLE public.discovered_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own patterns"
  ON public.discovered_patterns
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. daily_metrics — per-day sleep / training load / resting HR
-- ---------------------------------------------------------------------------

CREATE TABLE public.daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sleep_hours FLOAT,
  sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'fair', 'good')),
  training_load FLOAT,        -- 0–100 relative load (TRIMP-style)
  resting_hr INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

CREATE INDEX idx_daily_metrics_user_date
  ON public.daily_metrics (user_id, date DESC);

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own daily metrics"
  ON public.daily_metrics
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_metrics_touch ON public.daily_metrics;
CREATE TRIGGER trg_daily_metrics_touch
  BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();