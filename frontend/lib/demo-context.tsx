"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface DemoSessionState {
  personaId: string;
  expiresAt: string; // ISO timestamp
  narrateRemaining: number;
}

interface DemoContextValue {
  isDemo: boolean;
  state: DemoSessionState | null;
  setDemoState: (state: DemoSessionState | null) => void;
  decrementNarrate: () => void;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoSessionState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage on mount
    try {
      const stored = localStorage.getItem("numa_demo_session");
      if (stored) {
        setState(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to parse demo session state", e);
    }
    setMounted(true);
  }, []);

  const setDemoState = (newState: DemoSessionState | null) => {
    setState(newState);
    if (newState) {
      localStorage.setItem("numa_demo_session", JSON.stringify(newState));
    } else {
      localStorage.removeItem("numa_demo_session");
    }
  };

  const decrementNarrate = () => {
    setState((prev) => {
      if (!prev) return null;
      const next = {
        ...prev,
        narrateRemaining: Math.max(0, prev.narrateRemaining - 1),
      };
      localStorage.setItem("numa_demo_session", JSON.stringify(next));
      return next;
    });
  };

  // Don't render with potentially wrong context during SSR
  if (!mounted) {
    return null; // Or you could render children, but the banner wouldn't match hydration.
  }

  return (
    <DemoContext.Provider
      value={{
        isDemo: state !== null,
        state,
        setDemoState,
        decrementNarrate,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (ctx === undefined) {
    throw new Error("useDemo must be used within a DemoProvider");
  }
  return ctx;
}
