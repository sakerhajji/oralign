import type { Metadata } from "next";
import { ShowcasePageScaffold } from "../_components/showcase-page";

export const metadata: Metadata = {
  title: "Guide d'utilisation des aligneurs Oralign | ORALIGN",
  description: "Le guide pratique pour porter, nettoyer et entretenir vos aligneurs invisibles Oralign au quotidien.",
  alternates: { canonical: "/guide" },
};

export default function Page() {
  return <ShowcasePageScaffold titleKey="guide" />;
}
