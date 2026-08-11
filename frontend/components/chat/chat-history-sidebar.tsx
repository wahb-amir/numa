"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useChatSessions } from "@/lib/use-chat-sessions";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * Left rail for /chat — Claude / ChatGPT style list of past conversations.
 * Each row links to /chat?session=<id>; clicking "+ New chat" navigates to
 * plain /chat, which renders the empty greeting.
 *
 * On <md the rail becomes a slide-in drawer triggered from the top
 * header (see /chat/layout.tsx). This component stays the same — the
 * parent decides whether to render it as fixed or as a drawer overlay.
 */
export function ChatHistorySidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Notify parent that a session was clicked so it can close the drawer. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const activeSessionId = search.get("session");
  const { sessions, isLoading, create, rename, remove } = useChatSessions();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingOpen, setRenamingOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingOpen, setDeletingOpen] = useState(false);

  async function handleNewChat() {
    const created = await create();
    router.replace(`/chat?session=${created.id}`);
    onNavigate?.();
  }

  function startRename(id: string, currentTitle: string) {
    setRenamingId(id);
    setRenameDraft(currentTitle);
    setRenamingOpen(true);
  }

  async function commitRename() {
    if (!renamingId) return;
    const next = renameDraft.trim();
    setRenamingOpen(false);
    if (!next) {
      setRenamingId(null);
      return;
    }
    try {
      await rename(renamingId, next);
    } catch {
      // optimistic update rolled back already; nothing else to do here
    } finally {
      setRenamingId(null);
    }
  }

  async function confirmDelete() {
    if (!deletingId) return;
    const id = deletingId;
    const wasActive = id === activeSessionId;
    setDeletingOpen(false);
    try {
      await remove(id);
      if (wasActive) router.replace("/chat");
    } catch {
      // optimistic update rolled back
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <aside
      aria-label="Chat history"
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface-raised",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Chats
        </h2>
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-sunken"
          aria-label="Start a new chat"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
          New
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <li className="px-3 py-2 text-xs text-text-muted">Loading…</li>
        )}
        {!isLoading && sessions.length === 0 && (
          <li className="px-3 py-3 text-xs text-text-muted">
            No conversations yet. Start one above.
          </li>
        )}
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <li key={session.id} className="group relative">
              <Link
                href={`/chat?session=${session.id}`}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-start gap-2 rounded-control px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent-emerald-soft text-accent-emerald shadow-elevation-1"
                    : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {session.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                    <span>{formatRelativeTime(session.updated_at)}</span>
                    {session.message_count > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {session.message_count} msg
                          {session.message_count === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </Link>
              {/* Hover-revealed actions. The parent <Link> would steal
                  clicks if these lived inside it, so the buttons are
                  siblings and we stop propagation manually. */}
              <div className="pointer-events-none absolute right-1 top-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Rename "${session.title}"`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startRename(session.id, session.title);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-control text-text-muted hover:bg-surface-raised hover:text-text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete "${session.title}"`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeletingId(session.id);
                    setDeletingOpen(true);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-control text-text-muted hover:bg-status-concerning-soft hover:text-status-concerning"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={renamingOpen}
        onOpenChange={(open) => {
          setRenamingOpen(open);
          if (!open) setRenamingId(null);
        }}
        title="Rename chat"
        description="Choose a new title for this conversation."
        confirmLabel="Save"
        destructive={false}
        onConfirm={commitRename}
      >
        <label className="block">
          <span className="sr-only">Chat title</span>
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitRename();
              }
            }}
            className="w-full rounded-control border border-border-strong bg-surface-base px-3 py-2 text-sm text-text-primary focus-visible:outline-none"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={deletingOpen}
        onOpenChange={(open) => {
          setDeletingOpen(open);
          if (!open) setDeletingId(null);
        }}
        title="Delete chat?"
        description="This conversation and its messages will be removed. This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </aside>
  );
}

/**
 * Wrapper used by the page header on mobile. Mirrors ChatHistorySidebar's
 * API but renders into a portal'd drawer so the layout isn't constrained
 * to a fixed 256px column on small screens.
 */
export function ChatHistoryTrigger({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Chat history"
    >
      <button
        type="button"
        aria-label="Close chat history"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-text-primary/40 backdrop-blur-[2px]"
      />
      <ChatHistorySidebar
        className="relative z-10 animate-[fadeIn_120ms_ease-out]"
        onNavigate={() => onOpenChange(false)}
      />
      <button
        type="button"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
        className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-control bg-surface-raised text-text-secondary shadow-elevation-1"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}