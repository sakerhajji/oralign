import type { Lang } from "./i18n/dict";
import type { PublicPractitioner } from "./finder";

/**
 * Public URL of a partner practitioner's profile page.
 *
 * The slug carries the clinic and city words for the searcher and ends with
 * the profile id, which is what the page actually resolves — so a clinic that
 * renames itself keeps working: the stale slug redirects to the current one.
 *
 * Shared by the server pages, the sitemap and the client finder (the list
 * cards link here), so it must stay free of server-only imports.
 */

const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function slugify(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function practitionerSlug(p: Pick<PublicPractitioner, "id" | "clinicName" | "practitionerName" | "city">): string {
  const words = [slugify(p.clinicName || p.practitionerName), slugify(p.city)]
    .filter(Boolean)
    .join("-");
  return words ? `${words}-${p.id}` : p.id;
}

/** The profile id at the end of a slug, or null when the slug is malformed. */
export function idFromSlug(slug: string): string | null {
  return UUID_TAIL.exec(slug)?.[1]?.toLowerCase() ?? null;
}

export const FINDER_PATH: Record<Lang, string> = {
  fr: "/trouver-un-praticien",
  en: "/en/find-a-practitioner",
  ar: "/ar/find-a-practitioner",
};

export function practitionerPath(
  p: Pick<PublicPractitioner, "id" | "clinicName" | "practitionerName" | "city">,
  lang: Lang,
): string {
  return `${FINDER_PATH[lang]}/${practitionerSlug(p)}`;
}

/**
 * Latin spellings that name the same city, mapped to the one canonical key
 * (the key every other table and every URL uses). Applied as the LAST step
 * of `cityKey`, so "Marsa", "La Marsa" and "المرسى" are one city, one page,
 * one slug — never two pages with the same Arabic title.
 */
const CITY_ALIAS: Record<string, string> = {
  mannouba: "manouba",
  marsa: "la marsa",
  bardo: "le bardo",
  kef: "le kef",
};

/**
 * Arabic names of Tunisian cities, by canonical key only (aliases resolve
 * through CITY_ALIAS before any lookup here). Practitioners type their city
 * in Latin script, but Arabic searchers type « صفاقس », not « Sfax » — an
 * Arabic page that only says "Sfax" never matches its own city query.
 * Unknown cities fall back to the name as entered.
 */
const CITY_AR: Record<string, string> = {
  tunis: "تونس",
  ariana: "أريانة",
  "ben arous": "بن عروس",
  manouba: "منوبة",
  "la marsa": "المرسى",
  carthage: "قرطاج",
  "le bardo": "باردو",
  "la goulette": "حلق الوادي",
  sousse: "سوسة",
  sfax: "صفاقس",
  monastir: "المنستير",
  mahdia: "المهدية",
  nabeul: "نابل",
  hammamet: "الحمامات",
  bizerte: "بنزرت",
  gabes: "قابس",
  medenine: "مدنين",
  djerba: "جربة",
  zarzis: "جرجيس",
  tataouine: "تطاوين",
  kairouan: "القيروان",
  kasserine: "القصرين",
  "sidi bouzid": "سيدي بوزيد",
  gafsa: "قفصة",
  tozeur: "توزر",
  kebili: "قبلي",
  beja: "باجة",
  jendouba: "جندوبة",
  "le kef": "الكاف",
  siliana: "سليانة",
  zaghouan: "زغوان",
};

/**
 * Arabic name → canonical Latin key, for a practitioner who typed the Arabic
 * name. Built from CITY_AR alone, whose keys are all canonical, so every
 * Arabic spelling lands on the same key as its Latin-typing neighbours.
 */
const CITY_FROM_AR: Record<string, string> = Object.fromEntries(
  Object.entries(CITY_AR).map(([latin, ar]) => [ar, latin]),
);

/**
 * The grouping key of a city, and the rule behind every city URL:
 *
 *   1. one comma-separated part of the field counts (see `cityHead`):
 *      "Sfax, Tunisie" → "Sfax", "Khezama, Sousse" → "Sousse";
 *   2. accents are dropped, case is folded, anything that is not a Latin
 *      letter becomes one space, and the ends are trimmed — so "Sfax",
 *      "sfax ", "SFAX" and "Béja"/"Beja" are one city;
 *   3. an Arabic name that CITY_AR knows ("صفاقس") maps to its Latin key;
 *   4. a known alias collapses onto its canonical key ("marsa" → "la marsa",
 *      "mannouba" → "manouba"), so alias spellings never split a city.
 *
 * Empty when nothing usable is left (an unknown Arabic-only name, digits):
 * such a practitioner belongs to no city page.
 */
export function cityKey(city: string | null | undefined): string {
  return partKey(cityHead(city));
}

/** Steps 2–4 of `cityKey` on one comma-separated part. */
/** A plain-object lookup that ignores inherited keys ("constructor", …): the city is free text. */
function lookup(table: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function partKey(part: string): string {
  const folded = foldCity(lookup(CITY_FROM_AR, part) ?? part);
  return lookup(CITY_ALIAS, folded) ?? folded;
}

/**
 * Step 1 of `cityKey`: which comma-separated part of the city field names
 * the city. The field is free text a practitioner typed, and in practice
 * takes one of three shapes:
 *
 *   - "Sfax"             → "Sfax"
 *   - "Sfax, Tunisie"    → "Sfax"   (city first, then country or region)
 *   - "Khezama, Sousse"  → "Sousse" (district first, then the city)
 *
 * The first part wins, unless it is unknown to CITY_AR and a later part is
 * a known city: then the known part is the city and the first part was a
 * neighbourhood. Whitespace is collapsed; empty parts are skipped.
 */
function cityHead(city: string | null | undefined): string {
  const parts = (city ?? "")
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts.find((part) => Object.hasOwn(CITY_AR, partKey(part))) ?? parts[0];
}

/** Step 2 of `cityKey`: a Latin city name, folded. */
function foldCity(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL segment of a city: its key with hyphens ("ben arous" → "ben-arous"). */
export function citySlug(city: string | null | undefined): string {
  return cityKey(city).replace(/ /g, "-");
}

/**
 * An all-lower or all-upper spelling, capitalised by word ("SFAX" → "Sfax",
 * "ben arous" → "Ben Arous"); a mixed-case one is kept as typed ("El Menzah",
 * "La Marsa"), since the typist already chose its case.
 */
function capitaliseUniform(name: string): string {
  const lower = name.toLowerCase();
  const upper = name.toUpperCase();
  if (lower === upper || (name !== lower && name !== upper)) return name;
  return lower.replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function cityLabel(city: string | null | undefined, lang: Lang): string | null {
  const name = city?.trim();
  if (!name) return null;
  const key = cityKey(name);
  const head = cityHead(name);
  // An unknown city is labelled by its head part in every language, and a
  // city typed in Arabic still gets a Latin label on the FR/EN pages.
  if (lang === "ar") return lookup(CITY_AR, key) ?? head;
  const latin = lookup(CITY_FROM_AR, head);
  return capitaliseUniform(latin ? latin.replace(/(^| )[a-z]/g, (c) => c.toUpperCase()) : head);
}

/**
 * The French "in <city>" phrase, with its article contracted: "à Sfax",
 * "à La Marsa", but "au Bardo", "au Kef" for a city labelled with "Le ".
 * Every French string that places something in a city goes through here
 * (the city pages, their metadata, the profiles, llms.txt) so "à Le Bardo"
 * never ships.
 */
export function frInCity(city: string): string {
  return /^le /i.test(city) ? `au ${city.slice(3)}` : `à ${city}`;
}

/**
 * A city page with fewer listed practitioners than this is still served
 * and linked, but noindexed and left out of the sitemap and llms.txt: a
 * page listing one practice only repeats that practice's own profile and
 * reads as thin content. See city-page.tsx for the rationale.
 */
export const CITY_INDEX_MIN_PRACTITIONERS = 2;

/** Whether a city page lists enough practices to be worth indexing. */
export function isIndexableCity(group: Pick<CityGroup, "practitioners">): boolean {
  return group.practitioners.length >= CITY_INDEX_MIN_PRACTITIONERS;
}

/**
 * City landing page: /trouver-un-praticien/ville/<slug> and its /en, /ar
 * twins. The "ville" segment is the same in the three languages so one
 * route shape serves them all; the slug is the Latin city key, in Arabic
 * too (Arabic searchers land through hreflang and the H1, not the URL).
 */
export function cityPath(city: string, lang: Lang): string {
  return `${FINDER_PATH[lang]}/ville/${citySlug(city)}`;
}

/** The practitioners of one city, under the label they most often typed. */
export type CityGroup = {
  key: string;
  slug: string;
  /**
   * Latin label: a spelling of the canonical name when one member typed it
   * ("La Marsa" over "Marsa"), otherwise the spelling used most.
   */
  label: string;
  practitioners: PublicPractitioner[];
};

/**
 * The public directory grouped by city, sorted by label — only cities with
 * at least one listed practitioner exist, so every group is a page worth
 * indexing. The reverse lookup from a URL segment is `findCity`.
 */
export function groupByCity(practitioners: readonly PublicPractitioner[]): CityGroup[] {
  type Bucket = { spellings: Map<string, number>; practitioners: PublicPractitioner[] };
  const groups = new Map<string, Bucket>();
  for (const p of practitioners) {
    const key = cityKey(p.city);
    if (!key) continue;
    const group: Bucket = groups.get(key) ?? { spellings: new Map(), practitioners: [] };
    // "SFAX" and "sfax" are the same spelling, "Sfax", once capitalised.
    const spelling = capitaliseUniform(cityLabel(p.city, "fr") ?? key);
    group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
    group.practitioners.push(p);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, group]) => {
    // A spelling of the canonical name wins over an alias, then frequency.
    const canonical = (spelling: string) => (foldCity(spelling) === key ? 1 : 0);
    const [label] = Array.from(group.spellings).sort(
      (a, b) => canonical(b[0]) - canonical(a[0]) || b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    return { key, slug: citySlug(key), label, practitioners: group.practitioners };
  }).sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/** The city a URL segment names, or null when no listed practitioner is there. */
export function findCity(groups: readonly CityGroup[], slug: string): CityGroup | null {
  const wanted = slug.toLowerCase();
  return groups.find((g) => g.slug === wanted) ?? null;
}
