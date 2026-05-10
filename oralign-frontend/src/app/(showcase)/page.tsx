import { Hero } from "./_components/hero";
import { RibbonMarquee } from "./_components/ribbon-marquee";
import { ProblemSection } from "./_components/problem-section";
import { SolutionSection } from "./_components/solution-section";
import { HowItWorks } from "./_components/how-it-works";
import { PlatformFeatures } from "./_components/platform-features";
import { OldVsNew } from "./_components/old-vs-new";
import { DentistsSection } from "./_components/dentists-section";
import { PatientsSection } from "./_components/patients-section";
import { SecuritySection } from "./_components/security-section";
import { DashboardPreview } from "./_components/dashboard-preview";
import { CaseLifecycle } from "./_components/case-lifecycle";
import { Manifesto } from "./_components/manifesto";
import { Testimonials } from "./_components/testimonials";
import { PricingSection } from "./_components/pricing-section";
import { FaqSection } from "./_components/faq-section";
import { FinalCta } from "./_components/final-cta";

export default function ShowcaseHomePage() {
  return (
    <>
      <Hero />
      <RibbonMarquee />
      <ProblemSection />
      <SolutionSection />
      <HowItWorks />
      <PlatformFeatures />
      <OldVsNew />
      <DentistsSection />
      <PatientsSection />
      <SecuritySection />
      <DashboardPreview />
      <CaseLifecycle />
      <Manifesto />
      <Testimonials />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </>
  );
}
