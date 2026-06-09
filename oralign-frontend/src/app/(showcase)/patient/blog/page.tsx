import type { Metadata } from "next";
import { ShowcasePageScaffold } from "../../_components/showcase-page";

export const metadata: Metadata = {
  title: "Blog Oralign — Conseils sourire & orthodontie | ORALIGN",
  description: "Conseils, actualités et guides sur les aligneurs invisibles et le sourire, par Oralign.",
  alternates: { canonical: "/patient/blog" },
};

export default function Page() {
  return <ShowcasePageScaffold titleKey="blogs" />;
}
