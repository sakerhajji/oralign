import type { Lang } from "../i18n/dict";
import type { MarketingPageKey } from "./routes";
import { JsonLd, breadcrumbLd, dentistServiceLd, faqLd, procedureLd } from "./jsonld";
import { getLegalCompany } from "../legal-info";
import {
  DailyLifeSection,
  GuidePreviewSection,
  OralignHeroSection,
  PrecisionSection,
  SmileConsultationCtaSection,
  SmileFreedomSection,
  TreatmentDurationSection,
  WearAlignersVideoSection,
} from "../../_components/patient/decouvrir-sections";
import { HowItWorks } from "../../_components/how-it-works";
import { AgirTotSection } from "../../_components/patient/cas-sections";
import { DashboardPreview } from "../../_components/dashboard-preview";
import {
  CommunauteCta,
  PartagerSection,
  TemoignagesSection,
} from "../../_components/patient/communaute-sections";
import { PractitionerFinder } from "../../_components/practitioner-finder";
import { PractitionerLanding } from "../../_components/practitioner-landing/practitioner-landing";
import { GuidePage } from "../../guide/_components/guide-page";
import { LegalDocView } from "../../_components/legal/legal-doc-view";

/**
 * Single source of truth for what each marketing page RENDERS. The French
 * pages (/decouvrir, /cas, …) and the localized /en + /ar variants all
 * mount this server component, so the three language versions of a page
 * can never drift apart structurally — only the language differs.
 *
 * Page-scoped JSON-LD ships from here too (inline, server-rendered):
 * a BreadcrumbList everywhere, plus MedicalProcedure + FAQPage on the
 * home page and the B2B Service schema on the practitioners landing.
 */
export async function MarketingPageBody({
  page,
  lang,
}: {
  page: MarketingPageKey;
  lang: Lang;
}) {
  return (
    <>
      <JsonLd data={breadcrumbLd(page, lang)} />
      {page === "home" && <JsonLd data={procedureLd(lang)} />}
      {/* FAQPage lives on the guide pages: that's where the FaqSection the
          markup describes is actually visible (Google requirement). */}
      {page === "guide" && <JsonLd data={faqLd(lang)} />}
      {page === "practitioners" && <JsonLd data={dentistServiceLd(lang)} />}
      {await pageSections(page)}
    </>
  );
}

async function pageSections(page: MarketingPageKey) {
  switch (page) {
    case "home":
      return (
        <>
          <OralignHeroSection />
          <SmileFreedomSection />
          <DailyLifeSection />
          <GuidePreviewSection />
          <PrecisionSection />
          <HowItWorks />
          <TreatmentDurationSection />
          <WearAlignersVideoSection />
          <SmileConsultationCtaSection />
        </>
      );
    case "cases":
      return (
        <>
          <DashboardPreview id="avant-apres" headingAs="h1" />
          <AgirTotSection />
        </>
      );
    case "finder":
      return <PractitionerFinder />;
    case "guide":
      return <GuidePage />;
    case "community":
      return (
        <>
          <TemoignagesSection />
          <PartagerSection />
          <CommunauteCta />
        </>
      );
    case "practitioners":
      return <PractitionerLanding />;
    case "about":
      return <LegalDocView docKey="about" company={await getLegalCompany()} />;
    case "contact":
      return <LegalDocView docKey="contact" company={await getLegalCompany()} />;
  }
}
