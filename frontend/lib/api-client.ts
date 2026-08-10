/**
 * Typed API client layer.
 * All callers import from here — keeps backend contract types in one place.
 */
import { api } from "./api";
import type {
  ApiWorkout,
  ApiBaseline,
  ApiReflection,
  ApiComparisonResponse,
  ApiProgressPoint,
  ApiDiscoveredPattern,
  ApiInsightsBundle,
  ApiNarration,
  EnergyLevel,
  ActivityType,
} from "./types";

// ─── Auth / Session ──────────────────────────────────────────────────────────

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

export interface ProfileUpdatePayload {
  display_name?: string;
  units?: "metric" | "imperial";
}

export async function getMe(): Promise<ApiAuthUser> {
  const { data } = await api.get<ApiAuthUser>("/auth/me");
  return data;
}

export async function getProfile(): Promise<ApiProfile> {
  const { data } = await api.get<ApiProfile>("/users/me");
  return data;
}

export async function updateProfile(
  payload: ProfileUpdatePayload,
): Promise<ApiProfile> {
  const { data } = await api.patch<ApiProfile>("/users/me", payload);
  return data;
}

export async function logoutSession(): Promise<void> {
  // Tells the backend to revoke the JWT + refresh token globally. We do
  // NOT clear the local Supabase session here — the caller (logout hook)
  // does that so the two paths are independent and either can succeed
  // without the other.
  await api.post("/auth/logout");
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export async function getWorkouts(
  limit = 50,
  offset = 0,
): Promise<ApiWorkout[]> {
  const { data } = await api.get<ApiWorkout[]>(
    `/workouts?limit=${limit}&offset=${offset}`,
  );
  return data;
}

export async function getWorkout(id: string): Promise<ApiWorkout> {
  const { data } = await api.get<ApiWorkout>(`/workouts/${id}`);
  return data;
}

export interface CreateWorkoutPayload {
  activity_type: ActivityType;
  start_time: string; // ISO-8601
  duration_seconds: number;
  metrics?: Record<string, unknown>;
}

export async function createWorkout(
  payload: CreateWorkoutPayload,
): Promise<ApiWorkout> {
  const { data } = await api.post<ApiWorkout>("/workouts", payload);
  return data;
}

// ─── Reflections ─────────────────────────────────────────────────────────────

export interface ReflectionPayload {
  effort_rating?: number;
  energy_level?: EnergyLevel;
  notes?: string;
}

export async function postReflection(
  workoutId: string,
  payload: ReflectionPayload,
): Promise<ApiReflection> {
  const { data } = await api.post<ApiReflection>(
    `/workouts/${workoutId}/reflection`,
    payload,
  );
  return data;
}

// ─── Baselines ───────────────────────────────────────────────────────────────

export async function getBaselines(): Promise<ApiBaseline[]> {
  const { data } = await api.get<ApiBaseline[]>("/users/me/baselines");
  return data;
}

// ─── Uploads ─────────────────────────────────────────────────────────────────

export interface SignedUploadResult {
  signedUrl: string;
  token: string;
  fileKey: string;
  uploadId: string;
}

export async function signUpload(
  filename: string,
): Promise<SignedUploadResult> {
  const { data } = await api.post<SignedUploadResult>("/uploads/sign", {
    filename,
  });
  return data;
}

export async function completeUpload(uploadId: string): Promise<void> {
  await api.post(`/uploads/${uploadId}/complete`);
}

export async function getUploadStatus(
  uploadId: string,
): Promise<{ upload_status: string; error_message: string | null }> {
  const { data } = await api.get(`/uploads/${uploadId}/status`);
  return data;
}

// ─── Phase 2 — Stats & Narration ─────────────────────────────────────────────

export async function getComparison(
  workoutId: string,
): Promise<ApiComparisonResponse> {
  const { data } = await api.get<ApiComparisonResponse>(
    `/workouts/${workoutId}/comparison`,
  );
  return data;
}

export async function getProgress(): Promise<ApiProgressPoint[]> {
  const { data } = await api.get<ApiProgressPoint[]>("/users/me/progress");
  return data;
}

export async function getPatterns(): Promise<ApiDiscoveredPattern[]> {
  const { data } = await api.get<ApiDiscoveredPattern[]>(
    "/users/me/patterns",
  );
  return data;
}

export async function getInsights(): Promise<ApiInsightsBundle> {
  const { data } = await api.get<ApiInsightsBundle>("/users/me/insights");
  return data;
}

export async function narrate(
  question: string,
  workoutId?: string,
): Promise<ApiNarration> {
  const { data } = await api.post<ApiNarration>("/chat/narrate", {
    question,
    workout_id: workoutId,
  });
  return data;
}

export async function recomputeWorkoutStats(
  workoutId: string,
): Promise<{ queued: true }> {
  const { data } = await api.post<{ queued: true }>(
    `/workouts/${workoutId}/recompute`,
  );
  return data;
}
