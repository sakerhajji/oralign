"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, ChevronsLeftRight, Images, Sparkles } from "lucide-react";
import { useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { showcaseCases } from "../_lib/case-gallery";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

const copy = {
  eyebrow: { fr: "Avant / après", en: "Before / after", ar: "قبل / بعد" },
  titleA: { fr: "Des cas réels,", en: "Real cases,", ar: "حالات حقيقية،" },
  titleB: { fr: "expliqués simplement.", en: "explained simply.", ar: "بشرح بسيط." },
  intro: {
    fr: "Chaque sourire est différent. Ces exemples montrent des situations courantes traitées par aligneurs transparents, toujours après examen et validation du praticien.",
    en: "Every smile is different. These examples show common situations treated with clear aligners, always after assessment and validation by a practitioner.",
    ar: "كل ابتسامة مختلفة. هذه أمثلة لحالات شائعة عولجت بالأجهزة الشفافة بعد تقييم وموافقة الطبيب.",
  },
  before: { fr: "Avant", en: "Before", ar: "قبل" },
  after: { fr: "Après", en: "After", ar: "بعد" },
  compare: { fr: "Glissez pour comparer", en: "Drag to compare", ar: "اسحب للمقارنة" },
  gallery: { fr: "Choisir un cas", en: "Choose a case", ar: "اختر حالة" },
  concern: { fr: "Ce que le patient voit", en: "What the patient notices", ar: "ما يلاحظه المريض" },
  plan: { fr: "Objectif du traitement", en: "Treatment goal", ar: "هدف العلاج" },
  previous: { fr: "Précédent", en: "Previous", ar: "السابق" },
  next: { fr: "Suivant", en: "Next", ar: "التالي" },
  caseLabel: { fr: "Cas", en: "Case", ar: "حالة" },
  disclaimer: {
    fr: "Images cliniques à titre illustratif. Les résultats varient selon l'indication, l'âge, le port régulier des aligneurs et le suivi du praticien.",
    en: "Clinical images for illustration. Results vary depending on indication, age, regular aligner wear and practitioner follow-up.",
    ar: "الصور السريرية للتوضيح. تختلف النتائج حسب الحالة والعمر والالتزام بارتداء الأجهزة ومتابعة الطبيب.",
  },
} satisfies Record<string, Record<Lang, string>>;

export function DashboardPreview({
  id = "dashboard-preview",
  headingAs = "h2",
}: {
  id?: string;
  /** "h1" when this is the first section of a page (one H1 per page). */
  headingAs?: "h1" | "h2";
}) {
  const { lang } = useShowcaseLang();
  const [activeIndex, setActiveIndex] = useState(0);

  const activeCase = useMemo(
    () => showcaseCases[activeIndex] ?? showcaseCases[0],
    [activeIndex],
  );

  const total = showcaseCases.length;
  const activeNumber = String(activeIndex + 1).padStart(2, "0");

  const goToPrevious = () => {
    setActiveIndex((current) => (current === 0 ? total - 1 : current - 1));
  };

  const goToNext = () => {
    setActiveIndex((current) => (current === total - 1 ? 0 : current + 1));
  };

  return (
    <section
      id={id}
      data-section-tone="light"
      aria-labelledby="preview-h2"
      className="relative isolate overflow-hidden bg-[var(--sc-white)] px-4 py-16 sm:px-8 sm:py-24 lg:px-16 lg:py-32"
    >
      <div className="relative z-10 mx-auto max-w-[1440px]">
        <Reveal>
          <div className="max-w-3xl">
            <SectionHeading eyebrow={copy.eyebrow[lang]} tone="light" align="start" id="preview-h2" as={headingAs}>
              {copy.titleA[lang]}{" "}
              <em className="text-[var(--sc-sun)]" style={{ fontStyle: "italic" }}>
                {copy.titleB[lang]}
              </em>
            </SectionHeading>
            <p className="mt-5 max-w-2xl text-[0.92rem] leading-8 text-[var(--sc-text-mid)] sm:text-[0.98rem]">
              {copy.intro[lang]}
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid min-w-0 gap-5 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-8 xl:gap-10">
          <Reveal delay className="min-w-0">
            <div className="min-w-0 space-y-3 lg:order-1">
              <div className="min-w-0 sm:hidden">
                <MobileComparison
                  beforeImage={activeCase.before}
                  afterImage={activeCase.after}
                  title={activeCase.title[lang]}
                  beforeLabel={copy.before[lang]}
                  afterLabel={copy.after[lang]}
                  compareLabel={copy.compare[lang]}
                />
              </div>

              <div className="hidden min-w-0 grid-cols-2 gap-4 sm:grid">
                <CaseImagePanel
                  label={copy.before[lang]}
                  src={activeCase.before}
                  alt={`${activeCase.title[lang]} ${copy.before[lang]}`}
                  tone="dark"
                />
                <CaseImagePanel
                  label={copy.after[lang]}
                  src={activeCase.after}
                  alt={`${activeCase.title[lang]} ${copy.after[lang]}`}
                  tone="sun"
                />
              </div>

              <CaseRail
                lang={lang}
                activeIndex={activeIndex}
                onSelect={setActiveIndex}
                label={copy.gallery[lang]}
              />
            </div>
          </Reveal>

          <Reveal delay className="min-w-0">
            <aside className="min-w-0 lg:order-2 lg:sticky lg:top-28">
              <div className="border border-[var(--sc-grey)] bg-[var(--sc-white)] p-4 shadow-[0_18px_50px_-38px_rgba(25,25,25,0.45)] sm:p-6">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--sc-grey)] pb-4">
                  <span className="inline-flex items-center gap-2 bg-[var(--sc-black)] px-3 py-2 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)]">
                    <Images size={14} strokeWidth={1.7} aria-hidden="true" />
                    {copy.caseLabel[lang]} {activeNumber}/{String(total).padStart(2, "0")}
                  </span>
                  <span className="inline-flex items-center gap-2 bg-[var(--sc-sun)] px-3 py-2 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-black)]">
                    <Sparkles size={14} strokeWidth={1.7} aria-hidden="true" />
                    {activeCase.badge[lang]}
                  </span>
                </div>

                <h3 className="sc-serif mt-5 text-[1.55rem] leading-tight text-[var(--sc-black)] sm:text-[1.85rem]">
                  {activeCase.title[lang]}
                </h3>

                <div className="mt-5 grid gap-3">
                  <CaseNote number="01" title={copy.concern[lang]} text={activeCase.concern[lang]} />
                  <CaseNote number="02" title={copy.plan[lang]} text={activeCase.explanation[lang]} accent />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <SliderButton label={copy.previous[lang]} onClick={goToPrevious}>
                    <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
                    <span>{copy.previous[lang]}</span>
                  </SliderButton>
                  <SliderButton label={copy.next[lang]} onClick={goToNext}>
                    <span>{copy.next[lang]}</span>
                    <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
                  </SliderButton>
                </div>

                <ProgressDots activeIndex={activeIndex} onSelect={setActiveIndex} />
              </div>
            </aside>
          </Reveal>
        </div>

        <Reveal delay>
          <p className="mt-8 border-t border-[var(--sc-grey)] pt-5 text-[0.68rem] uppercase tracking-[0.16em] leading-6 text-[var(--sc-text-mid)] sm:mt-10">
            {copy.disclaimer[lang]}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function CaseImagePanel({
  label,
  src,
  alt,
  tone,
}: {
  label: string;
  src: string;
  alt: string;
  tone: "dark" | "sun";
}) {
  const isSun = tone === "sun";

  return (
    <figure className="group relative overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-white)]">
      <div className="relative aspect-[4/3] min-h-[300px] w-full bg-[#f7f7f2] sm:min-h-[340px] lg:min-h-[420px]">
        <Image
          src={src}
          alt={alt}
          fill
          quality={85}
          sizes="(min-width: 1024px) 34vw, 45vw"
          className="object-contain p-4 transition-transform duration-500 ease-out group-hover:scale-[1.015]"
        />
      </div>
      <figcaption
        className={[
          "absolute left-0 top-0 z-20 px-3.5 py-2 text-[0.58rem] font-bold uppercase tracking-[0.18em]",
          isSun ? "bg-[var(--sc-sun)] text-[var(--sc-black)]" : "bg-[var(--sc-black)] text-[var(--sc-white)]",
        ].join(" ")}
      >
        {label}
      </figcaption>
    </figure>
  );
}

function MobileComparison({
  beforeImage,
  afterImage,
  title,
  beforeLabel,
  afterLabel,
  compareLabel,
}: {
  beforeImage: string;
  afterImage: string;
  title: string;
  beforeLabel: string;
  afterLabel: string;
  compareLabel: string;
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const x = clientX - rect.left;
    setSliderPosition(Math.max(8, Math.min(92, (x / rect.width) * 100)));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    updatePosition(event.clientX, event.currentTarget);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updatePosition(event.clientX, event.currentTarget);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  return (
    <figure className="w-full max-w-full overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-white)] shadow-[0_18px_50px_-38px_rgba(25,25,25,0.45)]">
      <div
        className="relative aspect-[1/1] min-h-[300px] w-full max-w-full touch-none select-none overflow-hidden bg-[#f7f7f2]"
        role="group"
        aria-label={compareLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="absolute inset-0">
          <Image
            src={afterImage}
            alt={`${title} - ${afterLabel}`}
            fill
            quality={85}
            sizes="100vw"
            className="object-contain p-3"
          />
          <span className="absolute right-0 top-0 z-20 bg-[var(--sc-sun)] px-3 py-2 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-black)]">
            {afterLabel}
          </span>
        </div>

        <div
          className="absolute inset-0 z-10 overflow-hidden bg-[#f7f7f2]"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <Image
            src={beforeImage}
            alt={`${title} - ${beforeLabel}`}
            fill
            quality={85}
            sizes="100vw"
            className="object-contain p-3"
          />
          <span className="absolute left-0 top-0 z-20 bg-[var(--sc-black)] px-3 py-2 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)]">
            {beforeLabel}
          </span>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-[var(--sc-white)] shadow-[0_0_0_1px_rgba(25,25,25,0.18)]"
          style={{ left: `${sliderPosition}%` }}
        >
          <div
            className={[
              "absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-[var(--sc-white)] bg-[var(--sc-black)] text-[var(--sc-sun)] shadow-xl transition-transform",
              isDragging ? "scale-110" : "scale-100",
            ].join(" ")}
          >
            <ChevronsLeftRight size={22} strokeWidth={1.8} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex items-center justify-center bg-[rgba(25,25,25,0.82)] px-3 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-white)] backdrop-blur-sm">
          <ChevronsLeftRight className="mr-2 shrink-0 text-[var(--sc-sun)]" size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>{compareLabel}</span>
        </div>
      </div>
    </figure>
  );
}

function CaseRail({
  lang,
  activeIndex,
  onSelect,
  label,
}: {
  lang: Lang;
  activeIndex: number;
  onSelect: (index: number) => void;
  label: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-white)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--sc-grey)] px-3 py-2.5">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.2em] text-[var(--sc-text-mid)]">{label}</p>
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-sun-deep)]">
          {String(activeIndex + 1).padStart(2, "0")} / {String(showcaseCases.length).padStart(2, "0")}
        </p>
      </div>
      <div className="flex max-w-full snap-x gap-2 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {showcaseCases.map((item, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(index)}
              aria-pressed={selected}
              className={[
                "flex min-w-[184px] snap-start items-center gap-2 border px-2 py-2 text-left transition-colors sm:min-w-[176px]",
                selected
                  ? "border-[var(--sc-black)] bg-[var(--sc-black)] text-[var(--sc-white)]"
                  : "border-[var(--sc-grey)] bg-[#f7f7f2] text-[var(--sc-black)] hover:border-[var(--sc-black)]",
              ].join(" ")}
            >
              <span className="relative block h-10 w-12 shrink-0 overflow-hidden bg-[var(--sc-grey)]">
                <Image
                  src={item.after}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </span>
              <span className="min-w-0">
                <span className={selected ? "block text-[0.5rem] uppercase tracking-[0.18em] text-[var(--sc-sun)]" : "block text-[0.5rem] uppercase tracking-[0.18em] text-[var(--sc-text-mid)]"}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="block truncate text-[0.66rem] font-bold uppercase tracking-[0.04em]">
                  {item.shortTitle[lang]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CaseNote({ number, title, text, accent }: { number: string; title: string; text: string; accent?: boolean }) {
  return (
    <div className="relative border-l-2 border-[var(--sc-black)] bg-[#f7f7f2] p-4">
      <span
        aria-hidden="true"
        className={[
          "absolute bottom-1 right-3 select-none font-mono text-3xl font-bold opacity-[0.04]",
          accent ? "text-[var(--sc-sun-deep)]" : "text-[var(--sc-black)]",
        ].join(" ")}
      >
        {number}
      </span>
      <h4 className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-text-mid)]">{title}</h4>
      <p className="mt-2 text-[0.86rem] font-medium leading-7 text-[var(--sc-black)]">{text}</p>
    </div>
  );
}

function ProgressDots({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-center gap-1.5" aria-label="Case pagination">
      {showcaseCases.map((item, index) => {
        const selected = index === activeIndex;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Show case ${index + 1}`}
            aria-current={selected ? "true" : undefined}
            className={[
              "h-1.5 transition-all duration-300",
              selected ? "w-10 bg-[var(--sc-black)]" : "w-3 bg-[var(--sc-grey)] hover:bg-[var(--sc-text-mid)]",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

function SliderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex min-h-11 items-center justify-center gap-2 bg-[var(--sc-black)] px-3 py-3 text-center text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-white)] transition-colors hover:bg-[#2a2a2a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
    >
      {children}
    </button>
  );
}
