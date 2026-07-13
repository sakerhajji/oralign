"use client";

import Image from "next/image";
import Link from "next/link";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

const wearCopy: Record<
  Lang,
  {
    title: string;
    intro: string;
    tips: [string, string, string, string];
    cta: string;
    imageAlt: string;
  }
> = {
  fr: {
    title:
      "Comment porter vos aligneurs ORALIGN® pour obtenir les meilleurs résultats",
    intro:
      "Tout au long du traitement, votre praticien ORALIGN® reste à vos côtés pour vous accompagner, répondre à vos questions et vous guider à chaque étape. Voici les réflexes essentiels à adopter au quotidien.",
    tips: [
      "Retirez vos aligneurs avant de manger ou de boire, sauf pour l’eau.",
      "Brossez-vous les dents après les repas avant de remettre vos aligneurs.",
      "Portez vos aligneurs 20 à 22 heures par jour, selon les recommandations de votre praticien.",
      "Continuez à profiter de vos sorties et de votre vie sociale : le traitement reste discret au quotidien.",
    ],
    cta: "Consulter le guide complet",
    imageAlt:
      "Patiente mettant en place ses aligneurs transparents ORALIGN devant un miroir",
  },
  en: {
    title: "How to wear your ORALIGN® aligners for the best results",
    intro:
      "Throughout treatment, your ORALIGN® practitioner remains by your side to answer questions and guide every stage. These simple habits help keep your treatment on track.",
    tips: [
      "Remove your aligners before eating or drinking anything except water.",
      "Brush your teeth after meals before putting your aligners back in.",
      "Wear your aligners for 20 to 22 hours each day, following your practitioner’s advice.",
      "Keep enjoying evenings out and time with friends: treatment remains discreet in daily life.",
    ],
    cta: "Read the complete guide",
    imageAlt:
      "Patient placing her clear ORALIGN aligners in front of a mirror",
  },
  ar: {
    title: "كيف ترتدي تقويم ORALIGN® للحصول على أفضل النتائج",
    intro:
      "يبقى طبيب ORALIGN® إلى جانبك طوال فترة العلاج للإجابة عن أسئلتك وإرشادك في كل مرحلة. تساعدك هذه العادات البسيطة على الالتزام بالخطة.",
    tips: [
      "انزع القوالب قبل الأكل أو شرب أي شيء باستثناء الماء.",
      "نظّف أسنانك بعد الوجبات وقبل إعادة القوالب.",
      "ارتدِ القوالب من 20 إلى 22 ساعة يومياً وفق إرشادات طبيبك.",
      "واصل الاستمتاع بوقتك مع العائلة والأصدقاء، فالعلاج يبقى شفافاً في حياتك اليومية.",
    ],
    cta: "اطّلع على الدليل الكامل",
    imageAlt: "مريضة تضع تقويم ORALIGN الشفاف أمام المرآة",
  },
};

export function WearAlignersSection() {
  const { lang } = useShowcaseLang();
  const copy = wearCopy[lang];

  return (
    <section
      id="wear-aligners"
      data-section-tone="dark"
      aria-labelledby="wear-aligners-title"
      className="flex min-h-[calc(100svh-4rem)] items-center bg-[var(--sc-black)] px-5 py-16 text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] sm:px-8 sm:py-20 lg:min-h-[calc(100svh-5rem)] lg:px-12 lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="mx-auto max-w-[1020px] text-center">
          <h2
            id="wear-aligners-title"
            className="sc-serif text-balance text-[clamp(2rem,4vw,3.55rem)] leading-[1.12]"
          >
            {copy.title}
          </h2>
          <p className="mx-auto mt-6 max-w-[900px] text-pretty text-[0.95rem] leading-[1.75] text-[var(--sc-text-mid-on-dark)] sm:text-[1rem]">
            {copy.intro}
          </p>
        </div>

        <div className="mt-12 grid items-center gap-10 lg:mt-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
          <div>
            <ul className="space-y-5">
              {copy.tips.map((tip) => (
                <li
                  key={tip}
                  className="flex items-start gap-4 text-[0.98rem] leading-[1.75] text-[rgba(242,245,239,0.9)] sm:text-[1.04rem]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[0.7em] h-2 w-2 shrink-0 bg-[var(--sc-sun)]"
                  />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/guide"
              className="mt-9 inline-flex min-h-13 items-center justify-center border border-[var(--sc-sun)] px-7 py-3 text-[0.7rem] font-medium text-[var(--sc-sun)] no-underline transition-colors hover:bg-[var(--sc-sun)] hover:text-[var(--sc-black)]"
            >
              {copy.cta}
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-[520px]">
            <span
              aria-hidden="true"
              className="absolute -right-2 -top-2 z-10 h-20 w-2 bg-[var(--sc-sun)] sm:h-28"
            />
            <div className="relative aspect-square overflow-hidden">
              <Image
                src="/showcase/Portez.webp"
                alt={copy.imageAlt}
                fill
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover object-center"
              />
            </div>
            <span
              aria-hidden="true"
              className="absolute -bottom-2 -left-2 z-10 h-2 w-24 bg-[var(--sc-sun)] sm:w-36"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
