import { Hero } from "./_components/hero";
import { RibbonMarquee } from "./_components/ribbon-marquee";
import { IndicationsDetail } from "./_components/indications-detail";
import { ConfidenceSection } from "./_components/confidence-section";
import { SolutionSection } from "./_components/solution-section";
import { HowItWorks } from "./_components/how-it-works";
import { AdultBrochureSection, ParentBrochureSection } from "./_components/brochure-sections";
import { PrimeSection } from "./_components/prime-section";
import { DashboardPreview } from "./_components/dashboard-preview";
import { Testimonials } from "./_components/testimonials";
import { FaqSection } from "./_components/faq-section";
import { FinalCta } from "./_components/final-cta";
import { PractitionerCallSection } from "./_components/practitioner-call-section";

/**
 * Homepage section order — per brand brief 2026:
 *   1. Hero (patient-facing emotional entry)
 *   2. Ribbon (trust strip)
 *   3. Indications (when aligners are right)
 *   4. Confidence (NEW — how a great smile transforms self-confidence)
 *   5. Why ORALIGN (SolutionSection — care, planning, doctor-supervised)
 *   6. Patient journey (HowItWorks — treatment steps)
 *   7. Adults (AdultBrochureSection — emotional transformation)
 *   8. Children/Parents (PrimeSection intro + ParentBrochureSection)
 *   9. Smile preview (DashboardPreview — before/after gallery)
 *  10. Testimonials (real patient stories)
 *  11. PractitionerCallSection (B2B Dentists)
 *  12. FAQ
 *  13. FinalCta (patient close)
 *
 * Sections temporarily not rendered (kept in repo, may revive later):
 *   - Manifesto (removed per brief)
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
