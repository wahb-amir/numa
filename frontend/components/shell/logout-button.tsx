"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogout } from "@/lib/use-logout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface LogoutButtonProps {
  className?: string;
  label?: string;
  icon?: React.ReactNode;
  /**
   * If provided, the label is hidden and the icon is always shown
   * (responsive helpers can swap which class is applied).
   */
  iconOnlyClass?: string;
  /**
   * Show a confirmation modal before signing out. Defaults to true —
   * sign-out is destructive (it revokes server-side tokens), so we want
   * a single deliberate click. Pass `false` for trusted UI surfaces
   * where the user has already confirmed the action.
   */
  confirm?: boolean;
}

/**
 * Reusable sign-out trigger. Wraps `useLogout` so any shell element
 * (sidebar menu, top header, profile page) can wire to the same
 * coordinated session-clearing flow.
 */
export function LogoutButton({
  className,
  label = "Sign out",
  icon = <LogOut className="h-4 w-4" aria-hidden="true" />,
  iconOnlyClass,
  confirm = true,
}: LogoutButtonProps) {
  const { signOut, loading } = useLogout();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      onClick={() => {
        if (confirm) setConfirmOpen(true);
        else void signOut();
      }}
      disabled={loading}
      aria-label={loading ? "Signing out…" : label}
      className={cn(
        "inline-flex items-center gap-2 transition-colors disabled:opacity-60",
        className,
      )}
    >
      {icon}
      <span className={cn(iconOnlyClass && "hidden", iconOnlyClass)}>
        {loading ? "Signing out…" : label}
      </span>
    </button>
  );

  return (
    <>
      {trigger}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out of Numa?"
        description="Your access and refresh tokens will be revoked server-side, so any other browsers signed in to this account will also be signed out."
        confirmLabel="Sign out"
        loading={loading}
        onConfirm={() => {
          setConfirmOpen(false);
          void signOut();
        }}
      />
    </>
  );
}