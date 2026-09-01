"use client";

import { useEffect, useState } from "react";
import { useDemo } from "@/lib/demo-context";
import { useLogout } from "@/lib/use-logout";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  const { isDemo, state } = useDemo();
  const { signOut } = useLogout("/");
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState<string>("calculating...");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!state?.expiresAt) return;

    const calculateTime = () => {
      const now = new Date().getTime();
      const expires = new Date(state.expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft("Session expired");
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${h}h ${m}m left`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 60000); // update every minute
    return () => clearInterval(interval);
  }, [state?.expiresAt]);

  if (!isDemo || !state) return null;

  const personaLabel =
    state.personaId === "runner_demo"
      ? "Alex (Runner)"
      : state.personaId === "cyclist_demo"
        ? "Jordan (Cyclist)"
        : "Morgan (Gym)";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center justify-between gap-3 border-t border-border bg-surface-raised px-4 py-3 shadow-elevation-2 sm:flex-row sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5 font-medium text-text-primary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-emerald text-xs text-text-inverse">
            🎯
          </span>
          Demo: {personaLabel}
        </div>
        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="text-lg leading-none">⏱</span>
          <span className={isExpired ? "font-semibold text-status-concerning" : ""}>
            {timeLeft}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span className="text-lg leading-none">💬</span>
          <span
            className={
              state.narrateRemaining <= 0 ? "font-semibold text-status-concerning" : ""
            }
          >
            {state.narrateRemaining} / 5 AI queries
          </span>
        </div>
      </div>

      <div className="flex w-full items-center gap-3 sm:w-auto">
        <button
          onClick={() => {
            signOut();
          }}
          className="flex-1 whitespace-nowrap rounded-control border border-border px-3 py-2 text-xs font-medium text-text-primary transition-editorial hover:bg-surface-sunken sm:flex-none"
        >
          Exit demo
        </button>
        <Button
          onClick={() => {
            // They want to sign up, log them out of demo and go to signup
            signOut().then(() => router.push("/signup"));
          }}
          className="flex-1 whitespace-nowrap rounded-control bg-accent-emerald px-3 py-2 text-xs font-medium text-text-inverse transition-editorial hover:opacity-90 sm:flex-none"
        >
          Sign up for full access &rarr;
        </Button>
      </div>
    </div>
  );
}
