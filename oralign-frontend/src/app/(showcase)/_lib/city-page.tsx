import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import type { Lang } from "./i18n/dict";
import { getPublicPractitioners } from "./practitioners";
import { cityPath, findCity, groupByCity, type CityGroup } from "./practitioner-url";
import { absoluteUrl, cityMetadata } from "./seo/meta";
import { JsonLd, cityBreadcrumbLd, practitionerListLd } from "./seo/jsonld";
import { CityDirectory, cityPageTitle } from "../_components/city-directory";

/**
 * Shared body of the three city landing routes:
 *   /trouver-un-praticien/ville/<city>        (fr)
 *   /en/find-a-practitioner/ville/<city>      (en)
 *   /ar/find-a-practitioner/ville/<city>      (ar)
 *
 * A city exists only while at least one public practitioner is listed
 * there: the groups are recomputed from the directory on every render
 * (ISR, hourly), so a city that empties becomes a 404 instead of an
 * empty page that search engines would still index.
 *
 * That 404 is only ever decided on a directory that was actually read:
 * the render reads it strictly, so an API timeout or error throws and
 * Next keeps serving the copy it has, instead of caching "no such city"
 * for an hour in three languages because the API blinked.
 *
 * Thin pages: a city with fewer than CITY_INDEX_MIN_PRACTITIONERS (2)
 * listed practices is served and linked like any other — the visitor who
 * follows a chip still gets the page — but it is noindexed (follow kept,
 * so the profile behind it is still crawled), and left out of the sitemap
 * and llms.txt. A one-practice city page says nothing its only profile
 * does not already say, and a crawl surface of near-duplicate thin pages
 * costs the directory more than the extra URL earns. The threshold lives
 * in practitioner-url.ts so the sitemap, llms.txt and the metadata apply
 * the same rule without importing this module.
 */

async function load(city: string): Promise<{ group: CityGroup | null; groups: CityGroup[] }> {
  const { data } = await getPublicPractitioners({ strict: true });
  const groups = groupByCity(data);
  return { group: findCity(groups, city), groups };
}

/**
 * Static params for every city with a listed practitioner. This read is the
 * soft one on purpose: at build time an unreachable API means "prebuild
 * nothing", and each city is then rendered on first visit.
 */
export async function cityStaticParams(): Promise<{ city: string }[]> {
  const { data } = await getPublicPractitioners();
  return groupByCity(data).map((g) => ({ city: g.slug }));
}

/**
 * No `.catch` here, on purpose: `load` reads the directory strictly, so an
 * API timeout or error throws out of generateMetadata and fails the whole
 * render (the body throws on the same deduplicated fetch anyway). That is
 * what we want — a failed render leaves the previously cached page in
 * place, whereas catching here would publish a page with empty metadata,
 * or a 404, for an hour because the API blinked.
 */
export async function cityPageMetadata(city: string, lang: Lang): Promise<Metadata> {
  const { group } = await load(city);
  return group ? cityMetadata(group, lang) : {};
}

export async function CityPage({ city, lang }: { city: string; lang: Lang }) {
  const { group, groups } = await load(city);
  if (!group) notFound();

  // One URL per city: "/ville/SFAX" or "/ville/Sfax" resolves (findCity
  // folds case) but lands on the canonical lower-case slug instead of
  // duplicating it — the same rule as the practitioner profiles.
  if (city !== group.slug) permanentRedirect(cityPath(group.label, lang));

  const others = groups.filter((g) => g.key !== group.key);

  return (
    <>
      <JsonLd data={cityBreadcrumbLd(group, lang)} />
      <JsonLd
        data={practitionerListLd(group.practitioners, lang, {
          name: cityPageTitle(group, lang),
          url: absoluteUrl(cityPath(group.label, lang)),
        })}
      />
      <CityDirectory group={group} others={others} lang={lang} />
    </>
  );
}
