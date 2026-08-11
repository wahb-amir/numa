"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MessageSquarePlus } from "lucide-react";
import { useChatSessions } from "@/lib/use-chat-sessions";
import { cn } from "@/lib/utils";

/**
 * Slim sticky header above the chat history rail + thread. Two
 * responsibilities:
 *  1. On lg+, expose a collapse toggle so the user can reclaim
 *     horizontal space when they don't need the history rail.
 *  2. On <lg, expose the history-drawer trigger so the rail is
 *     reachable without a fixed-position button.
 *
 * Also renders the active session title and a "+ New chat" button
 * that lives in the header so users can always start a new chat
 * regardless of whether the rail is currently visible.
 */
export function ChatHeaderBar({
  activeSessionId,
  activeSessionTitle,
  isRailCollapsed,
  onToggleRail,
  onOpenDrawer,
}: {
  activeSessionId: string | null;
  activeSessionTitle: string | null;
  isRailCollapsed: boolean;
  onToggleRail: () => void;
  onOpenDrawer: () => void;
}) {
  const router = useRouter();
  const { create } = useChatSessions();
  const [isCreating, setIsCreating] = useState(false);

  // Listen for the "open this session id" event dispatched from the
  // history rail so a row click also lands in the URL bar (the rail
  // already does router.replace, but we centralise the same event for
  // any future caller that wants to navigate from inside the chat
  // page).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) router.replace(`/chat?session=${detail.id}`);
    };
    window.addEventListener("numa:chat-open-session", handler);
    return () =>
      window.removeEventListener("numa:chat-open-session", handler);
  }, [router]);

  async function handleNew() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const made = await create();
      router.replace(`/chat?session=${made.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface-base/95 px-4 backdrop-blur-sm lg:px-6">
      <button
        type="button"
        onClick={isRailCollapsed ? onToggleRail : onOpenDrawer}
        aria-label={
          isRailCollapsed ? "Show chat history" : "Open chat history"
        }
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-sunken"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
        {activeSessionTitle ?? "Ask Numa"}
      </div>

      <button
        type="button"
        onClick={handleNew}
        disabled={isCreating}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-control border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-60",
        )}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">New chat</span>
        <span className="sr-only sm:hidden">New chat</span>
      </button>
    </header>
  );
}
