import { Hero } from "./_components/hero";
import { RibbonMarquee } from "./_components/ribbon-marquee";
import { ConfidenceSection } from "./_components/confidence-section";
import { SolutionSection } from "./_components/solution-section";
import { HowItWorks } from "./_components/how-it-works";
import { AdultBrochureSection, ParentBrochureSection } from "./_components/brochure-sections";
import { DashboardPreview } from "./_components/dashboard-preview";
import { Testimonials } from "./_components/testimonials";
import { FaqSection } from "./_components/faq-section";
import { FinalCta } from "./_components/final-cta";

/**
 * Homepage section order — per brand brief 2026:
 *   1. Hero (patient-facing emotional entry)
 *   2. Ribbon (trust strip)
 *   3. Confidence (how a great smile transforms self-confidence)
 *   4. Why ORALIGN (SolutionSection — care, planning, doctor-supervised)
 *   5. Patient journey (HowItWorks — treatment steps)
 *   6. Adults (AdultBrochureSection — emotional transformation)
 *   7. Children/Parents (ParentBrochureSection)
 *   8. Smile preview (DashboardPreview — before/after gallery)
 *   9. Testimonials (real patient stories)
 *  10. FAQ
 *  11. FinalCta (patient close)
 *
 * Sections temporarily not rendered (kept in repo, may revive later):
 *   - Manifesto (removed per brief)
 *   - IndicationsDetail (replaced by stronger confidence/solution flow)
 *   - PrimeSection (merged into ParentBrochureSection)
 *   - PractitionerCallSection (B2B section paused)
 *   - DentistsSection ("Daily Life" — overlaps AdultBrochure)
 *   - OldVsNew (Aligners vs Braces — out of brief order)
 *   - MadeWhere (heritage — footer already conveys)
 */
export default function ShowcaseHomePage() {
  return (
    <>
      <Hero />
      <RibbonMarquee />
      <ConfidenceSection />
      <SolutionSection />
      <HowItWorks />
      <AdultBrochureSection />
      <ParentBrochureSection />
      <DashboardPreview />
      <Testimonials />
      <FaqSection />
      <FinalCta />
    </>
  );
}
