"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { UserMenu } from "./user-menu";
import { ThemeNavControls } from "./theme-nav-controls";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface-raised lg:flex"
    >
      <Link
        href="/dashboard"
        className="flex h-16 items-center gap-2 border-b border-border px-6"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-control bg-accent-emerald text-sm font-bold text-text-inverse">
          N
        </div>
        <span className="text-sm font-bold tracking-tight">Numa</span>
      </Link>
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-editorial",
                  active
                    ? "bg-accent-emerald-soft text-accent-emerald"
                    : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                )}
              >
                <Icon
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                  strokeWidth={2}
                />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border">
        <ThemeNavControls />
        <div className="px-4 pb-4">
          <UserMenu />
        </div>
      </div>
    </nav>
  );
}