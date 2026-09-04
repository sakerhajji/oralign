import type { Metadata } from "next";
import { marketingMetadata } from "./_lib/seo/meta";
import { MarketingPageBody } from "./_lib/seo/page-bodies";

/**
 * The canonical French homepage. It lives at the site root — the URL
 * people type, link and share — so the origin resolves to real content
 * instead of a redirect: Organization/WebSite JSON-LD, robots `host`,
 * OpenGraph `url` and hreflang `x-default` all name it.
 *
 * The former /decouvrir URL 308s here (next.config.ts), so old links
 * and anything Google already crawled follow along and consolidate.
 */
export const metadata: Metadata = marketingMetadata("home", "fr");

export default function HomePage() {
  return <MarketingPageBody page="home" lang="fr" />;
}
