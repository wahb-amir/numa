-- =============================================================================
-- Migration 005: chat_sessions + chat_messages
-- =============================================================================
-- Persistent chat history so /chat feels like Claude/ChatGPT Web: a sidebar
-- of past conversations, each containing an ordered transcript of user /
-- assistant turns. Until now the /chat route was stateless and the only
-- memory of a conversation was React state in chat-interface.tsx — a reload
-- wiped everything.
--
-- Tables:
--   chat_sessions    one row per conversation. title is auto-derived from the
--                    first user message; users can rename it via PATCH. The
--                    `updated_at` column is bumped on every new message
--                    (via touch_chat_session_on_message) so the history
--                    sidebar can sort by "most recent activity".
--   chat_messages    one row per turn. `narration` is the full ApiNarration
--                    JSON for assistant turns and null for user turns. We
--                    keep the entire transcript in the DB but only send the
--                    last 6 turns to the LLM (handled in the route).
--
-- Security model:
--   RLS keys off auth.uid() = user_id, matching the conventions set in
--   migrations 001, 003, and 004. The backend uses a per-request Supabase
--   client (getScopedSupabaseClient in src/config/supabase.ts) that sets
--   the user's JWT so every query is RLS-scoped to that user.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- chat_sessions
-- ---------------------------------------------------------------------------

CREATE TABLE public.chat_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL DEFAULT 'New chat',
  focus_workout_id UUID        REFERENCES public.workouts(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The history sidebar fetches all of a user's sessions ordered by
-- updated_at desc on every page mount. This composite index serves
-- that exact query.
CREATE INDEX idx_chat_sessions_user_updated
  ON public.chat_sessions (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------

CREATE TABLE public.chat_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID        NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT        NOT NULL,
  -- Full ApiNarration JSON for assistant turns, null for user turns. The
  -- chat message component re-reads it on load to render observation /
  -- takeaway / sources disclosure — we don't lose fidelity by re-fetching.
  narration  JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index serves the "load last 6 messages of a session" query
-- the narrate route runs on every turn.
CREATE INDEX idx_chat_messages_session_created
  ON public.chat_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own chat sessions"
  ON public.chat_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own chat messages"
  ON public.chat_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Reuses touch_updated_at() defined in migration 004 so manual UPDATEs
-- to a session (e.g. rename) also bump updated_at.
CREATE TRIGGER trg_chat_sessions_touch
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

-- Bump the parent session's updated_at whenever a message lands so the
-- sidebar ordering tracks activity without the route having to remember.
CREATE OR REPLACE FUNCTION public.touch_chat_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_sessions
     SET updated_at = NOW()
   WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_messages_touch_session
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE PROCEDURE public.touch_chat_session_on_message();
