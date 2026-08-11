"use client";

import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UnitsProvider } from "@/lib/units-context";
import { UnitsHydrator } from "@/lib/units-hydrator";

/**
 * App shell. The global sidebar + mobile nav render on every route
 * (including /chat). The chat route's own layout mounts the chat
 * history rail + thread inside the main content column; this outer
 * layout just frames it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UnitsProvider>
      <UnitsHydrator />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main-content" className="flex-1">
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
    </UnitsProvider>
  );
}