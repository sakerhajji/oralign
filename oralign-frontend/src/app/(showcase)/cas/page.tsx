import type { Metadata } from "next";
import { AgirTotSection } from "../_components/patient/cas-sections";
import { DashboardPreview } from "../_components/dashboard-preview";

export const metadata: Metadata = {
  title: "Cas cliniques Oralign — Avant / Après & agir tôt | ORALIGN",
  description:
    "Cas cliniques Oralign : résultats avant / après par aligneurs invisibles et pourquoi une prise en charge précoce simplifie le traitement.",
  alternates: { canonical: "/cas" },
};

export default function CasPage() {
  return (
    <>
      <DashboardPreview id="avant-apres" />
      <AgirTotSection />
    </>
  );
}
