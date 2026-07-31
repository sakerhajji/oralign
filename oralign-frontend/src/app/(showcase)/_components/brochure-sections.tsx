"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Lang } from "../_lib/i18n/dict";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { ImagePlaceholder } from "./shared/image-placeholder";
import { brochureCopy } from "./brochure-copy";

export function AdultBrochureSection() {
  const { lang } = useShowcaseLang();

  return (
    <BrochureSection
      id="adults"
      lang={lang}
      copy={brochureCopy.adult}
      imageSrc="/showcase/womenBornToshine1.jpeg"
      imageTone="light"
    />
  );
}

export function ParentBrochureSection() {
  const { lang } = useShowcaseLang();
  const copy = brochureCopy.parent;

  return (
    <section
      id="parents"
      data-section-tone="dark"
      aria-labelledby="parents-h2"
      className="relative isolate overflow-hidden bg-[var(--sc-black)] px-4 py-16 text-[var(--sc-white)] sm:px-8 sm:py-24 lg:px-16 lg:py-32"
    >
      <div className="mx-auto max-w-[1400px]">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:items-end">
            <div className="min-w-0">
              <div className="mb-8 w-fit border border-[rgba(242,245,239,0.18)] bg-[#101010] px-5 py-4 shadow-[0_18px_60px_-42px_rgba(254,202,22,0.9)] sm:px-6">
                <Image
                  src="/showcase/oralingPrime.svg"
                  alt="ORALIGN Prime"
                  width={300}
                  height={82}
                  className="h-auto w-[210px] sm:w-[260px]"
                />
              </div>

              <div
                className="flex items-center gap-3"
                style={{
                  fontSize: "0.55rem",
                  letterSpacing: "0.42em",
                  textTransform: "uppercase",
                  color: "var(--sc-sun)",
                }}
              >
                <span className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun)]" aria-hidden="true" />
                <span>{copy.eyebrow[lang]}</span>
              </div>

              <h2
                id="parents-h2"
                className="sc-serif mt-4 max-w-4xl text-[clamp(2rem,8vw,3.7rem)] font-normal leading-[1.05] sm:text-[clamp(2.5rem,5vw,4.6rem)]"
              >
                {copy.titleA[lang]}{" "}
                <em className="text-[var(--sc-sun)]" style={{ fontStyle: "italic" }}>
                  {copy.titleB[lang]}
                </em>
              </h2>

              <p className="mt-7 max-w-2xl text-[0.95rem] leading-8 text-[var(--sc-text-mid-on-dark)] sm:text-[1rem]">
                {copy.intro[lang]}
              </p>
            </div>

            <div className="border-l-2 border-[var(--sc-sun)] pl-5 sm:pl-7 lg:mb-2">
              <p className="sc-serif text-[1.35rem] leading-snug text-[var(--sc-white)] sm:text-[1.7rem]">
                {copy.proof[lang]}
              </p>
              <div className="mt-7 flex flex-wrap gap-2.5">
                {copy.benefits.map((benefit) => (
                  <span
                    key={benefit.fr}
                    className="border border-[rgba(242,245,239,0.2)] px-3 py-2 text-[0.56rem] font-semibold uppercase tracking-[0.22em] text-[var(--sc-text-mid-on-dark)]"
                  >
                    {benefit[lang]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-stretch">
          <Reveal>
            <figure className="relative h-full overflow-hidden border border-[rgba(242,245,239,0.16)] bg-[#101010]">
              <div className="relative aspect-[4/5] min-h-[420px] sm:aspect-[5/4] lg:aspect-auto lg:h-full lg:min-h-[640px]">
                <Image
                  src="/showcase/kidsgirls.jpeg"
                  alt={copy.imageLabel[lang]}
                  fill
                  quality={85}
                  sizes="(min-width: 1280px) 520px, (min-width: 1024px) 46vw, 100vw"
                  className="object-cover object-center"
                  priority={false}
                />
                <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(25,25,25,0.04)_0%,rgba(25,25,25,0.28)_72%,rgba(25,25,25,0.78)_100%)]" aria-hidden="true" />
              </div>

              <figcaption className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                <div className="max-w-sm border border-[rgba(242,245,239,0.2)] bg-[rgba(25,25,25,0.78)] p-4 backdrop-blur-md sm:p-5">
                  <p className="text-[0.56rem] font-bold uppercase tracking-[0.28em] text-[var(--sc-sun)]">
                    ORALIGN Prime
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[rgba(242,245,239,0.78)]">
                    {dict.brand.madeWhere[lang]}
                  </p>
                </div>
              </figcaption>
            </figure>
          </Reveal>

          <Reveal delay>
            <div className="grid gap-px bg-[rgba(242,245,239,0.14)] sm:grid-cols-2">
              {copy.steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.title.fr}
                    className="group relative min-h-[230px] bg-[var(--sc-black)] p-6 transition-colors hover:bg-[#202020] sm:p-8"
                  >
                    <div className="flex items-start justify-between gap-5">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-[rgba(254,202,22,0.13)] text-[var(--sc-sun)] transition-colors group-hover:bg-[var(--sc-sun)] group-hover:text-[var(--sc-black)]">
                        <Icon size={21} strokeWidth={1.55} />
                      </span>
                      <span className="sc-serif text-[2.2rem] leading-none text-[rgba(242,245,239,0.11)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="sc-serif mt-7 text-[1.18rem] font-medium leading-tight text-[var(--sc-white)]">
                      {step.title[lang]}
                    </h3>
                    <p className="mt-4 text-sm leading-7 text-[var(--sc-text-mid-on-dark)]">
                      {step.body[lang]}
                    </p>
                  </article>
                );
              })}
            </div>
          </Reveal>
        </div>

        <Reveal delay>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href="#cta"
              className="sc-serif inline-flex min-h-14 w-full items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-4 text-center text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] sm:w-auto sm:tracking-[0.22em]"
            >
              <span>{copy.cta[lang]}</span>
              <ArrowRight size={15} />
            </Link>
            <p className="max-w-lg text-xs leading-6 text-[var(--sc-text-mid-on-dark)]">
              {copy.consultationNote[lang]}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BrochureSection({
  id,
  lang,
  copy,
  imageSrc,
  imageTone,
  dark,
}: {
  id: string;
  lang: Lang;
  copy: typeof brochureCopy.adult | typeof brochureCopy.parent;
  imageSrc: string;
  imageTone: "light" | "dark";
  dark?: boolean;
}) {
  const bg = dark ? "bg-[var(--sc-black)] text-[var(--sc-white)]" : "bg-[var(--sc-white)] text-[var(--sc-black)]";
  const bodyColor = dark ? "var(--sc-text-mid-on-dark)" : "var(--sc-text-mid)";
  const cardBg = dark ? "bg-[var(--sc-black)]" : "bg-[var(--sc-white)]";
  const gridLine = dark ? "#303030" : "var(--sc-grey)";

  return (
    <section
      id={id}
      data-section-tone={dark ? "dark" : "light"}
      aria-labelledby={`${id}-h2`}
      className={bg}
      style={{ padding: "110px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div>
              <div
                className="flex items-center gap-3"
                style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}
              >
                <span className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun)]" aria-hidden="true" />
                <span>{copy.eyebrow[lang]}</span>
              </div>
              <h2
                id={`${id}-h2`}
                className="sc-serif mt-3.5"
                style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 400, lineHeight: 1.1 }}
              >
                {copy.titleA[lang]}{" "}
                <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{copy.titleB[lang]}</em>
              </h2>
            </div>
            <div>
              <p className="max-w-2xl text-sm leading-8" style={{ color: bodyColor }}>
                {copy.intro[lang]}
              </p>
              <p
                className="mt-5 border-l-2 border-[var(--sc-sun)] pl-5 text-[0.95rem] leading-7"
                style={{ color: dark ? "var(--sc-white)" : "var(--sc-black)", fontWeight: 400 }}
              >
                {copy.proof[lang]}
              </p>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[420px_1fr] xl:grid-cols-[480px_1fr]">
          <Reveal>
            <figure className={`overflow-hidden border ${dark ? "border-[#303030]" : "border-[var(--sc-grey)]"}`}>
              <ImagePlaceholder
                src={imageSrc}
                label={copy.imageLabel[lang]}
                aspect="portrait"
                tone={imageTone}
                className="border-0"
              />
              <figcaption
                className={`flex flex-wrap gap-2 p-4 ${dark ? "bg-[#101010]" : "bg-[var(--sc-white)]"}`}
              >
                {copy.benefits.map((benefit) => (
                  <span
                    key={benefit.fr}
                    className="border px-3 py-1.5 text-[0.56rem] font-medium uppercase tracking-[0.24em]"
                    style={{
                      borderColor: dark ? "rgba(242,245,239,0.18)" : "var(--sc-grey)",
                      color: dark ? "var(--sc-text-mid-on-dark)" : "var(--sc-text-mid)",
                    }}
                  >
                    {benefit[lang]}
                  </span>
                ))}
              </figcaption>
            </figure>
          </Reveal>

          <Reveal delay>
            <div className="grid gap-px sm:grid-cols-2" style={{ background: gridLine }}>
              {copy.steps.map((step) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.title.fr}
                    className={`${cardBg} p-6 sm:p-8`}
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center"
                      style={{
                        background: dark ? "rgba(254,202,22,0.14)" : "var(--sc-black)",
                        color: "var(--sc-sun)",
                      }}
                    >
                      <Icon size={20} strokeWidth={1.45} />
                    </div>
                    <h3 className="sc-serif mt-6 text-[1.05rem] font-medium leading-tight">
                      {step.title[lang]}
                    </h3>
                    <p className="mt-3 text-sm leading-7" style={{ color: bodyColor }}>
                      {step.body[lang]}
                    </p>
                  </article>
                );
              })}
            </div>
          </Reveal>
        </div>

        <Reveal delay>
          <div className="mt-9">
            <Link
              href="#cta"
              className="sc-serif inline-flex w-full max-w-[360px] items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-4 text-center text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] sm:w-auto sm:max-w-none sm:tracking-[0.22em]"
            >
              <span>{copy.cta[lang]}</span>
              <ArrowRight size={15} />
            </Link>
            <span className="mt-4 block text-xs leading-6" style={{ color: bodyColor }}>
              {dict.brand.madeWhere[lang]}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
