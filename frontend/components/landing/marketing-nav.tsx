"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";

const LINKS = [
  { href: "#context", label: "Why context" },
  { href: "#adaptation", label: "How it learns" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface-base/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-control bg-accent-emerald text-sm font-bold text-text-inverse">
            N
          </div>
          <span className="text-sm font-bold tracking-tight text-text-primary">
            Numa
          </span>
        </Link>

        <nav
          aria-label="Marketing"
          className="hidden items-center gap-8 md:flex"
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-control bg-accent-emerald px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-[#325a46]"
          >
            Start with Numa
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </nav>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-10 w-10 items-center justify-center rounded-control text-text-primary md:hidden"
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {open && (
        <nav
          aria-label="Marketing mobile"
          className="border-t border-border bg-surface-raised px-4 py-4 md:hidden"
        >
          <ul className="space-y-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-control px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard"
            className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 rounded-control bg-accent-emerald px-4 text-sm font-semibold text-text-inverse"
          >
            Start with Numa
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </nav>
      )}
    </header>
  );
}
