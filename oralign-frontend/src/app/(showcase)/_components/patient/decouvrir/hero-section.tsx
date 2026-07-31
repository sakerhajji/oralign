"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, MapPin, Play } from "lucide-react";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

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
  }
> = {
  fr: {
    eyebrow: "Made to Shine.",
    intro:
      "Bienvenue dans l’univers ORALIGN — la marque d’aligneurs invisibles premium qui transforme chaque sourire en une expression de confiance et de lumière.",
    origin: "Conçus en Allemagne. Fabriqués en Tunisie.",
    practitioner: "Trouver un praticien",
    practitionerHint: "près de chez moi",
    video: "Découvrir ORALIGN",
    videoHint: "en vidéo",
    scroll: "Explorer ORALIGN",
    imageAlt: "Trois amies souriant ensemble au soleil",
  },
  en: {
    eyebrow: "Made to Shine.",
    intro:
      "Welcome to the ORALIGN universe — the premium clear aligner brand that turns every smile into an expression of confidence and light.",
    origin: "Designed in Germany. Manufactured in Tunisia.",
    practitioner: "Find a practitioner",
    practitionerHint: "near me",
    video: "Discover ORALIGN",
    videoHint: "on video",
    scroll: "Explore ORALIGN",
    imageAlt: "Three friends smiling together in the sunlight",
  },
  ar: {
    eyebrow: "Made to Shine.",
    intro:
      "مرحباً بكم في عالم ORALIGN — العلامة المتميزة للتقويم الشفاف التي تحوّل كل ابتسامة إلى تعبير عن الثقة والإشراق.",
    origin: "تصميم ألماني. صناعة تونسية.",
    practitioner: "ابحث عن طبيب",
    practitionerHint: "بالقرب مني",
    video: "اكتشف ORALIGN",
    videoHint: "بالفيديو",
    scroll: "اكتشف ORALIGN",
    imageAlt: "ثلاث صديقات يبتسمن معاً تحت ضوء الشمس",
  },
};

export function OralignHeroSection() {
  const { lang } = useShowcaseLang();
  const copy = heroCopy[lang];

  return (
    <section
      id="oralign"
      data-section-tone="dark"
      aria-labelledby="oralign-title"
      className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
    >
      <div className="grid min-h-[calc(100svh-4rem)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[50%_50%]">
        <div className="relative z-10 flex min-h-[620px] flex-col justify-center px-5 py-16 sm:min-h-[660px] sm:px-10 sm:py-20 lg:min-h-0 lg:px-[clamp(3rem,6vw,6.5rem)] lg:py-16 xl:px-[clamp(4rem,7vw,8rem)]">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 hidden w-px bg-[rgba(242,245,239,0.12)] lg:block"
          />

          <div className="max-w-[570px]">
            <div className="mb-12 sm:mb-16 lg:mb-[clamp(4rem,9vh,7rem)]">
              <h1
                id="oralign-title"
                className="sc-serif text-[clamp(2.65rem,6vw,4.8rem)] leading-none text-[var(--sc-sun)]"
              >
                ORALIGN
              </h1>
              <p className="mt-2 text-[0.72rem] font-medium tracking-[0.08em] text-[var(--sc-white)] sm:text-[0.78rem]">
                {copy.eyebrow}
              </p>
            </div>

            <p className="max-w-[540px] text-pretty text-[clamp(1.05rem,1.55vw,1.28rem)] leading-[1.75] text-[rgba(242,245,239,0.92)]">
              {copy.intro}
            </p>
            <p className="mt-3 text-[0.9rem] tracking-[0.015em] text-[var(--sc-text-mid-on-dark)] sm:text-[0.96rem]">
              {copy.origin}
            </p>

            <div className="mt-10 grid max-w-[550px] gap-3 sm:mt-12 sm:grid-cols-2">
              <Link
                href="/trouver-un-praticien"
                className="group inline-flex min-h-14 items-center justify-between gap-4 bg-[var(--sc-white)] px-5 py-3 text-[var(--sc-black)] no-underline transition-colors hover:bg-white"
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
                href="#parcours"
                className="group inline-flex min-h-14 items-center justify-between gap-4 bg-[var(--sc-sun)] px-5 py-3 text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)]"
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

          <Link
            href="#smile-freedom"
            className="mt-12 inline-flex w-fit items-center gap-3 text-[0.58rem] uppercase tracking-[0.28em] text-[rgba(242,245,239,0.48)] no-underline transition-colors hover:text-[var(--sc-sun)] lg:absolute lg:bottom-8 lg:left-[clamp(3rem,6vw,6.5rem)] xl:left-[clamp(4rem,7vw,8rem)]"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.scroll}
          </Link>
        </div>

        <div className="relative min-h-[58svh] overflow-hidden sm:min-h-[680px] lg:min-h-0">
          <Image
            src="/showcase/Friends.jpeg"
            alt={copy.imageAlt}
            fill
            priority
            quality={85}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-[50%_52%] lg:object-[50%_50%]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[rgba(25,25,25,0.18)] to-transparent lg:hidden"
          />
        </div>
      </div>
    </section>
  );
}
