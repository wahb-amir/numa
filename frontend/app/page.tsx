import { MarketingNav } from "@/components/landing/marketing-nav";
import { Hero } from "@/components/landing/hero";
import { ProblemStatement } from "@/components/landing/problem-statement";
import { AdaptationTimeline } from "@/components/landing/adaptation-timeline";
import { CtaSection } from "@/components/landing/cta-section";

export default function LandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main-content">
        <Hero />
        <ProblemStatement />
        <AdaptationTimeline />
        <CtaSection />
      </main>
    </>
  );
}
