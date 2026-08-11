"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatGreeting } from "./chat-greeting";
import { ChatThread } from "./chat-thread";
import { ChatInputBar } from "./chat-input-bar";
import { createChatSession } from "@/lib/api-client";

/**
 * Owns the URL-driven chat page logic:
 *  - No session → render the greeting + a bare input. Submitting either
 *    creates a new session and dispatches the same question via the
 *    existing numa:chat-send window event, so the path is identical
 *    to "send after the thread mounts".
 *  - Has a session → render the thread.
 */
export function ChatPageShell({
  activeSessionId,
  displayName,
  onSessionUpdated,
}: {
  activeSessionId: string | null;
  displayName?: string | null;
  onSessionUpdated?: () => void;
}) {
  const router = useRouter();
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const sendFirstMessage = useCallback(
    async (question: string) => {
      if (isBootstrapping) return;
      const trimmed = question.trim();
      if (!trimmed) return;
      setIsBootstrapping(true);
      try {
        const created = await createChatSession();
        // Stash the prompt on sessionStorage so the freshly-mounted
        // chat-thread can pick it up and fire through
        // /api/chat/narrate with the new session id. This matches the
        // standard "draft handed off across route change" pattern.
        sessionStorage.setItem(`numa:chat-draft:${created.id}`, trimmed);
        router.replace(`/chat?session=${created.id}`);
        onSessionUpdated?.();
      } catch (err) {
        console.error("failed to create chat session", err);
      } finally {
        setIsBootstrapping(false);
      }
    },
    [isBootstrapping, router, onSessionUpdated],
  );

  if (!activeSessionId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ChatGreeting
          displayName={displayName}
          onSelectPrompt={sendFirstMessage}
        />
        <ChatInputBar onSend={sendFirstMessage} disabled={isBootstrapping} />
      </div>
    );
  }

  return (
    <ChatThread
      sessionId={activeSessionId}
      onSessionUpdated={onSessionUpdated}
    />
  );
}