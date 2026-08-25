import type { Metadata } from "next";
import { ShowcasePageScaffold } from "../_components/showcase-page";

/**
 * Placeholder page ("boutique en préparation"). noindex until it carries
 * real content — indexable thin pages hurt sitewide quality signals.
 * Flip robots + re-add to sitemap.ts when the shop launches.
 */
export const metadata: Metadata = {
  title: "Boutique | ORALIGN®",
  description:
    "La boutique Oralign : accessoires et produits d'entretien pour prendre soin de vos aligneurs invisibles.",
  alternates: { canonical: "/shop" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <ShowcasePageScaffold titleKey="shop" />;
}
