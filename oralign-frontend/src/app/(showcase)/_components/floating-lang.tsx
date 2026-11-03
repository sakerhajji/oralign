"use client";

import Link from "next/link";
import { LANGS, type Lang } from "../_lib/i18n/dict";
import { useLocalizedSibling, useShowcaseLang } from "../_lib/i18n/lang-context";

const LABEL: Record<Lang, string> = { fr: "Français", en: "English", ar: "العربية" };

/**
 * The desktop language rail. Each language is a LINK to the page's
 * sibling URL when one exists (/en/…, /ar/…), so the three trees are
 * joined by crawlable links and not only by hreflang; a page without a
 * sibling (blog, legal) keeps the in-place toggle. Clicking still
 * records the preference, as before.
 */
export function FloatingLang() {
  const { lang, setLang } = useShowcaseLang();
  const siblingFor = useLocalizedSibling();
  const itemClass = (isActive: boolean) =>
    [
      "relative block bg-transparent border-0 border-t border-[var(--sc-grey)] px-3 py-2.5 text-center uppercase no-underline transition-colors",
      "text-[0.62rem] font-medium tracking-[0.28em]",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]",
      isActive
        ? "bg-[var(--sc-sun)] text-[var(--sc-black)]"
        : "text-[var(--sc-text-mid)] hover:bg-[#fdf9ec] hover:text-[var(--sc-black)]",
    ].join(" ");

  return (
    <div
      role="group"
      aria-label="Language"
      className="fixed top-1/2 -translate-y-1/2 end-3 sm:end-4 lg:end-6 z-30 hidden flex-col items-stretch bg-[rgba(248,246,242,0.92)] backdrop-blur border border-[var(--sc-grey)] shadow-[0_2px_18px_rgba(10,10,10,0.06)] lg:flex"
    >
      <span
        aria-hidden="true"
        className="px-2 pt-2 pb-1 text-[0.46rem] tracking-[0.4em] uppercase text-[var(--sc-text-mid)] text-center"
      >
        Lang
      </span>
      {LANGS.map((l: Lang) => {
        const isActive = l === lang;
        const sibling = siblingFor(l);
        return sibling ? (
          <Link
            key={l}
            href={sibling}
            hrefLang={l}
            lang={l}
            onClick={() => setLang(l)}
            aria-current={isActive ? "true" : undefined}
            aria-label={LABEL[l]}
            className={itemClass(isActive)}
          >
            {l}
          </Link>
        ) : (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={isActive}
            aria-label={LABEL[l]}
            className={itemClass(isActive)}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
