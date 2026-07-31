"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Lang } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { ShowcaseSection } from "../showcase-section";
import { Reveal } from "../shared/reveal";

/**
 * Sections of the "Cas" page (/cas). Hash targets:
 * /cas#avant-apres, /cas#agir-tot.
 */

export function AvantApresSection() {
  return <ShowcaseSection id="avant-apres" titleKey="beforeAfter" heading="h1" />;
}

const actEarlyCopy: Record<
  Lang,
  { eyebrow: string; title: string; description: string; cta: string; imageAlt: string }
> = {
  fr: {
    eyebrow: "ORALIGN PRIME",
    title: "Agir tôt, c’est accompagner le sourire dans la bonne direction.",
    description:
      "Un bilan précoce aide le praticien à repérer les besoins et à choisir le moment le plus adapté pour agir, avec un suivi pensé pour chaque étape de la croissance.",
    cta: "Trouver un praticien",
    imageAlt: "Une adolescente et sa mère sourient ensemble dans une lumière chaleureuse",
  },
  en: {
    eyebrow: "ORALIGN PRIME",
    title: "Act early and guide a growing smile with confidence.",
    description:
      "An early assessment helps the practitioner understand what is needed and choose the right moment to act, with support designed for every stage of growth.",
    cta: "Find a practitioner",
    imageAlt: "A teenage girl and her mother smiling together in warm natural light",
  },
  ar: {
    eyebrow: "ORALIGN PRIME",
    title: "التدخّل المبكر يرافق نمو الابتسامة بثقة.",
    description:
      "يساعد الفحص المبكر الطبيب على فهم الاحتياجات واختيار الوقت الأنسب للتدخّل، مع متابعة تناسب كل مرحلة من مراحل النمو.",
    cta: "ابحث عن طبيب",
    imageAlt: "فتاة مراهقة ووالدتها تبتسمان معاً في ضوء طبيعي دافئ",
  },
};

export function AgirTotSection() {
  const { lang } = useShowcaseLang();
  const copy = actEarlyCopy[lang];

  return (
    <section
      id="agir-tot"
      data-section-tone="light"
      aria-labelledby="agir-tot-title"
      className="bg-[rgba(25,25,25,0.025)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
    >
      <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[440px] overflow-hidden border border-[var(--sc-grey)] bg-[var(--sc-grey)] lg:mx-0">
            <Image
              src="/showcase/agir-tot.webp"
              alt={copy.imageAlt}
              fill
              quality={85}
              sizes="(min-width: 1024px) 46vw, 92vw"
              className="object-cover object-center"
            />
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 z-10 h-2 w-28 bg-[var(--sc-sun)] sm:w-36"
            />
            <span
              aria-hidden="true"
              className="absolute bottom-0 right-0 z-10 h-2 w-40 bg-[var(--sc-sun)] sm:w-52"
            />
          </div>
        </Reveal>

        <Reveal delay>
          <div className="max-w-[560px]">
            <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
              <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
              <span>{copy.eyebrow}</span>
            </div>
            <h2
              id="agir-tot-title"
              className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07]"
            >
              {copy.title}
            </h2>
            <p className="mt-5 max-w-[480px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
              {copy.description}
            </p>
            <Link
              href="/trouver-un-praticien"
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-3 text-center text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-black)]"
            >
              {copy.cta}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
