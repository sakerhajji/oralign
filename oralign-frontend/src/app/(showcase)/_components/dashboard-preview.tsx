"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { showcaseCases } from "../_lib/case-gallery";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

const copy = {
  eyebrow: {
    fr: "Avant / après",
    en: "Before / after",
    ar: "قبل / بعد",
  },
  titleA: {
    fr: "Des cas réels,",
    en: "Real cases,",
    ar: "حالات حقيقية،",
  },
  titleB: {
    fr: "expliqués simplement.",
    en: "explained simply.",
    ar: "بشرح بسيط.",
  },
  intro: {
    fr: "Chaque sourire est différent. Ces exemples montrent des situations courantes traitées par aligneurs transparents, toujours après examen et validation du praticien.",
    en: "Every smile is different. These examples show common situations treated with clear aligners, always after assessment and validation by a practitioner.",
    ar: "كل ابتسامة مختلفة. هذه أمثلة لحالات شائعة عولجت بالأجهزة الشفافة بعد تقييم وموافقة الطبيب.",
  },
  before: { fr: "Avant", en: "Before", ar: "قبل" },
  after: { fr: "Après", en: "After", ar: "بعد" },
  concern: { fr: "Ce que le patient voit", en: "What the patient notices", ar: "ما يلاحظه المريض" },
  plan: { fr: "Objectif du traitement", en: "Treatment goal", ar: "هدف العلاج" },
  disclaimer: {
    fr: "Images cliniques à titre illustratif. Les résultats varient selon l'indication, l'âge, le port régulier des aligneurs et le suivi du praticien.",
    en: "Clinical images for illustration. Results vary depending on indication, age, regular aligner wear and practitioner follow-up.",
    ar: "الصور السريرية للتوضيح. تختلف النتائج حسب الحالة والعمر والالتزام بارتداء الأجهزة ومتابعة الطبيب.",
  },
} satisfies Record<string, Record<Lang, string>>;

export function DashboardPreview() {
  const { lang } = useShowcaseLang();
  const [activeId, setActiveId] = useState(showcaseCases[0].id);
  const activeCase = useMemo(
    () => showcaseCases.find((item) => item.id === activeId) ?? showcaseCases[0],
    [activeId],
  );

  return (
    <section
      id="dashboard-preview"
      data-section-tone="light"
      aria-labelledby="preview-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <SectionHeading eyebrow={copy.eyebrow[lang]} tone="light" align="center" id="preview-h2">
              {copy.titleA[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{copy.titleB[lang]}</em>
            </SectionHeading>
            <p
              className="mx-auto mt-6"
              style={{
                color: "var(--sc-text-mid)",
                fontSize: "0.92rem",
                lineHeight: 1.85,
                maxWidth: 680,
              }}
            >
              {copy.intro[lang]}
            </p>
          </div>
        </Reveal>

        <Reveal delay>
          <div className="mt-10 grid gap-5 sm:mt-14 lg:grid-cols-[1fr_360px] lg:gap-8 xl:grid-cols-[1fr_420px]">
            <article className="relative border border-[var(--sc-grey)] bg-[var(--sc-white)] p-3 sm:p-6">
              <span aria-hidden="true" className="absolute -left-px -top-px h-14 w-14 border-l-2 border-t-2 border-[var(--sc-sun)]" />
              <span aria-hidden="true" className="absolute -bottom-px -right-px h-14 w-14 border-b-2 border-r-2 border-[var(--sc-sun)]" />

              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p
                    style={{
                      color: "var(--sc-sun)",
                      fontSize: "0.56rem",
                      fontWeight: 500,
                      letterSpacing: "0.32em",
                      textTransform: "uppercase",
                    }}
                  >
                    {activeCase.badge[lang]}
                  </p>
                  <h3 className="sc-serif mt-2 text-[1.45rem] font-normal text-[var(--sc-black)]">
                    {activeCase.title[lang]}
                  </h3>
                </div>
              </div>

              <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                <CaseImage label={copy.before[lang]} src={activeCase.before} alt={`${activeCase.title[lang]} ${copy.before[lang]}`} />
                <CaseImage label={copy.after[lang]} src={activeCase.after} alt={`${activeCase.title[lang]} ${copy.after[lang]}`} accent />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="border-l-2 border-[var(--sc-sun)] pl-4">
                  <p className="text-[0.56rem] font-medium uppercase tracking-[0.28em] text-[var(--sc-text-mid)]">
                    {copy.concern[lang]}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--sc-black)]">{activeCase.concern[lang]}</p>
                </div>
                <div className="border-l-2 border-[var(--sc-black)] pl-4">
                  <p className="text-[0.56rem] font-medium uppercase tracking-[0.28em] text-[var(--sc-text-mid)]">
                    {copy.plan[lang]}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--sc-black)]">{activeCase.explanation[lang]}</p>
                </div>
              </div>
            </article>

            <aside className="order-first -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:order-none lg:grid lg:gap-2 lg:self-start lg:overflow-visible lg:pb-0" aria-label="Case selector">
              {showcaseCases.map((item, index) => {
                const selected = item.id === activeCase.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveId(item.id)}
                    aria-pressed={selected}
                    className={[
                      "group grid min-w-[224px] grid-cols-[64px_1fr] gap-3 border p-3 text-left transition-colors lg:min-w-0 lg:grid-cols-[82px_1fr] lg:gap-4",
                      selected
                        ? "border-[var(--sc-black)] bg-[var(--sc-black)] text-[var(--sc-white)]"
                        : "border-[var(--sc-grey)] bg-[var(--sc-white)] hover:border-[var(--sc-black)]",
                    ].join(" ")}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden bg-[var(--sc-grey)]">
                      <Image
                        src={item.after}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 82px, 64px"
                        className="object-cover"
                      />
                    </span>
                    <span>
                      <span
                        className={selected ? "text-[var(--sc-sun)]" : "text-[var(--sc-text-mid)]"}
                        style={{ fontSize: "0.5rem", letterSpacing: "0.28em", textTransform: "uppercase" }}
                      >
                        {String(index + 1).padStart(2, "0")} · {item.badge[lang]}
                      </span>
                      <span className="mt-1 block text-sm font-medium leading-6">
                        {item.shortTitle[lang]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </aside>
          </div>
        </Reveal>

        <Reveal delay>
          <p className="mx-auto mt-10 max-w-3xl text-center text-xs leading-6 text-[var(--sc-text-mid)]">
            {copy.disclaimer[lang]}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function CaseImage({
  label,
  src,
  alt,
  accent,
}: {
  label: string;
  src: string;
  alt: string;
  accent?: boolean;
}) {
  return (
    <figure className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-grey)]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 480px, (min-width: 768px) 50vw, 100vw"
          className="object-contain"
        />
      </div>
      <figcaption
        className="self-start px-3 py-1.5"
        style={{
          background: accent ? "var(--sc-sun)" : "var(--sc-black)",
          color: accent ? "var(--sc-black)" : "var(--sc-white)",
          fontSize: "0.52rem",
          fontWeight: 500,
          letterSpacing: "0.34em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </figcaption>
    </figure>
  );
}
