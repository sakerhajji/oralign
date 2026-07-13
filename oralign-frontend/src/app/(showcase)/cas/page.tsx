import type { Metadata } from "next";
import {
  AvantApresSection,
  AgirTotSection,
} from "../_components/patient/cas-sections";

export const metadata: Metadata = {
  title: "Cas cliniques Oralign — Avant / Après & agir tôt | ORALIGN",
  description:
    "Cas cliniques Oralign : résultats avant / après par aligneurs invisibles et pourquoi une prise en charge précoce simplifie le traitement.",
  alternates: { canonical: "/cas" },
};

export default function CasPage() {
  return (
    <>
      <AvantApresSection />
      <AgirTotSection />
    </>
  );
}
