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
 * Arabic names of Tunisian cities. Practitioners type their city in Latin
 * script, but Arabic searchers type « صفاقس », not « Sfax » — an Arabic page
 * that only says "Sfax" never matches its own city query. Unknown cities fall
 * back to the name as entered.
 */
const CITY_AR: Record<string, string> = {
  tunis: "تونس",
  ariana: "أريانة",
  "ben arous": "بن عروس",
  manouba: "منوبة",
  mannouba: "منوبة",
  "la marsa": "المرسى",
  marsa: "المرسى",
  carthage: "قرطاج",
  "le bardo": "باردو",
  bardo: "باردو",
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
  kef: "الكاف",
  siliana: "سليانة",
  zaghouan: "زغوان",
};

function cityKey(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cityLabel(city: string | null | undefined, lang: Lang): string | null {
  const name = city?.trim();
  if (!name) return null;
  return lang === "ar" ? CITY_AR[cityKey(name)] ?? name : name;
}
