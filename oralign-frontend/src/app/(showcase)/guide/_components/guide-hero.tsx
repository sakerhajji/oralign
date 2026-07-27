import Link from "next/link";
import type { GuideCopy } from "./guide-copy";

type GuideHeroProps = {
  hero: GuideCopy["hero"];
};

function GuideSunMark() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className="h-full w-full">
      <g transform="translate(200,200)">
        <line x1="0" y1="-190" x2="0" y2="190" stroke="currentColor" />
        <line x1="-190" y1="0" x2="190" y2="0" stroke="currentColor" />
        <line x1="-134" y1="-134" x2="134" y2="134" stroke="currentColor" />
        <line x1="134" y1="-134" x2="-134" y2="134" stroke="currentColor" />
        <line x1="-72" y1="-178" x2="72" y2="178" stroke="currentColor" opacity="0.7" />
        <line x1="178" y1="-72" x2="-178" y2="72" stroke="currentColor" opacity="0.7" />
        <line x1="72" y1="-178" x2="-72" y2="178" stroke="currentColor" opacity="0.7" />
        <line x1="-178" y1="-72" x2="178" y2="72" stroke="currentColor" opacity="0.7" />
        <circle r="60" fill="currentColor" opacity="0.16" />
        <circle r="120" fill="none" stroke="currentColor" opacity="0.2" />
        <circle r="180" fill="none" stroke="currentColor" opacity="0.1" />
      </g>
    </svg>
  );
}

export function GuideHero({ hero }: GuideHeroProps) {
  return (
    <section
      data-section-tone="light"
      className="relative isolate overflow-hidden bg-[var(--sc-white)] px-5 pb-14 pt-28 text-center text-[var(--sc-black)] sm:px-8 sm:pb-16 sm:pt-32 lg:px-12 lg:pb-20 lg:pt-36"
    >
      <div className="absolute left-1/2 top-1/2 -z-10 h-[min(82vw,540px)] w-[min(82vw,540px)] -translate-x-1/2 -translate-y-1/2 text-[var(--sc-sun)] opacity-[0.07]">
        <GuideSunMark />
      </div>

      <div className="mx-auto max-w-[920px]">
        <div className="inline-flex items-center gap-3 rounded-full border border-[rgba(254,202,22,0.28)] bg-[var(--sc-sun-3)] px-5 py-2 text-[0.62rem] uppercase tracking-[0.28em]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--sc-sun)]" />
          <span>{hero.badge}</span>
        </div>

        <h1 className="sc-serif mt-7 text-balance text-[clamp(2.65rem,6vw,5.25rem)] leading-[1.05]">
          {hero.title}
          <br />
          <em className="font-normal not-italic">{hero.emphasis}</em>
        </h1>

        <p className="mx-auto mt-6 max-w-[640px] text-pretty text-[0.98rem] leading-8 text-[var(--sc-text-mid)] sm:text-[1.04rem]">
          {hero.intro}
        </p>

        <nav
          aria-label="Guide sections"
          className="mx-auto mt-9 flex max-w-[760px] flex-wrap justify-center gap-2"
        >
          {hero.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-10 items-center justify-center border border-[var(--sc-grey)] px-4 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-[var(--sc-text-mid)] no-underline transition hover:border-[var(--sc-sun)] hover:bg-[var(--sc-sun-3)] hover:text-[var(--sc-black)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
