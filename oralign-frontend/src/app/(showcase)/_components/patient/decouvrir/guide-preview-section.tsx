"use client";

import Image from "next/image";
import Link from "next/link";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

const guideCopy: Record<
  Lang,
  {
    benefits: [string, string, string];
    statement: string;
    cta: string;
    imageAlt: string;
  }
> = {
  fr: {
    benefits: [
      "Pratiquez vos sports et profitez de vos activités préférées.",
      "Brossez-vous les dents et utilisez du fil dentaire comme d’habitude, sans fils ni bagues.",
      "Savourez les plats et les boissons que vous aimez.",
    ],
    statement:
      "D’une transparence exceptionnelle, les aligneurs ORALIGN sont conçus pour se faire oublier. Ils sont si discrets que votre entourage ne remarquera même pas votre traitement.",
    cta: "Guide d’utilisation",
    imageAlt:
      "Patient ORALIGN souriant à une terrasse de café avec ses aligneurs transparents",
  },
  en: {
    benefits: [
      "Play sports and keep enjoying all your favourite activities.",
      "Brush and floss normally, without wires or brackets getting in the way.",
      "Enjoy the meals and drinks you love.",
    ],
    statement:
      "Exceptionally clear, ORALIGN aligners are designed to fade into your daily life. They are so discreet that the people around you may never notice your treatment.",
    cta: "User guide",
    imageAlt:
      "ORALIGN patient smiling at a café terrace with his clear aligners",
  },
  ar: {
    benefits: [
      "مارس الرياضة واستمتع بأنشطتك المفضلة بكل حرية.",
      "نظّف أسنانك واستعمل الخيط كالمعتاد من دون أسلاك أو حاصرات.",
      "استمتع بالأطباق والمشروبات التي تحبها.",
    ],
    statement:
      "صُمّم تقويم ORALIGN الشفاف بدرجة استثنائية ليصبح جزءاً غير ملحوظ من يومك، حتى إن من حولك قد لا ينتبهون إلى علاجك.",
    cta: "دليل الاستخدام",
    imageAlt:
      "مريض ORALIGN يبتسم في مقهى مع تقويمه الشفاف",
  },
};

export function GuidePreviewSection() {
  const { lang } = useShowcaseLang();
  const copy = guideCopy[lang];

  return (
    <section
      id="guide-preview"
      data-section-tone="light"
      aria-label={copy.cta}
      className="flex min-h-[calc(100svh-4rem)] items-center bg-[var(--sc-white)] px-5 py-16 text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] sm:px-8 sm:py-20 lg:min-h-[calc(100svh-5rem)] lg:px-12 lg:py-24"
    >
      <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 xl:gap-20">
        <div className="relative mx-auto w-full max-w-[560px]">
          <span
            aria-hidden="true"
            className="absolute -left-1 -top-2 z-10 h-2 w-24 bg-[var(--sc-sun)] sm:w-32"
          />
          <div className="relative aspect-[107/100] overflow-hidden bg-[#b98755]">
            <Image
              src="/showcase/image123.jpeg"
              alt={copy.imageAlt}
              fill
              sizes="(min-width: 1024px) 44vw, 100vw"
              className="object-cover object-center"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30"
            />
          </div>
          <span
            aria-hidden="true"
            className="absolute -bottom-2 right-0 z-10 h-2 w-36 bg-[var(--sc-sun)] sm:w-48"
          />
        </div>

        <div className="mx-auto w-full max-w-[650px] lg:mx-0">
          <ul className="space-y-7 sm:space-y-8">
            {copy.benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-4 text-[0.98rem] leading-[1.65] text-[var(--sc-black)] sm:text-[1.03rem]"
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.72em] h-1.5 w-1.5 shrink-0 bg-[var(--sc-black)]"
                />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-12 max-w-[590px] text-center text-[1rem] font-medium leading-[1.55] text-[var(--sc-black)] sm:mt-14 sm:text-[1.08rem]">
            {copy.statement}
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href="/patient/guide"
              className="inline-flex min-h-13 items-center justify-center bg-[var(--sc-sun)] px-8 py-3.5 text-center text-[0.72rem] font-medium text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] focus-visible:outline-[var(--sc-black)]"
            >
              {copy.cta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
