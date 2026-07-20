"use client";

import { LANGS, type Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";

export function FloatingLang() {
  const { lang, setLang } = useShowcaseLang();
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
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={isActive}
            aria-label={`Switch to ${l.toUpperCase()}`}
            className={[
              "relative bg-transparent border-0 border-t border-[var(--sc-grey)] px-3 py-2.5 uppercase transition-colors",
              "text-[0.62rem] font-medium tracking-[0.28em]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]",
              isActive
                ? "bg-[var(--sc-sun)] text-[var(--sc-black)]"
                : "text-[var(--sc-text-mid)] hover:bg-[#fdf9ec] hover:text-[var(--sc-black)]",
            ].join(" ")}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
