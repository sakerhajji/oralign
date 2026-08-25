import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("finder", "fr");

export default function FindPractitionerPage() {
  return <MarketingPageBody page="finder" lang="fr" />;
}
