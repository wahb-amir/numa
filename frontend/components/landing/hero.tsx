import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusChip } from "@/components/ui/status";
import { Sparkline } from "@/components/charts/sparkline";
import { Reveal } from "./reveal";

const PREVIEW_TREND = [58, 61, 55, 64, 60, 67, 63, 70, 66, 72, 69, 75, 71, 78];

const QUICK_FACTS = [
  { label: "Wearable data", detail: "Sleep, HRV, resting HR" },
  { label: "Your own baseline", detail: "Not demographic norms" },
  { label: "Plain-language reasoning", detail: "Evidence, not guesses" },
];

export function Hero() {
  return (
    <section id="context" className="border-b border-border bg-surface-base">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-8">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-chip bg-accent-emerald-soft px-2.5 py-1 text-xs font-semibold text-accent-emerald">
              Health context, not diagnosis
            </span>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-5 text-3xl font-bold leading-[1.1] tracking-tight text-text-primary sm:text-display-lg lg:text-display-xl">
              Your health data tells you what happened.
              <span className="block text-accent-emerald">Numa helps you understand why.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-5 max-w-prose text-base leading-relaxed text-text-secondary sm:mt-6 sm:text-lg">
              Numa synthesizes your wearable data, workouts, and how you actually felt into one
              evolving timeline — then reasons over it with the care of a good coach, not a black
              box.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-7 flex flex-wrap items-center gap-4 sm:mt-8">
              <Link
                href="/dashboard"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-control bg-accent-emerald px-6 py-3 text-sm font-semibold text-text-inverse transition-transform duration-150 ease-editorial hover:-translate-y-0.5 hover:bg-[#325a46]"
              >
                Start with Numa
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-xs text-text-muted">Surfaces patterns to explore, not diagnoses.</p>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <dl className="mt-9 grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-3 sm:gap-6">
              {QUICK_FACTS.map((f) => (
                <div key={f.label}>
                  <dt className="text-sm font-semibold text-text-primary">{f.label}</dt>
                  <dd className="mt-0.5 text-xs text-text-muted">{f.detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <div className="rounded-card border border-border bg-surface-raised p-5 shadow-elevation-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Today&apos;s State
              </p>
              <StatusChip status="positive">Well recovered</StatusChip>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-editorial-num tabular text-text-primary">78</span>
              <span className="text-sm text-text-muted">/ 100 recovery</span>
            </div>
            <div className="mt-4">
              <Sparkline data={PREVIEW_TREND} height={64} />
            </div>
            <div className="mt-4 rounded-control border border-accent-emerald/20 bg-accent-emerald-soft/50 p-3">
              <p className="text-xs font-semibold text-accent-emerald">Numa Insight</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                Your heat tolerance on runs appears to have improved steadily over the last 4 months.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
