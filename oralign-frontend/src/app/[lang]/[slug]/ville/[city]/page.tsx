import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityPage, cityPageMetadata, cityStaticParams } from "../../../../(showcase)/_lib/city-page";
import { isLocalizedLang, PAGE_SLUGS } from "../../../../(showcase)/_lib/seo/routes";

/**
 * /en/find-a-practitioner/ville/<city> and /ar/find-a-practitioner/ville/<city>.
 * The static "ville" segment wins over the sibling [practitioner] route;
 * only the finder slug has city children, any other /<lang>/<page>/ville/<x>
 * is a 404.
 */
export const revalidate = 3600;

/**
 * Params from the bottom up: this page fills [slug] (always the finder)
 * and [city] for each lang the layout above enumerates. Fails soft to
 * none; a city first visited later is rendered on demand and cached.
 */
export async function generateStaticParams() {
  const cities = await cityStaticParams();
  return cities.map(({ city }) => ({ slug: PAGE_SLUGS.finder, city }));
}

type Params = Promise<{ lang: string; slug: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, slug, city } = await params;
  if (!isLocalizedLang(lang) || slug !== PAGE_SLUGS.finder) return {};
  return cityPageMetadata(city, lang);
}

export default async function LocalizedCityLandingPage({ params }: { params: Params }) {
  const { lang, slug, city } = await params;
  if (!isLocalizedLang(lang) || slug !== PAGE_SLUGS.finder) notFound();
  return <CityPage city={city} lang={lang} />;
}
