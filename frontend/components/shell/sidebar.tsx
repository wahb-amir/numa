"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface-raised lg:flex"
    >
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-7 w-7 items-center justify-center rounded-control bg-accent-emerald text-sm font-bold text-text-inverse">
          N
        </div>
        <span className="text-sm font-bold tracking-tight">Numa</span>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
                    : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-control bg-surface-sunken px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-slate-soft text-xs font-bold text-accent-slate">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">Alex Rivera</p>
            <p className="truncate text-xs text-text-muted">30-day baseline active</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
