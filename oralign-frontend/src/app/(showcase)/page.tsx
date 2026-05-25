import type { Metadata } from "next";
import { AudienceChooser } from "./_components/audience-chooser";

export const metadata: Metadata = {
  title: "ORALIGN® — Choisissez votre espace",
  description:
    "Accédez à l'espace patient ORALIGN® ou à la plateforme digitale dédiée aux dentistes et orthodontistes.",
  alternates: { canonical: "/" },
};

export default function ShowcaseHomePage() {
  return <AudienceChooser />;
}
