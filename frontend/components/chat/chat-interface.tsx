"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

const INITIAL: ChatMessageType[] = [
  {
    id: "m0",
    role: "assistant",
    content: "",
    observation:
      "Hi Alex — I'm ready to help you understand your recent training and recovery data. Ask me anything about a workout, a trend, or how you've been feeling.",
    confidence: "high",
  },
];

const SUGGESTED_PROMPTS = [
  "Why has my recovery been lower this week?",
  "Am I training too much right now?",
  "How does my sleep affect my running pace?",
];

function mockAssistantResponse(question: string): ChatMessageType {
  return {
    id: `m-${Date.now()}`,
    role: "assistant",
    content: "",
    observation: `Based on the last 14 days, your recovery appears related to how consistently you're sleeping more than to training volume itself. This isn't a definitive answer to "${question}" — it's the strongest pattern currently visible in your data.`,
    evidence: [
      "3 of your 4 lowest recovery days followed nights under 6.5 hours of sleep",
      "Training load over the same window stayed within your normal range",
    ],
    confidence: "moderate",
    alternatives: [
      "Cumulative fatigue from the block of harder sessions two weeks ago could still be a factor",
      "Stress or schedule changes on short-sleep nights may be the deeper cause",
    ],
  };
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessageType[]>(INITIAL);
  const [value, setValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const userMsg: ChatMessageType = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setValue("");
    setIsThinking(true);
    // Simulated latency for a mock AI response — no live model call in this prototype.
    setTimeout(() => {
      setMessages((prev) => [...prev, mockAssistantResponse(trimmed)]);
      setIsThinking(false);
    }, 900);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(value);
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col lg:h-[calc(100vh-4rem-3rem)]">
      <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {isThinking && (
            <div className="flex justify-start">
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-1.5 rounded-card border border-border bg-surface-raised px-4 py-3"
              >
                <span className="sr-only">Numa is thinking</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted"
                    style={{ animationDelay: `${i * 150}ms` }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {messages.length <= 1 && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-2 lg:px-8">
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="rounded-chip border border-border-strong bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-surface-raised px-4 py-3 lg:px-8"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Ask Numa a question about your data
          </label>
          <input
            id="chat-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask about a trend, workout, or how you're feeling..."
            className="flex-1 rounded-control border border-border-strong bg-surface-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none min-h-[44px]"
          />
          <Button
            type="submit"
            aria-label="Send message"
            disabled={!value.trim()}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}
