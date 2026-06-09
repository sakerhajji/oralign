"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { practitionerCopy } from "./copy";
import { NoiseGrain } from "../shared/noise-grain";
import { Reveal } from "../shared/reveal";

/** Risk-free trial — closing CTA band on the dark tone. */
export function PractitionerCta() {
  const { lang } = useShowcaseLang();
  const copy = practitionerCopy[lang].cta;
  return (
    <section
      id="cta"
      data-section-tone="dark"
      aria-labelledby="practitioner-cta-title"
      className="
        relative isolate overflow-hidden bg-[var(--sc-black)] px-4
        py-20 text-[var(--sc-white)] sm:px-6 sm:py-24 lg:px-12
      "
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 80% 30%, rgba(254,202,22,0.08), transparent 38%), var(--sc-black)",
        }}
      />
      <NoiseGrain opacity={0.12} />

      <Reveal>
        <div className="relative z-[2] mx-auto max-w-[1240px]">
          <div className="grid items-end gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="text-start">
              <div
                className="mb-6 flex max-w-full items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em]"
                style={{ color: "var(--sc-sun)" }}
              >
                <span
                  className="h-px w-8 shrink-0 bg-[var(--sc-sun)]"
                  aria-hidden="true"
                />
                <span className="leading-none">{copy.eyebrow}</span>
              </div>
              <h2
                id="practitioner-cta-title"
                className="sc-serif max-w-3xl text-[clamp(2rem,4.5vw,4.6rem)] leading-[1.02]"
              >
                {copy.title}
              </h2>
              <p
                className="mt-6 max-w-2xl text-base leading-8"
                style={{ color: "rgba(242,245,239,0.78)" }}
              >
                {copy.text}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-end sm:gap-5 lg:flex-col lg:items-stretch">
              <Link
                href="/signup"
                className="
                  sc-serif group inline-flex min-h-14 w-full
                  items-center justify-center gap-3 px-7 py-4
                  text-center text-[0.72rem] font-bold uppercase
                  tracking-[0.17em] no-underline transition-all duration-300
                  hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(254,202,22,0.18)]
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--sc-sun)]
                  focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sc-black)]
                "
                style={{
                  background: "var(--sc-sun)",
                  color: "var(--sc-black)",
                }}
              >
                <span>{copy.primary}</span>
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.9} />
              </Link>
              <Link
                href="mailto:contact@oralign.com.tn"
                className="
                  inline-flex min-h-14 w-full items-center justify-center
                  border border-white/22 bg-transparent px-7 py-4
                  text-center text-[0.72rem] font-medium uppercase
                  tracking-[0.17em] text-[var(--sc-white)] no-underline
                  transition-all duration-300
                  hover:border-[var(--sc-sun)] hover:text-[var(--sc-sun)]
                  focus:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--sc-sun)]
                  focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sc-black)]
                "
              >
                {copy.secondary}
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
