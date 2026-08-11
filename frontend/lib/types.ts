export type Confidence = "high" | "moderate" | "low";
export type StatusLevel = "positive" | "attention" | "concerning" | "info";

export interface DailyMetrics {
  dateIndex: number; // 0 = today, higher = further in the past
  date: Date;
  recoveryScore: number | null; // 0-100, null = missing data
  restingHR: number | null;
  hrv: number | null;
  sleepHours: number | null;
  sleepQuality: "poor" | "fair" | "good" | null;
  trainingLoad: number | null; // 0-100 relative
  note: string | null; // subjective, free-text reflection
  effort: number | null; // 1-10 perceived effort, only on training days
}

export interface Workout {
  id: string;
  dateIndex: number;
  date: Date;
  type: "Run" | "Ride" | "Strength" | "Swim" | "Mobility";
  title: string;
  distanceKm: number | null;
  durationMin: number;
  avgPace: string | null; // e.g. "5:12/km"
  avgHR: number | null;
  perceivedEffort: number | null; // 1-10
  reflection: string | null;
  baselineDeltaPct: number | null; // vs personal baseline, negative = slower/worse
}

export interface Insight {
  id: string;
  title: string;
  observation: string;
  evidence: string[];
  confidence: Confidence;
  alternatives: string[];
  relatedMetric: string;
  status: StatusLevel;
}

export interface TimelineEvent {
  id: string;
  dateIndex: number;
  date: Date;
  category: "workout" | "reflection" | "sleep" | "milestone" | "context";
  title: string;
  detail: string;
  status: StatusLevel;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  observation?: string;
  /**
   * Optional 1–2 sentence grounded interpretation from the narrator.
   * Surfaced as the leading paragraph above the Observation card when
   * present. When observation is empty (casual follow-ups), this is
   * the entire reply.
   */
  takeaway?: string;
  evidence?: string[];
  confidence?: Confidence;
  alternatives?: string[];
  contextUsed?: string[];
  sources?: ApiNarrationSources;
  questionsForYou?: string[];
}

/**
 * Server-side session row from /api/chat/sessions. Used by the history
 * sidebar to render the list.
 */
export interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
  focus_workout_id: string | null;
}

/**
 * Persisted chat turn returned by GET /api/chat/sessions/:id/messages.
 * Mirrors chat_messages columns. The UI adapts narration back into the
 * ChatMessage shape it already understands.
 */
export interface ChatMessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  narration: ApiNarration | null;
  created_at: string;
}

// ─── Backend API types (real data from the Express server) ────────────────────

export type ActivityType = "running" | "cycling" | "gym" | "other";
export type EnergyLevel = "low" | "normal" | "high";

export interface ApiWorkout {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  source: "manual" | "csv" | "gpx";
  source_file_ref: string | null;
  start_time: string; // ISO date string
  duration_seconds: number;
  metrics: Record<string, unknown>;
  raw_metrics: Record<string, unknown> | null;
  ingested_at: string;
  fingerprint: string;
  status: "valid" | "flagged" | "needs_review";
  reflections?: ApiReflection[];
}

export interface ApiReflection {
  id: string;
  workout_id: string;
  user_id: string;
  effort_rating: number | null; // 1-10
  energy_level: EnergyLevel | null;
  notes: string | null;
  created_at: string;
}

export interface ApiBaseline {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  metric_name: string; // e.g. 'avg_hr', 'avg_pace_min_km', 'duration_seconds'
  rolling_mean: number;
  rolling_stddev: number;
  sample_count: number;
  window_days: number; // 14 (short) or 90 (long)
  computed_at: string;
}

export interface ApiComparisonMetric {
  value: number;
  baseline_mean: number | null;
  baseline_stddev: number | null;
  deviation_pct: number | null;
  z_score: number | null;
  label:
    | "typical"
    | "somewhat_above"
    | "somewhat_below"
    | "notably_above"
    | "notably_below"
    | "insufficient_data";
}

export interface ApiComparisonResponse {
  workout: ApiWorkout;
  comparison: Record<string, ApiComparisonMetric>;
  baseline_window_days: number;
}

export interface ApiProgressPoint {
  metric_name: string;
  metric_label: string;
  metric_unit: string;
  activity_type: ActivityType;
  earliest_month_mean: number | null;
  latest_month_mean: number | null;
  pct_change: number | null;
  direction: "improving" | "declining" | "stable";
  sample_count: number;
  confidence: "high" | "moderate" | "low";
  earliest_month: string | null;
  latest_month: string | null;
}

export interface ApiDiscoveredPattern {
  id: string;
  user_id: string;
  check_name: string;
  activity_type: ActivityType | null;
  metric_x: string;
  metric_y: string;
  pearson_r: number;
  sample_count: number;
  direction: "positive" | "negative";
  threshold: number;
  template_summary: string;
  computed_at: string;
}

export interface ApiInsightsBundle {
  patterns: ApiDiscoveredPattern[];
  baselines: ApiBaseline[];
  summary: {
    workouts_count: number;
    first_session_at: string | null;
    activity_types: (ActivityType | null)[];
  };
}

export interface ApiNarration {
  observation: string;
  /**
   * Optional 1–2 sentence grounded interpretation. Absent when the
   * model didn't have enough to position itself.
   */
  takeaway?: string;
  possible_contributors: string[];
  evidence_count: number;
  confidence: "low" | "moderate" | "high";
  alternatives: string[];
  questions_for_you: string[];
  sources: ApiNarrationSources;
}

/**
 * Structured data backing a narration. Mirrors what the backend's
 * stats layer produced and fed to the LLM. The chat message renders
 * this as a collapsible "View the data" disclosure so users can audit
 * the numbers behind any claim.
 */
export interface ApiNarrationSources {
  focus_workout: {
    id: string;
    activity_type: ActivityType;
    start_time: string;
  };
  comparisons: Array<{
    metric_name: string;
    metric_label: string;
    unit: string;
    value: number;
    baseline_mean: number;
    baseline_stddev: number;
    deviation_pct: number | null;
    label: string;
  }>;
  patterns: Array<{
    check_name: string;
    template_summary: string;
    pearson_r: number;
    sample_count: number;
    activity_type: ActivityType | null;
  }>;
  notes: Array<{
    date: string;
    workout_id: string | null;
    note: string;
  }>;
  progress: Array<{
    metric_name: string;
    metric_label: string;
    activity_type: ActivityType;
    earliest_month_mean: number | null;
    latest_month_mean: number | null;
    pct_change: number | null;
    direction: "improving" | "declining" | "stable";
    confidence: "high" | "moderate" | "low";
    earliest_month: string | null;
    latest_month: string | null;
  }>;
}

export interface ApiUploadStatus {
  upload_status: "pending" | "processing" | "complete" | "failed";
  error_message: string | null;
}

export interface ApiAuthUser {
  id: string;
  email: string;
  phone?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}

export interface ApiProfile {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string;
  units: "metric" | "imperial";
  profile_exists: boolean;
  updated_at: string | null;
}
