"use client";

import Link from "next/link";
import { ArrowDown, MapPin, Play } from "lucide-react";
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
    video: string;
    videoHint: string;
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
    video: "Découvrir ORALIGN",
    videoHint: "en vidéo",
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
    video: "Discover ORALIGN",
    videoHint: "on video",
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
    video: "اكتشف ORALIGN",
    videoHint: "بالفيديو",
    scroll: "اكتشف ORALIGN",
    imageAlt: "صندوق ORALIGN ينفتح ليكشف عن العلبة والمصففات الشفافة",
    playFilm: "تشغيل الفيديو",
    pauseFilm: "إيقاف الفيديو مؤقتاً",
  },
};

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
      {/* The film opens the page full screen, with no text over it — only
          the two calls to action. The floor stays below a landscape phone's
          height (~310 px under the header), so the film, its buttons and its
          pause control fit that screen too. */}
      <div className="relative h-[calc(100svh-4rem)] min-h-[280px] overflow-hidden sm:h-[calc(100svh-4.5rem)] lg:h-[calc(100svh-5rem)] lg:min-h-[560px]">
        <HeroFilm labels={{ alt: copy.imageAlt, play: copy.playFilm, pause: copy.pauseFilm }} />
        {/* Darkens the lower part for the buttons, and ends in the section's
            black so the copy beneath reads as the same block, not a new band. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] lg:h-2/5"
          style={{
            backgroundImage:
              "linear-gradient(0deg, rgba(25,25,25,1) 0%, rgba(25,25,25,0.62) 38%, rgba(25,25,25,0) 100%)",
          }}
        />
        {/* Centred, in the lower third: the film frames its subject in the
            middle, so the buttons sit under the product, not over it (on
            desktop, on the dark floor below the boxes). The bottom padding
            keeps them clear of the pause control (bottom-4, 40 px) on phones. */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-[4.5rem] sm:px-10 sm:pb-24 lg:pb-20">
          <div className="mx-auto grid w-full max-w-[560px] gap-3 sm:grid-cols-2">
            <Link
              href={localizedHref("/trouver-un-praticien")}
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

            {/* The home page's video is the "how to wear your aligners"
                section — #parcours does not exist on this page. */}
            <Link
              href="#wear-aligners-video"
              className="group inline-flex min-h-14 items-center justify-between gap-4 bg-[var(--sc-sun)] px-5 py-3 text-[var(--sc-black)] no-underline shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-colors hover:bg-[var(--sc-sun-2)]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Play className="h-4 w-4 shrink-0 fill-current" aria-hidden="true" />
                <span className="text-[0.72rem] font-medium leading-tight">
                  <span className="block">{copy.video}</span>
                  <span className="block text-[0.66rem] text-[rgba(25,25,25,0.62)]">
                    {copy.videoHint}
                  </span>
                </span>
              </span>
              <span
                aria-hidden="true"
                className="h-px w-5 shrink-0 bg-current transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>
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
