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
  ChatSession,
  ChatMessageRecord,
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
  options?: {
    workoutId?: string;
    /**
     * When set, the backend persists both turns and reads history from
     * the database. When omitted, the backend auto-creates a session and
     * returns its id in `sessionId` — see the typed return below.
     */
    sessionId?: string;
    /** Deprecated client-side history; ignored when sessionId is set. */
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  },
): Promise<ApiNarration & { session_id: string }> {
  const { data } = await api.post<ApiNarration & { session_id: string }>(
    "/chat/narrate",
    {
      question,
      workout_id: options?.workoutId,
      session_id: options?.sessionId,
      history: options?.history,
    },
  );
  return data;
}

export async function provisionDemo(personaId: "runner_demo" | "cyclist_demo" | "gym_demo") {
  const { data } = await api.post("/demo/provision", { persona_id: personaId });
  return data;
}

/**
 * Chat sessions backing the /chat history sidebar. The backend exposes
 * them under /api/chat/sessions; the first GET on every /chat mount
 * populates the rail, and the mutations are triggered by rename / delete
 * in the sidebar itself.
 */
export async function listChatSessions(): Promise<ChatSession[]> {
  const { data } = await api.get<ChatSession[]>("/chat/sessions");
  return data;
}

export async function createChatSession(payload?: {
  title?: string;
  focus_workout_id?: string;
}): Promise<ChatSession> {
  const { data } = await api.post<ChatSession>("/chat/sessions", payload ?? {});
  return data;
}

export async function getSessionMessages(
  sessionId: string,
): Promise<ChatMessageRecord[]> {
  const { data } = await api.get<ChatMessageRecord[]>(
    `/chat/sessions/${sessionId}/messages`,
  );
  return data;
}

export async function renameChatSession(
  sessionId: string,
  title: string,
): Promise<ChatSession> {
  const { data } = await api.patch<ChatSession>(`/chat/sessions/${sessionId}`, {
    title,
  });
  return data;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await api.delete(`/chat/sessions/${sessionId}`);
}

export async function recomputeWorkoutStats(
  workoutId: string,
): Promise<{ queued: true }> {
  const { data } = await api.post<{ queued: true }>(
    `/workouts/${workoutId}/recompute`,
  );
  return data;
}
