"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInputBar } from "./chat-input-bar";
import { narrate } from "@/lib/api-client";
import { useChatSessionMessages } from "@/lib/use-chat-sessions";
import { useDemo } from "@/lib/demo-context";
import type { ApiNarration, ChatMessage as ChatMessageType } from "@/lib/types";

/**
 * The thread column on /chat. Owns:
 *  - the local message list (seeded from the server, then mutated
 *    optimistically on send)
 *  - the send / streaming flow (POSTs /api/chat/narrate with the active
 *    session id)
 *  - the listener for the numa:chat-send window event used by the
 *    follow-up question chips rendered inside <ChatMessage />
 *
 * The greeting is rendered separately by /chat/page.tsx; this
 * component only mounts when there's an active session id.
 */
export function ChatThread({
  sessionId,
  onSessionUpdated,
}: {
  sessionId: string;
  /** Notify parent so the history rail can re-sort. */
  onSessionUpdated?: () => void;
}) {
  const {
    messages: serverMessages,
    isLoading,
    refresh,
  } = useChatSessionMessages(sessionId);
  const { isDemo, decrementNarrate } = useDemo();

  // Local list — seeded from server messages but grown optimistically as
  // the user sends and as new assistant turns arrive. Server messages
  // are keyed by their canonical ids, so they're reconciled by id.
  const [localMessages, setLocalMessages] = useState<ChatMessageType[]>([]);
  const [sessionIdState, setSessionIdState] = useState(sessionId);
  const [isThinking, setIsThinking] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Reset local state when the active session changes (URL ?session=
  // navigation).
  useEffect(() => {
    if (sessionId !== sessionIdState) {
      setLocalMessages([]);
      setSessionIdState(sessionId);
      setIsThinking(false);
    }
  }, [sessionId, sessionIdState]);

  // When the server messages arrive (initial load or refresh after
  // send), reconcile into the local list. Server is the source of
  // truth — any optimistic ids that aren't on the server anymore get
  // replaced.
  useEffect(() => {
    const fromServer = serverMessages.map<ChatMessageType>((m) => {
      if (m.role === "user") {
        return { id: m.id, role: "user", content: m.content };
      }
      const narration = (m.narration ?? null) as ApiNarration | null;
      return {
        id: m.id,
        role: "assistant",
        content: "",
        observation: narration?.observation,
        takeaway: narration?.takeaway,
        evidence:
          narration?.possible_contributors &&
          narration.possible_contributors.length > 0
            ? narration.possible_contributors
            : undefined,
        confidence: narration?.confidence,
        alternatives: narration?.alternatives,
        contextUsed: [`${narration?.evidence_count ?? 0} session(s) of evidence`],
        sources: narration?.sources,
        questionsForYou:
          narration?.questions_for_you && narration.questions_for_you.length > 0
            ? narration.questions_for_you
            : undefined,
      };
    });
    setLocalMessages(fromServer);
  }, [serverMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [localMessages, isThinking]);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isThinking) return;
      const optimisticId = `u-${Date.now()}`;
      const userMsg: ChatMessageType = {
        id: optimisticId,
        role: "user",
        content: trimmed,
      };
      setLocalMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);

      try {
        const result = await narrate(trimmed, { sessionId });
        if (isDemo && (result as any).narrate_remaining !== undefined) {
          decrementNarrate();
        }
        // Refresh from the server so the assistant turn has its canonical
        // id + persisted sources. The optimistic user message and the new
        // assistant message are both written by /api/chat/narrate.
        await refresh();
        onSessionUpdated?.();
      } catch (err: any) {
        console.error("narrate failed", err);
        const isQuota = err?.response?.data?.error === "demo_quota_exceeded";
        const fallback: ChatMessageType = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "",
          observation: isQuota
            ? err?.response?.data?.message || "You've used all 5 AI queries in this demo session. Sign up for unlimited access."
            : "I can't reach the narration model right now. The stats pipeline still works — check the Activity and Insights pages for pre-computed comparisons and patterns.",
          confidence: isQuota ? undefined : "low",
        };
        setLocalMessages((prev) => [...prev, fallback]);
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, sessionId, refresh, onSessionUpdated],
  );

  // Window event for the questions_for_you chips rendered inside
  // ChatMessage. Same contract as before — fires with { question }.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ question: string }>).detail;
      if (!detail?.question) return;
      void send(detail.question);
    };
    window.addEventListener("numa:chat-send", handler);
    return () => window.removeEventListener("numa:chat-send", handler);
  }, [send]);

  // Drain a pending draft (set by ChatPageShell when the user tapped a
  // suggested prompt while on the greeting). Single-fire — we clear the
  // key so a page reload doesn't resend.
  useEffect(() => {
    const key = `numa:chat-draft:${sessionId}`;
    const draft = sessionStorage.getItem(key);
    if (!draft) return;
    sessionStorage.removeItem(key);
    void send(draft);
    // We intentionally only react to the initial mount for this id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {isLoading && localMessages.length === 0 && (
            <p className="text-sm text-text-muted">Loading conversation…</p>
          )}
          {localMessages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {isThinking && (
            <div className="flex justify-start">
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-1.5 rounded-card border border-border bg-surface-raised px-4 py-3"
              >
                <span className="sr-only">Numa is thinking</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted"
                    style={{ animationDelay: `${i * 150}ms` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <ChatInputBar onSend={send} disabled={isThinking} />
    </div>
  );
}