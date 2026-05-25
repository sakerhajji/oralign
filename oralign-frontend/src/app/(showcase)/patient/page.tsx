import type { Metadata } from "next";
import { PatientHome } from "../_components/patient-home";

export const metadata: Metadata = {
  title: "ORALIGN® — Aligneurs invisibles pour patients",
  description:
    "Découvrez ORALIGN® : aligneurs transparents, confortables et supervisés par un praticien certifié.",
  alternates: { canonical: "/patient" },
};

export default function PatientPage() {
  return <PatientHome />;
}
