"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { practitionerCopy } from "./copy";
import { NoiseGrain } from "../shared/noise-grain";
import { Reveal } from "../shared/reveal";

/**
 * Practitioner hero. Visual vocabulary mirrors the patient hero: amber
 * accents on Midnight Ink, eyebrow + hairline, big serif headline with an
 * italic accent in the brand sun, dual primary + ghost CTAs, film grain.
 *
 * Intentionally typography-only — the previous 3D-dashboard graphic pulled
 * the eye away from the value proposition. A stat strip carries the trust
 * signal without a heavy image.
 */
export function PractitionerHero() {
  const { lang } = useShowcaseLang();
  const copy = practitionerCopy[lang].hero;
  return (
    <section
      id="practitioner-hero"
      data-section-tone="dark"
      aria-labelledby="practitioner-hero-title"
      className="
        relative isolate min-h-[82svh] max-w-full overflow-hidden
        bg-[var(--sc-black)] text-[var(--sc-white)]
      "
    >
      {/* Premium black base — same recipe the patient Hero uses. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 18% 22%, rgba(254,202,22,0.10), transparent 38%), radial-gradient(circle at 82% 78%, rgba(254,202,22,0.055), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.035), transparent 38%), var(--sc-black)",
        }}
      />

      {/* Soft vignette. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,5,5,0.78) 0%, rgba(5,5,5,0.42) 46%, rgba(5,5,5,0.74) 100%)",
        }}
      />

      <NoiseGrain opacity={0.14} />

      {/* Bottom fade so the hero blends into the next section. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[4] h-36"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(5,5,5,0.78), var(--sc-black))",
        }}
      />

      <div
        className="
          relative z-[5] mx-auto flex min-h-[82svh] max-w-[1280px]
          flex-col justify-center px-5 py-20
          sm:px-8 sm:py-24
          lg:px-12 lg:py-28
        "
      >
        <Reveal>
          <div className="max-w-[900px]">
            {/* Eyebrow with amber hairline — patient/Hero convention. */}
            <div
              className="
                mb-6 flex max-w-full items-center gap-3
                text-[0.58rem] uppercase tracking-[0.42em]
                sm:mb-8
              "
              style={{ color: "var(--sc-sun)" }}
            >
              <span
                className="h-px w-8 shrink-0 bg-[var(--sc-sun)]"
                aria-hidden="true"
              />
              <span className="leading-none">{copy.eyebrow}</span>
            </div>

            <h1
              id="practitioner-hero-title"
              className="
                sc-serif mb-6 max-w-[980px] text-balance
                text-[clamp(2.6rem,9vw,6.4rem)] font-normal
                leading-[0.98] tracking-[-0.04em]
                text-[var(--sc-white)]
              "
            >
              <span>{copy.titleStart}</span>{" "}
              <em
                className="font-light italic"
                style={{ color: "var(--sc-sun)" }}
              >
                {copy.titleEm}
              </em>
              {copy.titleEnd ? <span> {copy.titleEnd}</span> : null}
            </h1>

            <p
              className="
                mb-10 max-w-[640px] text-pretty
                text-[0.98rem] leading-[1.9]
                sm:text-[1.06rem]
              "
              style={{ color: "rgba(242,245,239,0.78)" }}
            >
              {copy.subtitle}
            </p>

            {/* Primary + ghost CTAs — mirrors patient Hero. */}
            <div className="flex max-w-full flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-7">
              <Link
                href="/signup"
                className="
                  sc-serif group inline-flex min-h-14 w-full max-w-[360px]
                  items-center justify-center gap-3 overflow-hidden px-7 py-4
                  text-center text-[0.72rem] font-bold uppercase
                  tracking-[0.17em] no-underline transition-all duration-300
                  hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(254,202,22,0.18)]
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--sc-sun)]
                  focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sc-black)]
                  sm:w-auto
                "
                style={{
                  background: "var(--sc-sun)",
                  color: "var(--sc-black)",
                }}
              >
                <span className="relative z-10">{copy.primary}</span>
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
              </Link>

              <Link
                href="#workflow"
                className="
                  group inline-flex max-w-full items-center gap-3
                  text-[0.64rem] uppercase tracking-[0.2em]
                  no-underline transition-colors duration-300
                  hover:text-[var(--sc-sun)]
                  focus:outline-none focus-visible:text-[var(--sc-sun)]
                "
                style={{ color: "rgba(242,245,239,0.7)" }}
              >
                <span>{copy.secondary}</span>
                <span
                  className="h-px w-7 bg-current transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>

            <p
              className="mt-7 text-[0.82rem] leading-6"
              style={{ color: "rgba(242,245,239,0.58)" }}
            >
              {copy.micro}
            </p>
          </div>
        </Reveal>

        {/* Stat strip — trust signal without a heavy graphic. */}
        <Reveal delay>
          <div className="mt-14 grid gap-px border border-white/10 bg-white/[0.04] sm:mt-16 sm:grid-cols-3">
            {copy.stats.map((s) => (
              <div
                key={s.label}
                className="bg-[var(--sc-black)] px-6 py-6 sm:px-8 sm:py-7"
              >
                <p
                  className="sc-serif text-[clamp(1.7rem,3vw,2.4rem)] leading-none"
                  style={{ color: "var(--sc-sun)" }}
                >
                  {s.value}
                </p>
                <p
                  className="mt-3 text-[0.72rem] uppercase tracking-[0.2em]"
                  style={{ color: "rgba(242,245,239,0.66)" }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
