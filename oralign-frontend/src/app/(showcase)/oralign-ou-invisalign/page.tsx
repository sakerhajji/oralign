import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("comparison", "fr");

export default function ComparatifRoute() {
  return <MarketingPageBody page="comparison" lang="fr" />;
}
