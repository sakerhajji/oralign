import type { Metadata } from "next";
import { PractitionerFinder } from "../_components/practitioner-finder";

export const metadata: Metadata = {
  title: "Trouver un praticien | ORALIGN®",
  description:
    "Trouvez un praticien certifié ORALIGN près de chez vous et demandez un rendez-vous.",
  alternates: { canonical: "/trouver-un-praticien" },
};

export default function FindPractitionerPage() {
  return <PractitionerFinder />;
}
