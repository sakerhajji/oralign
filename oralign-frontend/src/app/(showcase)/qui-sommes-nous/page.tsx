import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("about", "fr");

export default function QuiSommesNousPage() {
  return <MarketingPageBody page="about" lang="fr" />;
}
