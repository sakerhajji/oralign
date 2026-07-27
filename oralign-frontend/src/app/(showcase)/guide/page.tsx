import type { Metadata } from "next";
import { GuidePage } from "./_components/guide-page";

export const metadata: Metadata = {
  title: "Guide d'utilisation des aligneurs Oralign | ORALIGN",
  description: "Le guide pratique pour porter, nettoyer et entretenir vos aligneurs invisibles Oralign au quotidien.",
  alternates: { canonical: "/guide" },
};

export default function Page() {
  return <GuidePage />;
}
