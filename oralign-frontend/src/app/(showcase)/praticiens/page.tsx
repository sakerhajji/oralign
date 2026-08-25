import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("practitioners", "fr");

export default function PraticiensPage() {
  return <MarketingPageBody page="practitioners" lang="fr" />;
}
