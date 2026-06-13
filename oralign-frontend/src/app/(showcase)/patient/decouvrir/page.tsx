import type { Metadata } from "next";
import {
  DailyLifeSection,
  GuidePreviewSection,
  OralignHeroSection,
  OralignPrimeSection,
  ParcoursSection,
  PrecisionSection,
  PraticiensSection,
  SmileFreedomSection,
  TreatmentDurationSection,
  WearAlignersSection,
} from "../../_components/patient/decouvrir-sections";

export const metadata: Metadata = {
  title: "Découvrir Oralign — Aligneurs invisibles, Prime, parcours | ORALIGN",
  description:
    "Découvrez Oralign : aligneurs invisibles premium, Oralign Prime pour enfants et adolescents, le parcours patient et comment trouver un praticien près de chez vous.",
  alternates: { canonical: "/patient/decouvrir" },
};

export default function DecouvrirPage() {
  return (
    <>
      <OralignHeroSection />
      <SmileFreedomSection />
      <DailyLifeSection />
      <GuidePreviewSection />
      <PrecisionSection />
      <TreatmentDurationSection />
      <WearAlignersSection />
      <OralignPrimeSection />
      <ParcoursSection />
      <PraticiensSection />
    </>
  );
}
