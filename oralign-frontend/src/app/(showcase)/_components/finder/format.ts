/**
 * Locale-aware date/time formatting for the finder UI. Slot ISO strings come
 * from the backend; we render them in the visitor's local timezone.
 */

import type { Lang } from "../../_lib/finder";

const LOCALES: Record<Lang, string> = {
  fr: "fr-FR",
  en: "en-GB",
  ar: "ar-TN",
};

export function localeOf(lang: Lang): string {
  return LOCALES[lang] ?? "fr-FR";
}

/** "14:30" */
export function formatTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(localeOf(lang), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "12 juillet" — day + month, no year. */
export function formatDayMonth(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(localeOf(lang), {
    day: "numeric",
    month: "long",
  });
}

/** "lundi 12 juillet à 14:30" — full, for confirmations. */
export function formatDateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(localeOf(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = formatTime(iso, lang);
  return `${date} · ${time}`;
}
