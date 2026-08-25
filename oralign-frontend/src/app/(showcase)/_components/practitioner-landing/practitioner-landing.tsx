"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLocalizedHref, useShowcaseLang } from "../../_lib/i18n/lang-context";
import { SectionHeading } from "../shared/section-heading";
import { Reveal } from "../shared/reveal";
import { finalCta, hero, platform, why, workflow } from "./copy";

/**
 * B2B landing for dentists / orthodontists (/praticiens, /en/for-dentists,
 * /ar/for-dentists). One self-contained client section per block, same
 * pattern as the patient pages: copy resolved live via useShowcaseLang().
 */
export function PractitionerLanding() {
  return (
    <>
      <ProHeroSection />
      <WorkflowSection />
      <WhySection />
      <PlatformSection />
      <JoinCtaSection />
    </>
  );
}

function ProHeroSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="praticiens-hero"
      data-section-tone="dark"
      aria-labelledby="praticiens-title"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
    >
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-10 sm:py-24 lg:px-12 lg:py-28">
        <div className="max-w-[760px]">
          <p
            className="text-[var(--sc-sun)]"
            style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase" }}
          >
            {hero.eyebrow[lang]}
          </p>
          <h1
            id="praticiens-title"
            className="sc-serif mt-4 leading-[1.08] text-[var(--sc-white)]"
            style={{ fontSize: "clamp(2.2rem, 4.5vw, 4rem)", fontWeight: 300 }}
          >
            {hero.title[lang]}
          </h1>
          <p className="mt-6 max-w-[640px] text-pretty text-[clamp(1rem,1.4vw,1.18rem)] leading-[1.8] text-[rgba(242,245,239,0.88)]">
            {hero.intro[lang]}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="group inline-flex min-h-13 items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-3.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[#f9d96a]"
            >
              {hero.ctaJoin[lang]}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
              />
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-13 items-center justify-center border border-[rgba(242,245,239,0.35)] px-6 py-3.5 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-[var(--sc-white)] no-underline transition-colors hover:border-[var(--sc-sun)] hover:text-[var(--sc-sun)]"
            >
              {hero.ctaLogin[lang]}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="workflow"
      data-section-tone="light"
      aria-labelledby="workflow-title"
      className="bg-[var(--sc-white)] text-[var(--sc-black)]"
    >
      <div className="mx-auto max-w-[1400px] px-5 py-18 sm:px-10 sm:py-20 lg:px-12 lg:py-24">
        <Reveal>
          <SectionHeading eyebrow={workflow.eyebrow[lang]} id="workflow-title">
            {workflow.title[lang]}
          </SectionHeading>
        </Reveal>
        <ol className="mt-12 grid list-none gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {workflow.steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.title.fr} delay={i % 2 === 1}>
                <li className="flex h-full flex-col border-t border-[var(--sc-grey)] pt-6">
                  <div className="flex items-center justify-between">
                    <Icon aria-hidden="true" className="size-6 text-[var(--sc-black)]" strokeWidth={1.5} />
                    <span
                      className="sc-serif text-[var(--sc-sun)]"
                      style={{ fontSize: "1.6rem", fontWeight: 300 }}
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[1.02rem] font-medium">{step.title[lang]}</h3>
                  <p className="mt-2 text-[0.88rem] leading-[1.75] text-[var(--sc-text-mid)]">
                    {step.desc[lang]}
                  </p>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function WhySection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="pourquoi-oralign"
      data-section-tone="light"
      aria-labelledby="pourquoi-title"
      className="bg-[rgba(25,25,25,0.025)] text-[var(--sc-black)]"
    >
      <div className="mx-auto max-w-[1400px] px-5 py-18 sm:px-10 sm:py-20 lg:px-12 lg:py-24">
        <Reveal>
          <SectionHeading eyebrow={why.eyebrow[lang]} id="pourquoi-title">
            {why.title[lang]}
          </SectionHeading>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {why.items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title.fr} delay={i % 2 === 1}>
                <article className="h-full bg-[var(--sc-white)] p-6 shadow-[0_1px_14px_rgba(10,10,10,0.05)]">
                  <Icon aria-hidden="true" className="size-6 text-[var(--sc-sun)]" strokeWidth={1.5} />
                  <h3 className="mt-4 text-[1.02rem] font-medium">{item.title[lang]}</h3>
                  <p className="mt-2 text-[0.88rem] leading-[1.75] text-[var(--sc-text-mid)]">
                    {item.desc[lang]}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PlatformSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="plateforme"
      data-section-tone="dark"
      aria-labelledby="plateforme-title"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
    >
      <div className="mx-auto max-w-[1400px] px-5 py-18 sm:px-10 sm:py-20 lg:px-12 lg:py-24">
        <Reveal>
          <SectionHeading eyebrow={platform.eyebrow[lang]} tone="dark" id="plateforme-title">
            {platform.title[lang]}
          </SectionHeading>
        </Reveal>
        <p className="mt-6 max-w-[560px] text-[0.98rem] leading-[1.8] text-[rgba(242,245,239,0.75)]">
          {platform.intro[lang]}
        </p>
        <ul className="mt-10 grid list-none gap-5 lg:grid-cols-3">
          {platform.items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.text.fr} delay={i % 2 === 1}>
                <li className="flex items-start gap-4 border-t border-[rgba(242,245,239,0.14)] pt-5">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--sc-sun)]" strokeWidth={1.5} />
                  <span className="text-[0.92rem] leading-[1.7] text-[rgba(242,245,239,0.88)]">
                    {item.text[lang]}
                  </span>
                </li>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function JoinCtaSection() {
  const { lang } = useShowcaseLang();
  const l = useLocalizedHref();
  return (
    <section
      id="devenir-partenaire"
      data-section-tone="light"
      aria-labelledby="devenir-partenaire-title"
      className="bg-[var(--sc-white)] text-[var(--sc-black)]"
    >
      <div className="mx-auto max-w-[1400px] px-5 py-18 text-center sm:px-10 sm:py-20 lg:px-12 lg:py-24">
        <Reveal>
          <h2
            id="devenir-partenaire-title"
            className="sc-serif mx-auto max-w-[720px] leading-[1.12]"
            style={{ fontSize: "clamp(1.8rem, 3.2vw, 3rem)", fontWeight: 300 }}
          >
            {finalCta.title[lang]}
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-[0.95rem] leading-[1.8] text-[var(--sc-text-mid)]">
            {finalCta.desc[lang]}
          </p>
          <div className="mt-9 flex flex-col items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex min-h-13 items-center justify-center bg-[var(--sc-black)] px-8 py-3.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--sc-white)] no-underline transition-colors hover:bg-[#1c1c1c]"
            >
              {finalCta.cta[lang]}
            </Link>
            <Link
              href={l("/contact")}
              className="text-[0.85rem] text-[var(--sc-text-mid)] underline underline-offset-4 transition-colors hover:text-[var(--sc-black)]"
            >
              {finalCta.contact[lang]}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
