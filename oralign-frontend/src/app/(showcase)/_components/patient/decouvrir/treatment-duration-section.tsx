"use client";

import Image from "next/image";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

const durationCopy: Record<
  Lang,
  {
    title: string;
    paragraphs: [string, string, string];
    imageAlt: string;
  }
> = {
  fr: {
    title: "Quelle est la durée du traitement ORALIGN® ?",
    paragraphs: [
      "Les aligneurs transparents ORALIGN® peuvent corriger différents types de désalignements dentaires, des situations simples aux cas plus complexes.",
      "Le traitement dure en moyenne 12 à 18 mois, selon votre situation clinique et le plan défini par votre praticien certifié ORALIGN®.",
      "Les premiers changements sont souvent visibles dès les premiers mois et continuent de s’affiner tout au long du traitement.",
    ],
    imageAlt:
      "Aligneur transparent ORALIGN tenu face à une lumière dorée",
  },
  en: {
    title: "How long does ORALIGN® treatment take?",
    paragraphs: [
      "ORALIGN® clear aligners can address different types of dental misalignment, from straightforward situations to more complex cases.",
      "Treatment lasts 12 to 18 months on average, depending on your clinical situation and the plan defined by your ORALIGN®-certified practitioner.",
      "Early changes are often visible within the first few months and continue to refine throughout treatment.",
    ],
    imageAlt: "Clear ORALIGN aligner held against warm golden light",
  },
  ar: {
    title: "ما مدة العلاج بتقويم ORALIGN®؟",
    paragraphs: [
      "يمكن لتقويم ORALIGN® الشفاف معالجة أنواع مختلفة من عدم انتظام الأسنان، من الحالات البسيطة إلى الحالات الأكثر تعقيداً.",
      "تتراوح مدة العلاج في المتوسط بين 12 و18 شهراً حسب حالتك السريرية والخطة التي يحددها طبيبك المعتمد من ORALIGN®.",
      "غالباً ما تبدأ التغييرات بالظهور خلال الأشهر الأولى وتستمر النتيجة في التحسن طوال فترة العلاج.",
    ],
    imageAlt: "تقويم ORALIGN شفاف أمام ضوء ذهبي دافئ",
  },
};

export function TreatmentDurationSection() {
  const { lang } = useShowcaseLang();
  const copy = durationCopy[lang];

  return (
    <section
      id="treatment-duration"
      data-section-tone="light"
      aria-labelledby="treatment-duration-title"
      className="min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-white)] text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
    >
      <div className="grid min-h-[calc(100svh-4rem)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex items-center px-5 py-16 sm:px-10 sm:py-20 lg:px-[clamp(3rem,5vw,6rem)] lg:py-20">
          <div className="mx-auto w-full max-w-[690px] lg:mx-0">
            <h2
              id="treatment-duration-title"
              className="sc-serif max-w-[650px] text-balance text-[clamp(2rem,4vw,3.55rem)] leading-[1.15]"
            >
              {copy.title}
            </h2>

            <div className="mt-9 max-w-[650px] space-y-7 text-[1rem] leading-[1.78] text-[var(--sc-text-mid)] sm:mt-11 sm:text-[1.06rem]">
              {copy.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="relative aspect-square overflow-hidden sm:aspect-[4/3] lg:min-h-0 lg:aspect-auto">
          <Image
            src="/showcase/image.jpeg"
            alt={copy.imageAlt}
            fill
            sizes="(min-width: 1024px) 45vw, 100vw"
            quality={85}
            className="object-cover object-center"
          />
        </div>
      </div>
    </section>
  );
}
