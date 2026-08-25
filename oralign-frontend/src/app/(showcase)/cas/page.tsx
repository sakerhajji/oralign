import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("cases", "fr");

export default function CasPage() {
  return <MarketingPageBody page="cases" lang="fr" />;
}
