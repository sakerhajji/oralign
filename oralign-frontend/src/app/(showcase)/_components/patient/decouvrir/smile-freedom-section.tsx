"use client";

import Image from "next/image";
import { Camera, EyeOff, Feather, UserRoundCheck } from "lucide-react";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

const freedomCopy: Record<
  Lang,
  {
    title: string;
    paragraphs: [string, string];
    benefits: [string, string, string, string];
    imageAlt: string;
  }
> = {
  fr: {
    title: "Libérez votre sourire dès aujourd’hui",
    paragraphs: [
      "Chez ORALIGN®, nous concevons des traitements pensés pour s’intégrer naturellement à votre quotidien, sans jamais le perturber.",
      "Grâce à nos aligneurs transparents et confortables, vos dents se déplacent progressivement en douceur, tout en offrant des résultats visibles au fil du traitement.",
    ],
    benefits: [
      "Liberté retrouvée",
      "Confiance en images",
      "Discret au quotidien",
      "Accompagnement humain",
    ],
    imageAlt: "Patiente ORALIGN souriant dans une voiture au bord de la mer",
  },
  en: {
    title: "Set your smile free today",
    paragraphs: [
      "At ORALIGN®, we design treatments that fit naturally into your daily life without disrupting it.",
      "With our clear, comfortable aligners, your teeth move gently and progressively while delivering visible results throughout treatment.",
    ],
    benefits: [
      "Freedom restored",
      "Visible confidence",
      "Discreet every day",
      "Human support",
    ],
    imageAlt: "ORALIGN patient smiling in a car by the sea",
  },
  ar: {
    title: "حرّر ابتسامتك ابتداءً من اليوم",
    paragraphs: [
      "في ORALIGN® نصمّم علاجات تنسجم بشكل طبيعي مع حياتك اليومية من دون أن تعيقها.",
      "بفضل تقويمنا الشفاف والمريح، تتحرك أسنانك تدريجياً وبسلاسة مع نتائج واضحة طوال فترة العلاج.",
    ],
    benefits: [
      "حرية مستعادة",
      "ثقة تظهر في الصور",
      "شفاف في حياتك اليومية",
      "مرافقة إنسانية",
    ],
    imageAlt: "مريضة ORALIGN تبتسم داخل سيارة قرب البحر",
  },
};

const benefitIcons = [Feather, Camera, EyeOff, UserRoundCheck] as const;

export function SmileFreedomSection() {
  const { lang } = useShowcaseLang();
  const copy = freedomCopy[lang];

  return (
    <section
      id="smile-freedom"
      data-section-tone="light"
      aria-labelledby="smile-freedom-title"
      className="min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-white)] text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
    >
      <div className="grid min-h-[calc(100svh-4rem)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-2">
        <div className="relative min-h-[70svh] overflow-hidden sm:min-h-[760px] lg:min-h-0">
          <Image
            src="/showcase/womenBornToshine.jpeg"
            alt={copy.imageAlt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-center"
          />
        </div>

        <div className="flex items-center px-5 py-16 sm:px-10 sm:py-20 lg:px-[clamp(3rem,5.5vw,6.5rem)] lg:py-20">
          <div className="mx-auto w-full max-w-[680px] lg:mx-0">
            <h2
              id="smile-freedom-title"
              className="sc-serif max-w-[620px] text-balance text-[clamp(2rem,4vw,3.6rem)] leading-[1.14] text-[var(--sc-black)]"
            >
              {copy.title}
            </h2>

            <div className="mt-7 max-w-[650px] space-y-5 text-[0.98rem] leading-[1.75] text-[var(--sc-text-mid)] sm:text-[1.03rem]">
              {copy.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-12">
              {copy.benefits.map((benefit, index) => {
                const Icon = benefitIcons[index];
                return (
                  <div
                    key={benefit}
                    className="flex min-h-[72px] items-center gap-4 border border-[rgba(25,25,25,0.2)] bg-transparent px-4 py-3 transition-colors hover:border-[var(--sc-sun-deep)] hover:bg-[var(--sc-sun-3)]"
                  >
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.25}
                      className="h-7 w-7 shrink-0 text-[var(--sc-black)]"
                    />
                    <span className="text-[0.78rem] font-medium leading-snug text-[var(--sc-black)] sm:text-[0.82rem]">
                      {benefit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
