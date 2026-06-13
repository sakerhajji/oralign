"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
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
      className="overflow-hidden bg-[var(--sc-white)] text-[var(--sc-black)] lg:min-h-[80svh]"
    >
      <div className="grid w-full lg:min-h-[80svh] lg:grid-cols-2">
        <div className="relative min-h-[440px] w-full overflow-hidden sm:min-h-[600px] lg:min-h-0">
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 z-10 h-2 w-28 bg-[var(--sc-sun)] sm:w-36"
          />
          <Image
            src="/showcase/image123.jpeg"
            alt={copy.imageAlt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-center"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[115%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,14,8,0.04),transparent_55%,rgba(20,14,8,0.12))]"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-0 right-0 z-10 h-2 w-40 bg-[var(--sc-sun)] sm:w-52"
          />
        </div>

        <div className="flex items-center px-5 py-14 sm:px-10 sm:py-16 lg:px-[clamp(3rem,5.5vw,6.5rem)] lg:py-16">
          <div className="mx-auto w-full max-w-[620px]">
            <ul className="border-y border-[rgba(25,25,25,0.16)]">
              {copy.benefits.map((benefit, index) => (
              <li
                key={benefit}
                  className="grid grid-cols-[2rem_1fr] gap-4 border-b border-[rgba(25,25,25,0.12)] py-5 last:border-b-0 sm:grid-cols-[2.5rem_1fr] sm:py-6"
              >
                <span
                  aria-hidden="true"
                    className="pt-0.5 text-[0.6rem] font-medium tracking-[0.18em] text-[var(--sc-sun-deep)]"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[0.96rem] leading-[1.65] text-[var(--sc-black)] sm:text-[1rem]">
                    {benefit}
                  </span>
              </li>
            ))}
          </ul>

            <div className="mt-10 border-s-2 border-[var(--sc-sun)] ps-5 sm:mt-12 sm:ps-7">
              <p className="max-w-[510px] text-pretty text-[1rem] font-medium leading-[1.62] text-[var(--sc-black)] sm:text-[1.06rem]">
                {copy.statement}
              </p>
            </div>

            <div className="mt-8 flex">
              <Link
                href="/patient/guide"
                className="group inline-flex min-h-13 items-center justify-center gap-4 bg-[var(--sc-sun)] px-7 py-3.5 text-center text-[0.72rem] font-semibold text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] focus-visible:outline-[var(--sc-black)]"
              >
                {copy.cta}
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
