"use client";

import Link from "next/link";
import { ArrowDown, MapPin, Stethoscope } from "lucide-react";
import type { Lang } from "../../../_lib/i18n/dict";
import { useLocalizedHref, useShowcaseLang } from "../../../_lib/i18n/lang-context";
import { HeroFilm } from "./hero-film";

const heroCopy: Record<
  Lang,
  {
    eyebrow: string;
    intro: string;
    origin: string;
    practitioner: string;
    practitionerHint: string;
    practitionerSpace: string;
    practitionerSpaceHint: string;
    scroll: string;
    imageAlt: string;
    playFilm: string;
    pauseFilm: string;
  }
> = {
  fr: {
    eyebrow: "Aligneurs dentaires transparents en Tunisie — Made to Shine.",
    intro:
      "Bienvenue dans l’univers ORALIGN — la marque d’aligneurs invisibles premium qui transforme chaque sourire en une expression de confiance et de lumière.",
    origin: "Conçus en Allemagne. Fabriqués en Tunisie.",
    practitioner: "Trouver un praticien",
    practitionerHint: "près de chez moi",
    practitionerSpace: "Espace praticien",
    practitionerSpaceHint: "professionnels ORALIGN",
    scroll: "Explorer ORALIGN",
    imageAlt: "Le coffret ORALIGN s’ouvre et dévoile l’étui et les aligneurs transparents",
    playFilm: "Lire la vidéo",
    pauseFilm: "Mettre la vidéo en pause",
  },
  en: {
    eyebrow: "Clear aligners in Tunisia — Made to Shine.",
    intro:
      "Welcome to the ORALIGN universe — the premium clear aligner brand that turns every smile into an expression of confidence and light.",
    origin: "Designed in Germany. Manufactured in Tunisia.",
    practitioner: "Find a practitioner",
    practitionerHint: "near me",
    practitionerSpace: "Practitioner space",
    practitionerSpaceHint: "for ORALIGN professionals",
    scroll: "Explore ORALIGN",
    imageAlt: "The ORALIGN box opens to reveal the case and the clear aligners",
    playFilm: "Play the video",
    pauseFilm: "Pause the video",
  },
  ar: {
    eyebrow: "تقويم الأسنان الشفاف في تونس — Made to Shine.",
    intro:
      "مرحباً بكم في عالم ORALIGN — العلامة المتميزة للتقويم الشفاف التي تحوّل كل ابتسامة إلى تعبير عن الثقة والإشراق.",
    origin: "تصميم ألماني. صناعة تونسية.",
    practitioner: "ابحث عن طبيب",
    practitionerHint: "بالقرب مني",
    practitionerSpace: "فضاء الطبيب",
    practitionerSpaceHint: "لمختصي ORALIGN",
    scroll: "اكتشف ORALIGN",
    imageAlt: "صندوق ORALIGN ينفتح ليكشف عن العلبة والمصففات الشفافة",
    playFilm: "تشغيل الفيديو",
    pauseFilm: "إيقاف الفيديو مؤقتاً",
  },
};

type HeroCopy = (typeof heroCopy)[Lang];

function HeroActions({
  copy,
  finderHref,
  practitionerHref,
}: {
  copy: HeroCopy;
  finderHref: string;
  practitionerHref: string;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[560px] gap-3 sm:grid-cols-2">
      <Link
        href={finderHref}
        className="group inline-flex min-h-14 items-center justify-between gap-4 bg-[var(--sc-white)] px-5 py-3 text-[var(--sc-black)] no-underline shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-colors hover:bg-white"
      >
        <span className="flex min-w-0 items-center gap-3">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-[0.72rem] font-medium leading-tight">
            <span className="block">{copy.practitioner}</span>
            <span className="block text-[0.66rem] text-[var(--sc-text-mid)]">
              {copy.practitionerHint}
            </span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className="h-px w-5 shrink-0 bg-current transition-transform group-hover:translate-x-1"
        />
      </Link>

      <Link
        href={practitionerHref}
        className="group inline-flex min-h-14 items-center justify-between gap-4 bg-[var(--sc-sun)] px-5 py-3 text-[var(--sc-black)] no-underline shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-colors hover:bg-[var(--sc-sun-2)]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Stethoscope className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-[0.72rem] font-medium leading-tight">
            <span className="block">{copy.practitionerSpace}</span>
            <span className="block text-[0.66rem] text-[rgba(25,25,25,0.62)]">
              {copy.practitionerSpaceHint}
            </span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className="h-px w-5 shrink-0 bg-current transition-transform group-hover:translate-x-1"
        />
      </Link>
    </div>
  );
}

