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
  evidence?: string[];
  confidence?: Confidence;
  alternatives?: string[];
  contextUsed?: string[];
}

// ─── Backend API types (real data from the Express server) ────────────────────

export type ActivityType = 'running' | 'cycling' | 'gym' | 'other';
export type EnergyLevel = 'low' | 'normal' | 'high';

export interface ApiWorkout {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  source: 'manual' | 'csv' | 'gpx';
  source_file_ref: string | null;
  start_time: string; // ISO date string
  duration_seconds: number;
  metrics: Record<string, unknown>;
  raw_metrics: Record<string, unknown> | null;
  ingested_at: string;
  fingerprint: string;
  status: 'valid' | 'flagged' | 'needs_review';
  reflections?: ApiReflection[];
}

export interface ApiReflection {
  id: string;
  workout_id: string;
  user_id: string;
  effort_rating: number | null;  // 1-10
  energy_level: EnergyLevel | null;
  notes: string | null;
  created_at: string;
}

export interface ApiBaseline {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  metric_name: string;   // e.g. 'avg_hr', 'avg_pace_sec_per_km', 'avg_duration_seconds'
  value: number;
  sample_count: number;
  computed_at: string;
}

export interface ApiUploadStatus {
  upload_status: 'pending' | 'processing' | 'complete' | 'failed';
  error_message: string | null;
}
