import { useState } from "react";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import type { ChatMessage as ChatMessageType } from "@/lib/types";
import { Sparkles, MessageCircleQuestion } from "lucide-react";
import { ChatSourcesDisclosure } from "./chat-sources";

export function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-card bg-accent-emerald px-4 py-2.5 text-sm text-text-inverse">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-card border border-border bg-surface-raised shadow-elevation-1">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Sparkles
            className="h-3.5 w-3.5 text-accent-emerald"
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-text-secondary">
            Numa
          </span>
        </div>
        <div className="space-y-3 px-4 py-3.5">
          {/* Takeaway leads the reply when present. It surfaces BEFORE
              the Observation card so the user reads Numa's read on the
              question first, then the numbers behind it. When the
              observation is empty (casual follow-ups), the takeaway IS
              the reply — no header label, just the prose. */}
          {message.takeaway && (
            <div>
              {message.observation ? (
                <p className="text-sm leading-relaxed text-text-primary">
                  {message.takeaway}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-text-primary">
                  {message.takeaway}
                </p>
              )}
            </div>
          )}
          {message.observation && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Observation
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-primary">
                {message.observation}
              </p>
            </div>
          )}
          {message.evidence && message.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Supporting Evidence
              </p>
              <ul className="mt-1 space-y-1">
                {message.evidence.map((e, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm leading-relaxed text-text-secondary"
                  >
                    <span
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted"
                      aria-hidden="true"
                    />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {message.alternatives && message.alternatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Alternative Explanations
              </p>
              <ul className="mt-1 space-y-1">
                {message.alternatives.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm leading-relaxed text-text-secondary"
                  >
                    <span
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted"
                      aria-hidden="true"
                    />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {message.questionsForYou && message.questionsForYou.length > 0 && (
            <QuestionsForYou questions={message.questionsForYou} />
          )}
          {!message.observation && !message.takeaway && (
            <p className="text-sm leading-relaxed text-text-primary">
              {message.content}
            </p>
          )}
          {(message.confidence || message.sources) && (
            <div className="space-y-2.5 border-t border-border pt-2.5">
              {message.sources && (
                <ChatSourcesDisclosure sources={message.sources} />
              )}
              {message.confidence && <ConfidenceBadge level={message.confidence} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * "Questions to help me understand" — a list of clickable chips the
 * model emits when the user's experience doesn't match the data (or
 * the data is too thin to answer well). Clicking a chip sends the
 * question as the next user turn. Wired up by setting a sentinel
 * custom event the chat-interface listens for; we keep this
 * self-contained to avoid prop-drilling the send function down to the
 * message component.
 */
function QuestionsForYou({ questions }: { questions: string[] }) {
  const [pending, setPending] = useState<string | null>(null);

  const handleClick = (q: string) => {
    if (pending) return;
    setPending(q);
    // Dispatch a custom event the chat-interface listens for. The
    // component sets this state to avoid double-clicks while the
    // request is in flight; the listener resets it on completion.
    window.dispatchEvent(
      new CustomEvent("numa:chat-send", { detail: { question: q } })
    );
  };

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        Questions to help me understand
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {questions.map((q, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => handleClick(q)}
              disabled={pending !== null}
              className="flex w-full items-start gap-2 rounded-control border border-border-strong bg-surface-base px-3 py-2 text-left text-sm leading-relaxed text-text-primary transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MessageCircleQuestion
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-emerald"
                aria-hidden="true"
              />
              <span>{q}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
