import { PractitionerHero } from "./practitioner/hero";
import { ContrastSection } from "./practitioner/contrast-section";
import { WorkflowSection } from "./practitioner/workflow-section";
import { ClinicalSection } from "./practitioner/clinical-section";
import { PlatformSection } from "./practitioner/platform-section";
import { PacksSection } from "./practitioner/packs-section";
import { PractitionerCta } from "./practitioner/cta-section";

/**
 * Practitioner homepage — one self-contained section per component, each
 * reading its own language slice from `./practitioner/copy`. Mirrors the
 * patient page's modular composition.
 *
 *   1. Hero      — typography-first value proposition + stat strip
 *   2. Contrast  — before / after ORALIGN
 *   3. Workflow  — 3-step adoption
 *   4. Clinical  — biomechanics credibility
 *   5. Platform  — all-in-one case management
 *   6. Packs     — live public catalogue + installments
 *   7. CTA       — risk-free trial
 */
export function PractitionerHome() {
  return (
    <>
      <PractitionerHero />
      <ContrastSection />
      <WorkflowSection />
      <ClinicalSection />
      <PlatformSection />
      <PacksSection />
      <PractitionerCta />
    </>
  );
}
