"use client";

import { dict, type Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

/**
 * Article meta line: author · published date · reading time. Client
 * component so the date format + "min read" label track the live
 * language; the values themselves come from the server-fetched post.
 */
export function ArticleByline({
  authorName,
  publishedAt,
  readingTime,
}: {
  authorName: string;
  publishedAt: string | null;
  readingTime: number;
}) {
  const { lang } = useShowcaseLang();
  const date = formatDate(publishedAt, lang);
  const reading = dict.blog.minRead[lang].replace("{n}", String(readingTime));

  const parts: string[] = [];
  if (authorName) parts.push(authorName);
  if (date) parts.push(date);
  parts.push(reading);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem] text-[var(--sc-text-mid)]">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-3">
          {i > 0 ? (
            <span aria-hidden="true" className="text-[var(--sc-mid-grey)]">
              ·
            </span>
          ) : null}
          <span>{part}</span>
        </span>
      ))}
    </div>
  );
}

const LOCALE: Record<Lang, string> = {
  fr: "fr-FR",
  en: "en-US",
  ar: "ar-TN",
};

function formatDate(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
