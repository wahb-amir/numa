import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: Date,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...opts,
  }).format(date);
}

export function formatDayLabel(daysAgo: number): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return formatDate(d, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Compact relative time used by the chat sidebar: "Just now", "5m",
 * "2h", "Yesterday", "Mon", "Jul 28". Keeps a stable, scannable label
 * for things updated within the current week; past-the-week shows the
 * day-of-week or absolute date so the user can place it in time.
 */
export function formatRelativeTime(input: string | Date): string {
  const now = Date.now();
  const then = typeof input === "string" ? new Date(input).getTime() : input.getTime();
  const diffMs = now - then;
  if (Number.isNaN(diffMs)) return "";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const sameDay = new Date(then).toDateString() === new Date(now).toDateString();
    if (sameDay) return `${hours}h`;
    return "Yesterday";
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    // Within the past week show the weekday so users can place a
    // session in their mental calendar without squinting at "1d".
    return new Date(then).toLocaleDateString("en-US", { weekday: "short" });
  }
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
