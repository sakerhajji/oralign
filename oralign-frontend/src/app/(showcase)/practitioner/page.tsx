import type { Metadata } from "next";
import { PractitionerHome } from "../_components/practitioner-home";

export const metadata: Metadata = {
  title: "ORALIGN® — Plateforme clinique pour praticiens",
  description:
    "Plateforme digitale ORALIGN® pour dentistes et orthodontistes : cas d'aligneurs, fichiers STL, validation 3D, production et suivi.",
  alternates: { canonical: "/practitioner" },
};

export default function PractitionerPage() {
  return <PractitionerHome />;
}
