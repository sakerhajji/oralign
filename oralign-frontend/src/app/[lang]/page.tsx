import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { marketingMetadata } from "../(showcase)/_lib/seo/meta";
import { MarketingPageBody } from "../(showcase)/_lib/seo/page-bodies";
import { isLocalizedLang } from "../(showcase)/_lib/seo/routes";

/**
 * /en and /ar ARE the localized homepages — same rule as the French "/":
 * one canonical home URL per language, served at the root of its tree.
 * The former /en/discover and /ar/discover 308 here (next.config.ts).
 */
type Params = Promise<{ lang: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocalizedLang(lang)) return {};
  return marketingMetadata("home", lang);
}

export default async function LocalizedHomePage({ params }: { params: Params }) {
  const { lang } = await params;
  if (!isLocalizedLang(lang)) notFound();
  return <MarketingPageBody page="home" lang={lang} />;
}
