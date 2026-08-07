import { X, Check } from "lucide-react";
import { Reveal } from "./reveal";

export function ProblemStatement() {
  return (
    <section className="border-b border-border bg-surface-sunken">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 md:py-24 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-display-md">
            Raw numbers vs. real context
          </h2>
          <p className="mt-3 text-base leading-relaxed text-text-secondary sm:mt-4 sm:text-lg">
            Most tools stop at the number. Numa keeps asking why until the answer is actually
            useful.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-6 md:grid-cols-2">
          <Reveal delay={0.1}>
            <div className="rounded-card border border-border bg-surface-raised p-5 sm:p-6">
              <div className="flex items-center gap-2 text-text-muted">
                <X className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide">Raw data</span>
              </div>
              <p className="mt-3 text-lg font-semibold leading-snug text-text-primary sm:text-xl">
                &ldquo;Your run was 8% slower today.&rdquo;
              </p>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                A number with no story. It tells you what happened but leaves you to guess why —
                and whether it matters.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="rounded-card border border-accent-emerald/30 bg-surface-raised p-5 shadow-elevation-2 sm:p-6">
              <div className="flex items-center gap-2 text-accent-emerald">
                <Check className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Numa&apos;s context
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold leading-snug text-text-primary sm:text-xl">
                &ldquo;Your run was 8% slower, but you reported poor sleep and high effort.&rdquo;
              </p>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                The same number, now with the surrounding evidence — so you know whether to worry,
                rest, or just move on.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
