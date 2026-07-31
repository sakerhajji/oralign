"use client";

import Image from "next/image";
import Link from "next/link";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

const ctaCopy: Record<
  Lang,
  {
    eyebrow: string;
    title: string;
    cta: string;
    imageAlt: string;
  }
> = {
  fr: {
    eyebrow: "PRÊT(E) À RETROUVER",
    title: "LE SOURIRE QUE VOUS MÉRITEZ",
    cta: "Réserver ma consultation",
    imageAlt:
      "Couple souriant sur une terrasse méditerranéenne face à la mer",
  },
  en: {
    eyebrow: "READY TO FIND",
    title: "THE SMILE YOU DESERVE",
    cta: "Book my consultation",
    imageAlt: "Smiling couple on a Mediterranean terrace overlooking the sea",
  },
  ar: {
    eyebrow: "جاهز لاستعادة",
    title: "الابتسامة التي تستحقها",
    cta: "احجز استشارتي",
    imageAlt: "زوجان مبتسمان على شرفة متوسطية مطلة على البحر",
  },
};

export function SmileConsultationCtaSection() {
  const { lang } = useShowcaseLang();
  const copy = ctaCopy[lang];

  return (
    <section
      id="consultation"
      data-section-tone="dark"
      aria-labelledby="consultation-cta-title"
      className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
    >
      <Image
        src="/showcase/ready-smile-cta.webp"
        alt={copy.imageAlt}
        fill
        sizes="100vw"
        quality={85}
        className="object-cover object-center lg:object-[58%_center]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/26 to-black/8 sm:from-black/72 sm:via-black/18 lg:from-black/66 lg:via-black/12"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[62%] bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.48),transparent_62%)] sm:h-1/2 sm:bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.36),transparent_58%)]"
      />

      <div className="relative z-10 flex min-h-[calc(100svh-4rem)] items-end justify-center px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-24 text-center sm:min-h-[calc(100svh-4.5rem)] sm:px-8 sm:pb-[clamp(3.5rem,10vh,6.5rem)] lg:min-h-[calc(100svh-5rem)]">
        <div className="w-full max-w-[760px]">
          <p
            className="text-[clamp(1.05rem,6.2vw,1.85rem)] font-light leading-[1.05] tracking-[0.01em] text-white sm:text-[clamp(1.35rem,2.35vw,2.05rem)]"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.52)" }}
          >
            {copy.eyebrow}
          </p>
          <h2
            id="consultation-cta-title"
            className="mt-2 text-balance text-[clamp(1.35rem,7vw,2.25rem)] font-semibold leading-[1.08] text-white sm:text-[clamp(1.65rem,2.8vw,2.55rem)]"
            style={{ textShadow: "0 2px 24px rgba(0,0,0,0.58)" }}
          >
            {copy.title}
          </h2>

          <Link
            href="/trouver-un-praticien"
            className="mt-5 inline-flex min-h-12 w-full max-w-[260px] items-center justify-center bg-[var(--sc-sun)] px-6 py-3 text-[0.72rem] font-semibold text-[var(--sc-black)] no-underline shadow-[0_16px_34px_rgba(255,200,47,0.28)] transition hover:bg-[var(--sc-sun-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-white)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--sc-black)] sm:min-h-12 sm:w-auto sm:max-w-none sm:px-7"
          >
            {copy.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
