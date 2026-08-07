import { Sparkline } from "@/components/charts/sparkline";
import { Reveal } from "./reveal";

const MONTHS = [
  { label: "Month 1", value: 42, note: "Heart rate spikes early in warm runs" },
  { label: "Month 2", value: 51, note: "Slightly better pacing in heat" },
  { label: "Month 3", value: 63, note: "Cardiac drift declining" },
  { label: "Month 4", value: 74, note: "Consistent pace at matched effort" },
];

export function AdaptationTimeline() {
  return (
    <section id="adaptation" className="border-b border-border bg-surface-base">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 md:py-24 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-display-md">
            Built to notice slow change
          </h2>
          <p className="mt-3 text-base leading-relaxed text-text-secondary sm:mt-4 sm:text-lg">
            Some of the most important patterns unfold over months, not days. Numa compares you
            against your own history — never a generic demographic average.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-8 rounded-card border border-border bg-surface-raised p-5 shadow-elevation-1 sm:mt-10 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Heat adaptation on runs — 4 month view
            </p>
            <div className="mt-4">
              <Sparkline data={MONTHS.map((m) => m.value)} height={100} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {MONTHS.map((m) => (
                <div key={m.label} className="border-t border-border pt-3">
                  <p className="text-xs font-semibold text-text-primary">{m.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{m.note}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
