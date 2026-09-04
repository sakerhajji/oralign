import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("teens", "fr");

export default function AdosRoute() {
  return <MarketingPageBody page="teens" lang="fr" />;
}
