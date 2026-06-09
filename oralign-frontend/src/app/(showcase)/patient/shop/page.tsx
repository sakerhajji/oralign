import type { Metadata } from "next";
import { ShowcasePageScaffold } from "../../_components/showcase-page";

export const metadata: Metadata = {
  title: "Shop Oralign | ORALIGN",
  description: "La boutique Oralign : accessoires et produits d'entretien pour prendre soin de vos aligneurs invisibles.",
  alternates: { canonical: "/patient/shop" },
};

export default function Page() {
  return <ShowcasePageScaffold titleKey="shop" />;
}
