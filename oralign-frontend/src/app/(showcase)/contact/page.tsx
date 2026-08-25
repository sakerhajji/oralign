import type { Metadata } from "next";
import { marketingMetadata } from "../_lib/seo/meta";
import { MarketingPageBody } from "../_lib/seo/page-bodies";

export const metadata: Metadata = marketingMetadata("contact", "fr");

export default function ContactPage() {
  return <MarketingPageBody page="contact" lang="fr" />;
}
