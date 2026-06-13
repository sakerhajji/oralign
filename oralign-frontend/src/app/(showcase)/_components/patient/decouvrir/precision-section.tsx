"use client";

import Image from "next/image";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

type PrecisionBenefitCopy = {
  title: string;
  description: string;
};

const precisionCopy: Record<
  Lang,
  {
    title: string;
    intro: string;
    benefits: [
      PrecisionBenefitCopy,
      PrecisionBenefitCopy,
      PrecisionBenefitCopy,
      PrecisionBenefitCopy,
    ];
    imageAlt: string;
  }
> = {
  fr: {
    title: "Votre sourire, aligné avec précision.",
    intro:
      "Un système de traitement complet, pensé dans les moindres détails pour allier confort, discrétion et efficacité clinique.",
    benefits: [
      {
        title: "Aligneurs invisibles sur mesure",
        description:
          "Chaque aligneur est fabriqué spécifiquement pour votre anatomie dentaire unique.",
      },
      {
        title: "Protocole progressif",
        description:
          "Étape par étape, chaque aligneur numéroté guide votre transformation en douceur.",
      },
      {
        title: "Double origine, double exigence",
        description:
          "Conçus en Allemagne. Fabriqués en Tunisie. Le meilleur des deux mondes.",
      },
      {
        title: "Suivi personnalisé",
        description:
          "Un praticien certifié ORALIGN vous accompagne à chaque phase du traitement.",
      },
    ],
    imageAlt:
      "Aligneur transparent ORALIGN éclairé par la lumière naturelle",
  },
  en: {
    title: "Your smile, aligned with precision.",
    intro:
      "A complete treatment system, considered down to the smallest detail to combine comfort, discretion and clinical effectiveness.",
    benefits: [
      {
        title: "Custom clear aligners",
        description:
          "Every aligner is made specifically for your unique dental anatomy.",
      },
      {
        title: "Progressive protocol",
        description:
          "Step by step, each numbered aligner guides your transformation gently.",
      },
      {
        title: "Two origins, one high standard",
        description:
          "Designed in Germany. Manufactured in Tunisia. The best of both worlds.",
      },
      {
        title: "Personalised follow-up",
        description:
          "An ORALIGN-certified practitioner supports you throughout treatment.",
      },
    ],
    imageAlt: "Clear ORALIGN aligner illuminated by natural light",
  },
  ar: {
    title: "ابتسامتك، مصفوفة بدقّة.",
    intro:
      "منظومة علاج متكاملة صُممت بأدق التفاصيل لتجمع بين الراحة والشفافية والفعالية السريرية.",
    benefits: [
      {
        title: "تقويم شفاف مصمم خصيصاً لك",
        description:
          "يُصنع كل قالب بما يتناسب بدقة مع تشريح أسنانك الفريد.",
      },
      {
        title: "بروتوكول تدريجي",
        description:
          "تقودك القوالب المرقمة خطوة بخطوة نحو النتيجة المطلوبة بسلاسة.",
      },
      {
        title: "خبرة مزدوجة ومعايير عالية",
        description:
          "تصميم ألماني وصناعة تونسية تجمع أفضل ما في العالمين.",
      },
      {
        title: "متابعة شخصية",
        description:
          "يرافقك طبيب معتمد من ORALIGN خلال كل مرحلة من مراحل العلاج.",
      },
    ],
    imageAlt: "تقويم ORALIGN شفاف مضاء بضوء طبيعي",
  },
};

export function PrecisionSection() {
  const { lang } = useShowcaseLang();
  const copy = precisionCopy[lang];

  return (
    <section
      id="precision"
      data-section-tone="dark"
      aria-label={copy.title}
      className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
    >
      <div className="relative hidden min-h-[calc(100svh-5rem)] lg:block">
        <Image
          src="/showcase/invisaligne.png"
          alt={copy.imageAlt}
          fill
          sizes="100vw"
          className="object-cover object-[60%_42%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,10,10,0.94)_0%,rgba(10,10,10,0.54)_32%,rgba(10,10,10,0.18)_53%,rgba(10,10,10,0.62)_74%,rgba(10,10,10,0.94)_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.74)_0%,transparent_30%,transparent_67%,rgba(10,10,10,0.72)_100%)]"
        />

        <div className="relative z-10 mx-auto min-h-[calc(100svh-5rem)] max-w-[1440px] px-12 py-12 xl:px-16">
          <div className="grid grid-cols-[1fr_1.25fr_1fr] gap-10">
            <h2 className="sc-serif max-w-[430px] text-[clamp(2.2rem,3.5vw,4rem)] leading-[1.08]">
              {copy.title}
            </h2>
            <div />
            <p className="max-w-[430px] pt-2 text-[0.9rem] leading-[1.8] text-[rgba(242,245,239,0.7)]">
              {copy.intro}
            </p>
          </div>

          <div className="mt-20 grid grid-cols-[1fr_1.25fr_1fr] gap-10">
            <div className="space-y-16">
              {copy.benefits.slice(0, 2).map((benefit) => (
                <PrecisionBenefit key={benefit.title} {...benefit} />
              ))}
            </div>
            <div aria-hidden="true" />
            <div className="space-y-16">
              {copy.benefits.slice(2).map((benefit) => (
                <PrecisionBenefit key={benefit.title} {...benefit} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <div className="px-5 py-14 sm:px-10 sm:py-16">
          <h2 className="sc-serif max-w-[620px] text-balance text-[clamp(2rem,8vw,3.6rem)] leading-[1.08]">
            {copy.title}
          </h2>
          <p className="mt-5 max-w-[620px] text-[0.96rem] leading-[1.75] text-[var(--sc-text-mid-on-dark)]">
            {copy.intro}
          </p>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[16/10]">
          <Image
            src="/showcase/invisaligne.png"
            alt={copy.imageAlt}
            fill
            sizes="100vw"
            className="object-cover object-[64%_center]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.2),transparent_45%,rgba(10,10,10,0.35))]"
          />
        </div>

        <div className="grid gap-px bg-[rgba(242,245,239,0.16)] sm:grid-cols-2">
          {copy.benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="bg-[var(--sc-black)] px-5 py-7 sm:px-8"
            >
              <PrecisionBenefit {...benefit} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrecisionBenefit({
  title,
  description,
}: PrecisionBenefitCopy) {
  return (
    <div className="max-w-[380px]">
      <h3 className="flex items-start gap-3 text-[1.05rem] leading-snug text-[var(--sc-white)]">
        <span
          aria-hidden="true"
          className="mt-[0.5em] h-2 w-2 shrink-0 bg-[var(--sc-sun)]"
        />
        <span>{title}</span>
      </h3>
      <p className="mt-3 ps-5 text-[0.82rem] leading-[1.75] text-[rgba(242,245,239,0.72)]">
        {description}
      </p>
    </div>
  );
}
