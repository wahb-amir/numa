"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, User as UserIcon, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLogout } from "@/lib/use-logout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ApiAuthUser } from "@/lib/types";
import { cn } from "@/lib/utils";

function initialsFor(user: ApiAuthUser | null, fallback = "A"): string {
  if (!user?.email) return fallback;
  const source =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email;
  const parts = source
    .split(/[@\s._-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return fallback;
  return parts.map((p) => p[0]!.toUpperCase()).join("");
}

export function UserMenu() {
  const [user, setUser] = useState<ApiAuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { signOut, loading: signingOut } = useLogout();

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser((data.user as unknown as ApiAuthUser) ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user as unknown as ApiAuthUser | undefined;
      setUser(u ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Close on outside click / Escape (only the dropdown, not the modal).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Signed in";
  const initials = initialsFor(user);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-control bg-surface-sunken px-3 py-2.5 text-left transition-colors hover:bg-surface-base"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-slate-soft text-xs font-bold text-accent-slate">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {displayName}
          </p>
          <p className="truncate text-xs text-text-muted">
            {user?.email ?? "Loading…"}
          </p>
        </div>
        <ChevronUp
          className={cn(
            "h-4 w-4 shrink-0 text-text-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-control border border-border bg-surface-raised shadow-elevation-2"
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-text-primary hover:bg-surface-sunken"
          >
            <UserIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
            Profile &amp; settings
          </Link>
          <div className="h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirmOpen(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-status-concerning hover:bg-status-concerning-soft"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out of Numa?"
        description="Your access and refresh tokens will be revoked server-side, so any other browsers signed in to this account will also be signed out."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={() => {
          // Mark the dialog as closing so the loading state can't keep it
          // pinned open if signOut resolves before the route change fires.
          setConfirmOpen(false);
          void signOut();
        }}
      >
        <p className="rounded-chip border-l-2 border-status-concerning-soft bg-status-concerning-soft px-3 py-2 text-xs text-text-secondary">
          You will be returned to the sign-in page.
        </p>
      </ConfirmDialog>
    </div>
  );
}