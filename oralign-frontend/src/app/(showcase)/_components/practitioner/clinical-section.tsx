"use client";

import { Activity, ShieldCheck, Timer } from "lucide-react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { practitionerCopy } from "./copy";
import { Reveal } from "../shared/reveal";

const clinicalIcons = [ShieldCheck, Activity, Timer] as const;

/** Clinical-credibility section — biomechanics, on the dark tone. */
export function ClinicalSection() {
  const { lang } = useShowcaseLang();
  const copy = practitionerCopy[lang].clinical;
  return (
    <section
      id="clinical"
      data-section-tone="dark"
      aria-labelledby="clinical-title"
      className="bg-[var(--sc-black)] px-4 py-20 text-[var(--sc-white)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <Reveal>
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
              id="clinical-title"
              className="sc-serif mt-2 max-w-3xl text-[clamp(2rem,4vw,4.4rem)] leading-[1.04]"
            >
              {copy.title}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--sc-text-mid-on-dark)]">
              {copy.body}
            </p>
          </div>
        </Reveal>

        <div className="grid gap-4">
          {copy.points.map((point, index) => {
            const Icon = clinicalIcons[index] ?? ShieldCheck;
            return (
              <Reveal key={point.body} delay={index > 0}>
                <article className="border border-white/10 bg-white/[0.055] p-6 backdrop-blur sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center border border-[rgba(254,202,22,0.22)] bg-[rgba(254,202,22,0.10)] text-[var(--sc-sun)]">
                      <Icon aria-hidden="true" size={22} strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0">
                      {point.title ? (
                        <h3 className="sc-serif text-xl text-[var(--sc-white)]">
                          {point.title}
                        </h3>
                      ) : null}
                      <p
                        className={[
                          "text-sm leading-7 sm:text-[0.95rem]",
                          point.title ? "mt-2" : "",
                        ].join(" ")}
                        style={{ color: "rgba(242,245,239,0.78)" }}
                      >
                        {point.body}
                      </p>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
