import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("pricing", "fr");

export default function PrixRoute() {
  return <MarketingPageBody page="pricing" lang="fr" />;
}
