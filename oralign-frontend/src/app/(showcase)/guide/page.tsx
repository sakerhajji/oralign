import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("guide", "fr");

export default function Page() {
  return <MarketingPageBody page="guide" lang="fr" />;
}
