import { formatDate } from "@/lib/utils";
import { Bell, LogOut } from "lucide-react";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";

export function TopHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const now = new Date();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface-base/95 px-4 backdrop-blur-sm lg:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-text-muted">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="hidden text-sm text-text-secondary sm:inline tabular">
          {formatDate(now, { weekday: "long", month: "long", day: "numeric" })}
        </span>
        <button
          aria-label="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-control text-text-secondary hover:bg-surface-sunken"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>
        <ThemeToggle />
        {/* Mobile-friendly logout: full label on sm+, icon-only below. */}
        <LogoutButton
          className="flex h-9 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-status-concerning hover:bg-status-concerning-soft sm:px-3 sm:text-sm"
          iconOnlyClass="sm:hidden"
          icon={<LogOut className="h-4 w-4" aria-hidden="true" />}
          label="Sign out"
        />
      </div>
    </header>
  );
}