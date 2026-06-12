/**
 * Backend i18n core — deliberately tiny.
 *
 * The whole stack standardises on ONE translation shape: a leaf object
 * with an `en` and a `fr` string (the frontend dict, the quote/invoice
 * PDF catalogs and now notifications + emails all use it). No i18n
 * framework, no locale files to load at runtime — a translation is a
 * plain object literal next to the code that uses it, and resolving it
 * is a property access.
 *
 * Fallback policy: unknown/missing language → English. A missing `fr`
 * string on a leaf also falls back to `en`, so a partially translated
 * catalog degrades to readable English instead of blank strings.
 */

export type Lang = 'en' | 'fr';

export const DEFAULT_LANG: Lang = 'fr';

/** A translatable pair. `fr` optional so catalogs can be filled over time. */
export interface LangText {
  en: string;
  fr?: string;
}

/**
 * Normalise any stored / user-supplied value ("FR", "fr-FR",
 * "en_US", null, garbage…) to a supported Lang. Unknown values fall
 * back to English per the project-wide fallback policy — NOT the
 * default UI language — so a corrupted value never silently French-
 * ifies an English user's emails.
 */
export function pickLang(value: string | null | undefined): Lang {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'fr' || v.startsWith('fr-') || v.startsWith('fr_')) return 'fr';
  return 'en';
}

/** Resolve a LangText leaf for a language, falling back to English. */
export function tr(text: LangText | string, lang: Lang): string {
  if (typeof text === 'string') return text;
  return (lang === 'fr' ? text.fr : text.en) ?? text.en;
}
