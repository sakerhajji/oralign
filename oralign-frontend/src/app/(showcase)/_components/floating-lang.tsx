"use client";

import { LANGS, type Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";

export function FloatingLang({
  /**
   * Show the switcher below the `lg` breakpoint too. The marketing site
   * keeps it desktop-only so it never sits over the hero art, but the
   * patient treatment viewer is opened from a link the dentist sends —
   * usually on a phone — where it is the ONLY way to change language.
   */
  showOnMobile = false,
}: {
  showOnMobile?: boolean;
} = {}) {
  const { lang, setLang } = useShowcaseLang();
  return (
    <div
      role="group"
      aria-label="Language"
      className={[
        "fixed end-3 sm:end-4 lg:end-6 z-30 flex-col items-stretch bg-[rgba(248,246,242,0.92)] backdrop-blur border border-[var(--sc-grey)] shadow-[0_2px_18px_rgba(10,10,10,0.06)] lg:flex",
        // Desktop keeps the centered rail. On small screens it sits just
        // under the 70px header instead: vertically centred it would land
        // on top of the treatment viewer, and patients drag that area to
        // rotate the 3D model.
        showOnMobile
          ? "flex top-20 lg:top-1/2 lg:-translate-y-1/2"
          : "hidden top-1/2 -translate-y-1/2",
      ].join(" ")}
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
