import { Hero } from "./hero";
import { RibbonMarquee } from "./ribbon-marquee";
import { ConfidenceSection } from "./confidence-section";
import { SolutionSection } from "./solution-section";
import { HowItWorks } from "./how-it-works";
import { AdultBrochureSection, ParentBrochureSection } from "./brochure-sections";
import { DashboardPreview } from "./dashboard-preview";
import { Testimonials } from "./testimonials";
import { FaqSection } from "./faq-section";
import { FinalCta } from "./final-cta";

/**
 * Patient homepage section order — per brand brief 2026:
 *   1. Hero (patient-facing emotional entry)
 *   2. Ribbon (trust strip)
 *   3. Confidence
 *   4. Why ORALIGN
 *   5. Patient journey
 *   6. Adults
 *   7. Children/Parents
 *   8. Smile preview
 *   9. Testimonials
 *  10. FAQ
 *  11. FinalCta
 */
export function PatientHome() {
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
