import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("community", "fr");

export default function CommunautePage() {
  return <MarketingPageBody page="community" lang="fr" />;
}
