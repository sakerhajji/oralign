import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageBody } from "../../(showcase)/_lib/seo/page-bodies";
import { marketingMetadata } from "../../(showcase)/_lib/seo/meta";
import {
  hasLang,
  isLocalizedLang,
  MARKETING_PAGE_KEYS,
  PAGE_SLUGS,
  SLUG_TO_KEY,
} from "../../(showcase)/_lib/seo/routes";

/**
 * One dynamic route serves every localized marketing page (/en/discover,
 * /ar/for-dentists, …). The slug resolves through the SEO registry to the
 * same page body the French pages mount, so the three language versions
 * can never drift structurally. Params are fully enumerated at build time
 * and everything else 404s (dynamicParams = false).
 */

export const dynamicParams = false;

/**
 * Called once per parent lang param — only emit the slugs that EXIST in
 * that language (about/contact have no Arabic yet), so /ar/about-us is
 * a build-time 404 instead of a French body under Arabic metadata.
 */
export function generateStaticParams({ params }: { params: { lang: string } }) {
  return MARKETING_PAGE_KEYS.filter(
    // "home" is served at /<lang> itself, not /<lang>/discover — the old
    // slug 308s there (next.config.ts), so building it would be a dead
    // duplicate of the localized homepage.
    (key) => key !== "home" && isLocalizedLang(params.lang) && hasLang(key, params.lang),
  ).map((key) => ({ slug: PAGE_SLUGS[key] }));
}

type Params = Promise<{ lang: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, slug } = await params;
  const key = SLUG_TO_KEY[slug];
  if (!key || !isLocalizedLang(lang) || !hasLang(key, lang)) return {};
  return marketingMetadata(key, lang);
}

export default async function LocalizedMarketingPage({ params }: { params: Params }) {
  const { lang, slug } = await params;
  const key = SLUG_TO_KEY[slug];
  if (!key || !isLocalizedLang(lang) || !hasLang(key, lang)) notFound();
  return <MarketingPageBody page={key} lang={lang} />;
}
