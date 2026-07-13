import type { Metadata } from "next";
import { PatientHome } from "./_components/patient-home";

export const metadata: Metadata = {
  title: "ORALIGN® — Aligneurs invisibles pour patients",
  description:
    "Découvrez ORALIGN® : aligneurs transparents, confortables et supervisés par un praticien certifié.",
  alternates: { canonical: "/" },
};

// The public site is the Patient website. Its home renders directly at "/"
// (the old Patient/Practitioner audience chooser is gone). The practitioner
// marketing showcase has been removed — practitioners enter via the secured
// platform ("Espace praticien" → /login).
export default function ShowcaseHomePage() {
  return <PatientHome />;
}
