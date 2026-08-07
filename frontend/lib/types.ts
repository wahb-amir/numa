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
