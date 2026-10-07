import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PractitionerPage, practitionerPageMetadata } from "../../../(showcase)/_lib/practitioner-page";
import { isLocalizedLang, PAGE_SLUGS } from "../../../(showcase)/_lib/seo/routes";

/**
 * /en/find-a-practitioner/<slug> and /ar/find-a-practitioner/<slug>.
 * Only the finder has children; any other /<lang>/<page>/<x> is a 404.
 */
export const revalidate = 3600;

/**
 * Nothing prebuilt (the API may be unreachable at build time); an empty
 * list is what makes Next cache each profile on first visit (ISR) instead
 * of rendering it on every request.
 */
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ lang: string; slug: string; practitioner: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, slug, practitioner } = await params;
  if (!isLocalizedLang(lang) || slug !== PAGE_SLUGS.finder) return {};
  return practitionerPageMetadata(practitioner, lang);
}

export default async function LocalizedPractitionerProfilePage({ params }: { params: Params }) {
  const { lang, slug, practitioner } = await params;
  if (!isLocalizedLang(lang) || slug !== PAGE_SLUGS.finder) notFound();
  return <PractitionerPage slug={practitioner} lang={lang} />;
}
