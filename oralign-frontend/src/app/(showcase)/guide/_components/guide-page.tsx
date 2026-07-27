"use client";

import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { GuideEmergencySection } from "./guide-emergency-section";
import { GuideFaqSection } from "./guide-faq-section";
import { GuideHero } from "./guide-hero";
import { GuideManifesto } from "./guide-manifesto";
import { GuideScrollProgress } from "./guide-scroll-progress";
import { GuideTipsSection } from "./guide-tips-section";
import { GuideTreatmentSection } from "./guide-treatment-section";
import { guideCopy } from "./guide-copy";

export function GuidePage() {
  const { lang } = useShowcaseLang();
  const copy = guideCopy[lang];

  return (
    <>
      <GuideHero hero={copy.hero} />
      <GuideScrollProgress progress={copy.progress} />

      {copy.sections.map((section, index) => (
        <GuideTreatmentSection
          key={section.id}
          section={section}
          videoLabel={copy.video.watch}
          videoPlaceholder={copy.video.placeholder}
          videoCloseLabel={copy.video.close}
          firstSection={index === 0}
        />
      ))}

      <GuideTipsSection tips={copy.tips} />
      <GuideEmergencySection emergency={copy.emergency} />
      <GuideFaqSection faq={copy.faq} />
      <GuideManifesto manifesto={copy.manifesto} />
    </>
  );
}
