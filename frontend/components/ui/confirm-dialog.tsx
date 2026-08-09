"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Label for the destructive primary action. */
  confirmLabel: string;
  /** Optional label override for the cancel button. */
  cancelLabel?: string;
  /** Set false for non-destructive confirms (true by default). */
  destructive?: boolean;
  /** Disable the confirm button while the action is in-flight. */
  loading?: boolean;
  /** Additional detail body rendered between description and buttons. */
  children?: React.ReactNode;
  onConfirm: () => void;
}

/**
 * Minimal modal primitive — accessible by default:
 *   - role="dialog" + aria-modal="true"
 *   - aria-labelledby / aria-describedby tied to title + description ids
 *   - focus moves to the confirm button on open, restored on close
 *   - Escape closes (unless loading), outside-click closes
 *   - body scroll is locked while open
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  loading = false,
  children,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = "confirm-dialog-title";
  const descId = "confirm-dialog-desc";
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    // Lock background scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Defer focus until the button is mounted.
    queueMicrotask(() => confirmRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      previousFocus.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        aria-hidden="true"
        onClick={() => !loading && onOpenChange(false)}
        className="absolute inset-0 bg-text-primary/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "relative z-10 w-full max-w-md rounded-card border border-border bg-surface-raised shadow-elevation-3",
          "animate-[fadeIn_120ms_ease-out]",
        )}
      >
        <div className="p-6">
          <h2
            id={titleId}
            className="text-base font-semibold text-text-primary"
          >
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-2 text-sm text-text-secondary">
              {description}
            </p>
          )}
          {children && <div className="mt-4">{children}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-sunken/40 px-6 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="rounded-control border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60",
              destructive
                ? "bg-status-concerning text-text-inverse hover:bg-status-concerning/90"
                : "bg-accent-emerald text-text-inverse hover:bg-accent-emerald/90",
            )}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}