"use client";

import Image from "next/image";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

const everydayCopy: Record<
  Lang,
  {
    title: string;
    description: string;
    imageAlt: string;
  }
> = {
  fr: {
    title: "Profitez pleinement de votre quotidien",
    description:
      "Chez ORALIGN®, nous pensons qu’un traitement par aligneurs transparents doit s’intégrer naturellement à votre mode de vie, sans le compliquer.",
    imageAlt:
      "Patiente ORALIGN souriant dans un village méditerranéen au bord de la mer",
  },
  en: {
    title: "Enjoy every part of your day",
    description:
      "At ORALIGN®, we believe clear aligner treatment should fit naturally into your lifestyle without making it more complicated.",
    imageAlt:
      "ORALIGN patient smiling in a Mediterranean village by the sea",
  },
  ar: {
    title: "استمتع بكل لحظة من يومك",
    description:
      "في ORALIGN® نؤمن بأن العلاج بالتقويم الشفاف يجب أن ينسجم بصورة طبيعية مع أسلوب حياتك من دون أن يزيده تعقيداً.",
    imageAlt:
      "مريضة ORALIGN تبتسم في قرية متوسطية مطلة على البحر",
  },
};

export function DailyLifeSection() {
  const { lang } = useShowcaseLang();
  const copy = everydayCopy[lang];

  return (
    <section
      id="daily-life"
      data-section-tone="light"
      aria-labelledby="daily-life-title"
      className="flex min-h-[calc(100svh-4rem)] flex-col bg-[var(--sc-white)] text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
    >
      <div className="px-5 py-12 text-center sm:px-8 sm:py-16 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-[920px]">
          <h2
            id="daily-life-title"
            className="sc-serif text-balance text-[clamp(1.9rem,4vw,3.5rem)] leading-[1.12]"
          >
            {copy.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[760px] text-pretty text-[0.98rem] leading-[1.7] text-[var(--sc-text-mid)] sm:text-[1.05rem]">
            {copy.description}
          </p>
        </div>
      </div>

      <div className="relative min-h-[520px] w-full flex-1 overflow-hidden sm:min-h-[600px] lg:min-h-0">
        <Image
          src="/showcase/image123456.jpeg"
          alt={copy.imageAlt}
          fill
          sizes="100vw"
          className="object-cover object-[58%_center] sm:object-center"
        />
      </div>
    </section>
  );
}