export function OralignHeroSection() {
  const { lang } = useShowcaseLang();
  const localizedHref = useLocalizedHref();
  const copy = heroCopy[lang];

  return (
    <section
      id="oralign"
      data-section-tone="dark"
      aria-labelledby="oralign-title"
      className="relative isolate bg-[var(--sc-black)] text-[var(--sc-white)]"
    >
      {/* The film opens the page full screen with no marketing copy over it.
          Actions overlay its lower edge from tablet upward and move below
          the film on phones, where preserving the product frame matters more. */}
      <div className="relative h-[calc(100svh-4rem)] min-h-[280px] overflow-hidden sm:h-[calc(100svh-4.5rem)] lg:h-[calc(100svh-5rem)] lg:min-h-[560px]">
        <HeroFilm labels={{ alt: copy.imageAlt, play: copy.playFilm, pause: copy.pauseFilm }} />
        {/* Darkens the lower part for the buttons, and ends in the section's
            black so the copy beneath reads as the same block, not a new band. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-[45%] sm:block lg:h-2/5"
          style={{
            backgroundImage:
              "linear-gradient(0deg, rgba(25,25,25,1) 0%, rgba(25,25,25,0.62) 38%, rgba(25,25,25,0) 100%)",
          }}
        />
        {/* Overlay the actions from tablet upward, where the film has enough
            horizontal room. Phones get the same actions immediately below
            the film so neither the product nor the pause control is covered. */}
        <div className="absolute inset-x-0 bottom-0 z-10 hidden px-10 pb-24 sm:block lg:pb-20">
          <HeroActions
            copy={copy}
            finderHref={localizedHref("/trouver-un-praticien")}
            practitionerHref={localizedHref("/praticiens")}
          />
        </div>
      </div>

      <div className="px-5 py-5 sm:hidden">
        <HeroActions
          copy={copy}
          finderHref={localizedHref("/trouver-un-praticien")}
          practitionerHref={localizedHref("/praticiens")}
        />
      </div>

      {/* Then the copy, always visible (not on hover: phones have none, and
          the H1 must be readable and indexable as is). */}
      <div className="px-5 pb-14 pt-8 sm:px-10 sm:pb-20 sm:pt-12 lg:px-[clamp(3rem,6vw,6.5rem)] lg:pb-24 lg:pt-14 xl:px-[clamp(4rem,7vw,8rem)]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-8 sm:gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16">
          {/* The tagline is PART of the H1 (same visual spot as the old
              eyebrow <p>): a brand-only H1 tells search engines nothing
              about what the page offers. */}
          <h1 id="oralign-title">
            <span className="block sc-serif text-[clamp(2.65rem,6vw,4.8rem)] leading-none text-[var(--sc-sun)]">
              ORALIGN
            </span>{" "}
            {/* The space above is for text extraction: the two spans are
                blocks, so without it the heading reads "ORALIGNAligneurs". */}
            <span className="mt-3 block text-[0.72rem] font-medium tracking-[0.08em] text-[var(--sc-white)] sm:text-[0.78rem]">
              {copy.eyebrow}
            </span>
          </h1>

          <div>
            <p className="max-w-[560px] text-pretty text-[clamp(1rem,1.45vw,1.2rem)] leading-[1.7] text-[rgba(242,245,239,0.92)]">
              {copy.intro}
            </p>
            <p className="mt-3 text-[0.9rem] tracking-[0.015em] text-[var(--sc-text-mid-on-dark)] sm:text-[0.96rem]">
              {copy.origin}
            </p>

            <Link
              href="#smile-freedom"
              className="mt-8 inline-flex w-fit items-center gap-3 text-[0.58rem] uppercase tracking-[0.28em] text-[rgba(242,245,239,0.56)] no-underline transition-colors hover:text-[var(--sc-sun)] sm:mt-10"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.scroll}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
