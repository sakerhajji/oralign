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
      "Patiente ORALIGN rangeant son aligneur transparent dans son étui à une terrasse",
  },
  en: {
    title: "Enjoy every part of your day",
    description:
      "At ORALIGN®, we believe clear aligner treatment should fit naturally into your lifestyle without making it more complicated.",
    imageAlt:
      "ORALIGN patient placing her clear aligner in its case at a café terrace",
  },
  ar: {
    title: "استمتع بكل لحظة من يومك",
    description:
      "في ORALIGN® نؤمن بأن العلاج بالتقويم الشفاف يجب أن ينسجم بصورة طبيعية مع أسلوب حياتك من دون أن يزيده تعقيداً.",
    imageAlt:
      "مريضة ORALIGN تضع تقويمها الشفاف في علبته على شرفة مقهى",
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
      className="flex flex-col bg-[var(--sc-white)] text-[var(--sc-black)] lg:min-h-[calc(100svh-5rem)]"
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

      <div className="relative aspect-[16/9] w-full overflow-hidden sm:aspect-[16/10] lg:min-h-0 lg:flex-1 lg:aspect-auto">
        <Image
          src="/showcase/oralign-daily-life.webp"
          alt={copy.imageAlt}
          fill
          sizes="100vw"
          quality={85}
          className="object-cover object-center"
        />
      </div>
    </section>
  );
}
