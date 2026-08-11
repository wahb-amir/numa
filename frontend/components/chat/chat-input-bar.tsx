"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The text input at the bottom of the chat thread. Stateless — the
 * parent owns the message list and the disabled/sending state. The
 * caller passes `onSend` (fired on submit) and `disabled` (true while
 * waiting for the assistant).
 */
export function ChatInputBar({
  onSend,
  disabled,
}: {
  onSend: (question: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Keep focus in the input — typing one message after another is the
    // common case, and explicit focus avoids the user having to click
    // back in.
    inputRef.current?.focus();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="bg-surface-base px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 lg:px-8"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-control border border-border-strong bg-surface-raised px-3 shadow-elevation-1 transition-shadow focus-within:border-accent-emerald focus-within:shadow-elevation-2">
        <label htmlFor="chat-input" className="sr-only">
          Ask Numa a question about your data
        </label>
        <input
          id="chat-input"
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask about a trend, workout, or how you're feeling..."
          disabled={disabled}
          className="min-h-[44px] flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none disabled:opacity-60"
        />
        <Button
          type="submit"
          size="sm"
          aria-label="Send message"
          className="h-9 w-9 px-0"
          disabled={!value.trim() || disabled}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}