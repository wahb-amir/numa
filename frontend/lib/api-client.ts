/**
 * Typed API client layer.
 * All callers import from here — keeps backend contract types in one place.
 */
import { api } from "./api";
import type { ApiWorkout, ApiBaseline, ApiReflection, EnergyLevel, ActivityType } from "./types";

// ─── Workouts ────────────────────────────────────────────────────────────────

export async function getWorkouts(limit = 50, offset = 0): Promise<ApiWorkout[]> {
  const { data } = await api.get<ApiWorkout[]>(`/workouts?limit=${limit}&offset=${offset}`);
  return data;
}

export async function getWorkout(id: string): Promise<ApiWorkout> {
  const { data } = await api.get<ApiWorkout>(`/workouts/${id}`);
  return data;
}

export interface CreateWorkoutPayload {
  activity_type: ActivityType;
  start_time: string;        // ISO-8601
  duration_seconds: number;
  metrics?: Record<string, unknown>;
}

export async function createWorkout(payload: CreateWorkoutPayload): Promise<ApiWorkout> {
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
  payload: ReflectionPayload
): Promise<ApiReflection> {
  const { data } = await api.post<ApiReflection>(
    `/workouts/${workoutId}/reflection`,
    payload
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

export async function signUpload(filename: string): Promise<SignedUploadResult> {
  const { data } = await api.post<SignedUploadResult>("/uploads/sign", { filename });
  return data;
}

export async function completeUpload(uploadId: string): Promise<void> {
  await api.post(`/uploads/${uploadId}/complete`);
}

export async function getUploadStatus(
  uploadId: string
): Promise<{ upload_status: string; error_message: string | null }> {
  const { data } = await api.get(`/uploads/${uploadId}/status`);
  return data;
}
