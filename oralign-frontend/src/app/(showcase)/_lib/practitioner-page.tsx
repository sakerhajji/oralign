import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import type { Lang } from "./i18n/dict";
import { getPublicPractitioner, getPublicPractitioners } from "./practitioners";
import { cityKey, FINDER_PATH, idFromSlug, practitionerPath } from "./practitioner-url";
import { practitionerMetadata } from "./seo/meta";
import { JsonLd, practitionerBreadcrumbLd, practitionerLd } from "./seo/jsonld";
import { PractitionerProfile } from "../_components/practitioner-profile";

/**
 * Shared body of the three practitioner profile routes:
 *   /trouver-un-praticien/<slug>          (fr)
 *   /en/find-a-practitioner/<slug>        (en)
 *   /ar/find-a-practitioner/<slug>        (ar)
 */

async function load(slug: string) {
  const id = idFromSlug(slug);
  return id ? getPublicPractitioner(id) : null;
}

export async function practitionerPageMetadata(slug: string, lang: Lang): Promise<Metadata> {
  const practitioner = await load(slug).catch(() => null);
  return practitioner ? practitionerMetadata(practitioner, lang) : {};
}

export async function PractitionerPage({ slug, lang }: { slug: string; lang: Lang }) {
  const practitioner = await load(slug);
  if (!practitioner) notFound();

  // One URL per practice: a renamed clinic or a hand-typed slug lands on
  // the current canonical address instead of duplicating it.
  const canonical = practitionerPath(practitioner, lang);
  if (`${FINDER_PATH[lang]}/${slug}` !== canonical) permanentRedirect(canonical);

  const { data } = await getPublicPractitioners();
  // Same grouping rule as the city landing pages ("Sfax, Tunisie" is Sfax).
  const city = cityKey(practitioner.city);
  const sameCity = city
    ? data.filter((other) => other.id !== practitioner.id && cityKey(other.city) === city).slice(0, 6)
    : [];

  return (
    <>
      <JsonLd data={practitionerBreadcrumbLd(practitioner, lang)} />
      <JsonLd data={practitionerLd(practitioner, lang)} />
      <PractitionerProfile practitioner={practitioner} sameCity={sameCity} lang={lang} />
    </>
  );
}
