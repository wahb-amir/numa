"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createChatSession,
  deleteChatSession,
  getSessionMessages,
  listChatSessions,
  renameChatSession,
} from "@/lib/api-client";
import type { ChatMessageRecord, ChatSession } from "@/lib/types";

/**
 * Shared session list state for the chat history rail. Pages subscribe
 * via `useChatSessions()` so a rename / delete from the sidebar
 * reflects everywhere (including the active-session list).
 */
export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listChatSessions();
      setSessions(data);
    } catch (err) {
      console.error("Failed to load chat sessions", err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    const session = await createChatSession();
    setSessions((prev) => [
      { ...session, message_count: 0 },
      ...prev,
    ]);
    return session;
  }, []);

  const rename = useCallback(
    async (id: string, title: string) => {
      // Optimistic update; rollback on failure.
      const previous = sessions.find((s) => s.id === id)?.title;
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title } : s)),
      );
      try {
        const updated = await renameChatSession(id, title);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, title: updated.title, updated_at: updated.updated_at }
              : s,
          ),
        );
      } catch (err) {
        if (previous !== undefined) {
          setSessions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, title: previous } : s)),
          );
        }
        throw err;
      }
    },
    [sessions],
  );

  const remove = useCallback(async (id: string) => {
    const snapshot = sessions;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteChatSession(id);
    } catch (err) {
      setSessions(snapshot);
      throw err;
    }
  }, [sessions]);

  return {
    sessions,
    isLoading,
    error,
    refresh,
    create,
    rename,
    remove,
  };
}

/**
 * Load the full transcript for a single session. The thread reuses this
 * on every URL change (?session=...) and on every narrate response (so
 * we can re-fetch the canonical DB view after a new turn lands).
 */
export function useChatSessionMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSessionMessages(sessionId);
      setMessages(data);
    } catch (err) {
      console.error("Failed to load session messages", err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { messages, isLoading, error, refresh };
}