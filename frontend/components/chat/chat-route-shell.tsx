"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatHeaderBar } from "./chat-header-bar";
import { ChatHistorySidebar, ChatHistoryTrigger } from "./chat-history-sidebar";
import { ChatPageShell } from "./chat-page-shell";
import { getProfile, listChatSessions } from "@/lib/api-client";

/**
 * Top-level client component for /chat. Reads ?session=, looks up the
 * active session's title, fetches the user's display name, and renders
 * the two-pane layout (header + rail + thread area).
 *
 * Owns:
 *  - the rail collapsed/drawer state
 *  - the active session title (refreshed when the page shell reports
 *    a session update so the header stays in sync with renames)
 */
export function ChatRouteShell() {
  const search = useSearchParams();
  const sessionId = search.get("session");

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Profile — single fetch, used for the greeting subtitle.
  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((p) => {
        if (!cancelled) setDisplayName(p.display_name || null);
      })
      .catch(() => {
        // non-critical
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Active session title — re-fetched whenever the session id changes
  // or a refresh nonce bumps (a new turn landed, a rename happened).
  useEffect(() => {
    if (!sessionId) {
      setActiveTitle(null);
      return;
    }
    let cancelled = false;
    listChatSessions()
      .then((rows) => {
        if (cancelled) return;
        const row = rows.find((r) => r.id === sessionId);
        setActiveTitle(row?.title ?? null);
      })
      .catch(() => {
        if (!cancelled) setActiveTitle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshNonce]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeaderBar
        activeSessionId={sessionId}
        activeSessionTitle={activeTitle}
        isRailCollapsed={isRailCollapsed}
        onToggleRail={() => setIsRailCollapsed((v) => !v)}
        onOpenDrawer={() => setDrawerOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <ChatHistorySidebar
          className={isRailCollapsed ? "hidden" : "hidden lg:flex"}
        />
        <main
          id="main-content"
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-base"
        >
          <ChatPageShell
            key={`${sessionId ?? "none"}::${refreshNonce}`}
            activeSessionId={sessionId}
            displayName={displayName}
            onSessionUpdated={() => setRefreshNonce((n) => n + 1)}
          />
        </main>
      </div>
      <ChatHistoryTrigger
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
