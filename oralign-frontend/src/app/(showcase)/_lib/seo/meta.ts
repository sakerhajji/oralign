import type { Metadata } from "next";
import type { Lang } from "../i18n/dict";
import { MARKETING_PAGES, PAGE_LANGS, pathFor, type MarketingPageKey } from "./routes";

/**
 * Single source of truth for the public origin. Everything SEO-visible
 * (canonical, hreflang, JSON-LD, sitemap, robots) must build absolute
 * URLs from here — never hardcode the domain in page files.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://oralign.com.tn";

export const SITE_NAME = "ORALIGN by Aura Aligners";

export const OG_LOCALE: Record<Lang, string> = {
  fr: "fr_TN",
  en: "en_US",
  ar: "ar_TN",
};

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/**
 * hreflang set for a marketing page — only the languages the page EXISTS
 * in (PAGE_LANGS); x-default points at the French page (primary market).
 * The SAME set is declared on every variant so the cluster is reciprocal
 * — Google ignores hreflang groups whose members don't point back at
 * each other.
 */
function hreflangFor(key: MarketingPageKey): Record<string, string> {
  const langs = PAGE_LANGS[key];
  const fr = pathFor(key, "fr");
  const set: Record<string, string> = { "fr-TN": fr, fr };
  if (langs.includes("en")) set.en = pathFor(key, "en");
  if (langs.includes("ar")) {
    set["ar-TN"] = pathFor(key, "ar");
    set.ar = pathFor(key, "ar");
  }
  set["x-default"] = fr;
  return set;
}

/**
 * Complete, self-contained Metadata for one marketing page in one
 * language: unique title/description, self-canonical, reciprocal
 * hreflang, localized OpenGraph/Twitter. metadataBase comes from the
 * enclosing layout, so all paths here stay relative.
 */
export function marketingMetadata(key: MarketingPageKey, lang: Lang): Metadata {
  const page = MARKETING_PAGES[key][lang];
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: {
      canonical: page.path,
      languages: hreflangFor(key),
    },
    openGraph: {
      type: "website",
      title: page.title,
      description: page.description,
      url: page.path,
      siteName: SITE_NAME,
      locale: OG_LOCALE[lang],
      alternateLocale: PAGE_LANGS[key].filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
    robots: { index: true, follow: true },
  };
}
