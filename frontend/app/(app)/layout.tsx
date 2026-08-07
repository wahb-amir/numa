import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main-content" className="flex-1 pb-24 lg:pb-0">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
