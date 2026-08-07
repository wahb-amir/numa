import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import type { ChatMessage as ChatMessageType } from "@/lib/types";
import { Sparkles } from "lucide-react";

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
          <Sparkles className="h-3.5 w-3.5 text-accent-emerald" aria-hidden="true" />
          <span className="text-xs font-semibold text-text-secondary">Numa</span>
        </div>
        <div className="space-y-3 px-4 py-3.5">
          {message.observation && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Observation
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-primary">{message.observation}</p>
            </div>
          )}
          {message.evidence && message.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Supporting Evidence
              </p>
              <ul className="mt-1 space-y-1">
                {message.evidence.map((e, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-text-secondary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" aria-hidden="true" />
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
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-text-secondary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" aria-hidden="true" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!message.observation && <p className="text-sm leading-relaxed text-text-primary">{message.content}</p>}
          {message.confidence && (
            <div className={cn("border-t border-border pt-2.5")}>
              <ConfidenceBadge level={message.confidence} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
