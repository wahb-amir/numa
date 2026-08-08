import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";

export function CtaSection() {
  return (
    <section className="bg-surface-base">
      <Reveal>
        <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16 md:py-24 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-display-md">
            Start understanding your data, not just collecting it.
          </h2>
          <p className="mx-auto mt-3 max-w-prose text-base leading-relaxed text-text-secondary sm:mt-4 sm:text-lg">
            Numa is a context layer for the data you already have — not another
            diagnosis engine.
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-flex min-h-[44px] items-center gap-2 rounded-control bg-accent-emerald px-6 py-3 text-sm font-semibold text-text-inverse transition-transform duration-150 ease-editorial hover:-translate-y-0.5 hover:bg-[#325a46] sm:mt-8"
          >
            Start with Numa
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
      <footer className="border-t border-border px-4 py-8 text-center text-xs text-text-muted sm:px-6 lg:px-8">
        Numa surfaces patterns in your personal data for informational purposes
        only and is not a medical device or diagnostic tool.
      </footer>
    </section>
  );
}
