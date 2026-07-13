"use client";

import Link from "next/link";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

/**
 * Public "Find a Practitioner" page. Phase 1 ships this on-brand shell so the
 * header/mobile "Trouver un praticien" action resolves to a real route (no
 * 404). Phase 2 replaces it with the live directory: a map (Leaflet /
 * OpenStreetMap) + a filterable list of certified practitioners + an
 * appointment-request form that emails the selected practitioner.
 */
export function PractitionerFinder() {
  const { lang } = useShowcaseLang();

  return (
    <section
      data-section-tone="light"
      className="bg-[var(--sc-white)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
    >
      <div className="mx-auto max-w-[860px]">
        <Reveal>
          <div className="mb-6 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
            <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
            <span>{dict.finder.title[lang]}</span>
          </div>

          <h1 className="sc-serif text-[clamp(2.1rem,4.6vw,3.5rem)] font-normal leading-[1.05] tracking-[-0.02em]">
            {dict.finder.title[lang]}
          </h1>

          <p className="mt-5 max-w-[640px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
            {dict.finder.subtitle[lang]}
          </p>
        </Reveal>

        <Reveal delay>
          <div className="mt-12 border border-[rgba(25,25,25,0.1)] bg-[rgba(25,25,25,0.015)] p-8 sm:p-10">
            <p className="sc-serif text-[1.35rem] font-medium leading-snug tracking-[-0.01em] text-[var(--sc-black)]">
              {dict.finder.comingSoon[lang]}
            </p>
            <p className="mt-4 text-[0.97rem] leading-8 text-[var(--sc-text-mid)]">
              {dict.finder.comingSoonBody[lang]}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="sc-serif inline-flex min-h-11 items-center justify-center gap-2 bg-[var(--sc-black)] px-6 py-3 text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)] no-underline transition-colors hover:bg-[rgba(25,25,25,0.85)]"
              >
                {dict.nav.practitionerSpace[lang]}
              </Link>
              <Link
                href="/"
                className="sc-serif inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--sc-black)] px-6 py-3 text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)]"
              >
                {dict.pages.backHome[lang]}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
