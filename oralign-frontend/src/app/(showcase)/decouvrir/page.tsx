import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("home", "fr");

export default function DecouvrirPage() {
  return <MarketingPageBody page="home" lang="fr" />;
}
