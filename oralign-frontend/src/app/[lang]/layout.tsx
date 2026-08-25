import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShowcaseChrome } from "../(showcase)/_components/showcase-chrome";
import { OG_LOCALE, SITE_NAME, SITE_URL } from "../(showcase)/_lib/seo/meta";
import { isLocalizedLang, LOCALIZED_LANGS } from "../(showcase)/_lib/seo/routes";

/**
 * Localized showcase trees: /en/* (English) and /ar/* (Arabic, RTL).
 * French owns the historical root paths, so this segment only accepts
 * those two language codes — anything else 404s, which also gives every
 * stray one-segment URL a proper not-found instead of matching here.
 *
 * The chrome pins the language to the URL (forcedLang): the SSR HTML,
 * the metadata and the visible content all agree, which is the contract
 * hreflang relies on.
 */

export function generateStaticParams() {
  return LOCALIZED_LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocalizedLang(lang)) return {};
  const isAr = lang === "ar";
  return {
    metadataBase: new URL(SITE_URL),
    title: isAr
      ? "ORALIGN® — تقويم الأسنان الشفاف في تونس"
      : "ORALIGN® — Clear Aligners in Tunisia",
    description: isAr
      ? "مصففات أسنان شفافة من ORALIGN® — مصممة في ألمانيا ومصنوعة في تونس، بإشراف طبيب معتمد."
      : "ORALIGN® clear aligners — designed in Germany, manufactured in Tunisia, supervised by certified practitioners.",
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALE[lang],
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocalizedShowcaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocalizedLang(lang)) notFound();
  return <ShowcaseChrome forcedLang={lang}>{children}</ShowcaseChrome>;
}
