import type { Metadata } from "next";
import {
  DailyLifeSection,
  GuidePreviewSection,
  OralignHeroSection,
  PrecisionSection,
  SmileConsultationCtaSection,
  SmileFreedomSection,
  TreatmentDurationSection,
  WearAlignersVideoSection,
} from "../_components/patient/decouvrir-sections";
import { HowItWorks } from "../_components/how-it-works";

export const metadata: Metadata = {
  title: "Découvrir Oralign — Aligneurs invisibles, Prime, parcours | ORALIGN",
  description:
    "Découvrez Oralign : aligneurs invisibles premium, Oralign Prime pour enfants et adolescents, le parcours patient et comment trouver un praticien près de chez vous.",
  alternates: { canonical: "/decouvrir" },
};

export default function DecouvrirPage() {
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
}
