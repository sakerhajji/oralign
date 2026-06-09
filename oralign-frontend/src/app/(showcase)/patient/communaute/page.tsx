import type { Metadata } from "next";
import {
  TemoignagesSection,
  PartagerSection,
} from "../../_components/patient/communaute-sections";

export const metadata: Metadata = {
  title: "Communauté Oralign — Témoignages & partage d'expérience | ORALIGN",
  description:
    "La communauté Oralign : témoignages de patients et partagez votre propre expérience de traitement par aligneurs invisibles.",
  alternates: { canonical: "/patient/communaute" },
};

export default function CommunautePage() {
  return (
    <>
      <TemoignagesSection />
      <PartagerSection />
    </>
  );
}
