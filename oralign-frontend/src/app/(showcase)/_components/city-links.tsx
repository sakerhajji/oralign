import Link from "next/link";
import { dict, partnerPractitionerCount, type Lang } from "../_lib/i18n/dict";
import { cityLabel, cityPath, type CityGroup } from "../_lib/practitioner-url";

/**
 * The city landing pages as a row of chips — the same shape as the
 * finder's filter chips, but plain server-rendered links: this is how
 * crawlers reach /trouver-un-praticien/ville/<city> from the directory,
 * and how a visitor jumps to a city without touching the filters.
 */

const CHIP =
  "inline-flex min-h-10 items-center gap-2 border border-[rgba(25,25,25,0.18)] px-3.5 py-1.5 text-[0.84rem] font-medium text-[var(--sc-black)] no-underline transition-colors hover:border-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]";

export function CityLinks({
  groups,
  lang,
  className = "",
}: {
  groups: readonly CityGroup[];
  lang: Lang;
  className?: string;
}) {
  if (groups.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {groups.map((g) => (
        <li key={g.key}>
          <Link href={cityPath(g.label, lang)} className={CHIP}>
            {cityLabel(g.label, lang) ?? g.label}
            {/* The bare figure is for the eye; the accessible name says what it counts. */}
            <span aria-hidden="true" className="text-[0.74rem] tabular-nums text-[var(--sc-text-mid)]">
              {g.practitioners.length}
            </span>
            <span className="sr-only">, {partnerPractitionerCount(g.practitioners.length, lang)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The "By city" strip under the directory. Renders nothing without a city. */
export function CityStrip({ groups, lang }: { groups: readonly CityGroup[]; lang: Lang }) {
  if (groups.length === 0) return null;
  return (
    <section
      data-section-tone="light"
      aria-labelledby="by-city-title"
      className="bg-[var(--sc-white)] px-5 pb-16 text-[var(--sc-black)] sm:px-8 sm:pb-20 lg:px-12 lg:pb-24"
    >
      <div className="mx-auto max-w-[1240px] border-t border-[rgba(25,25,25,0.08)] pt-8">
        <h2
          id="by-city-title"
          className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-sun-deep)]"
        >
          {dict.finder.byCity[lang]}
        </h2>
        <CityLinks groups={groups} lang={lang} className="mt-4" />
      </div>
    </section>
  );
}
