"use client";

import Link from "next/link";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { dict } from "../_lib/i18n/dict";
import { ImagePlaceholder } from "./shared/image-placeholder";
import { Reveal } from "./shared/reveal";

/**
 * Branded scaffold for the empty per-page SEO pages.
 *
 * Renders the page H1 (from a `dict.nav` key so it stays multilingual),
 * a placeholder intro + image slot, and a back-home CTA — all in the
 * showcase font / colour vocabulary. Swap the scaffold for real sections
 * (and drop a real `<Image>` into the placeholder) as each page's content
 * is finalised.
 */
export function ShowcasePageScaffold({ titleKey }: { titleKey: string }) {
  const { lang } = useShowcaseLang();
  const title = dict.nav[titleKey as keyof typeof dict.nav]?.[lang] ?? titleKey;

  return (
    <section className="bg-[var(--sc-white)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <Reveal>
          <div className="max-w-[560px]">
            <div className="mb-6 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
              <span
                className="h-px w-8 bg-[var(--sc-sun-deep)]"
                aria-hidden="true"
              />
              <span>{dict.pages.eyebrow[lang]}</span>
            </div>
            <h1 className="sc-serif text-[clamp(2.3rem,5.2vw,4rem)] font-normal leading-[1.04] tracking-[-0.02em]">
              {title}
            </h1>
            <p className="mt-6 max-w-[480px] text-[1rem] leading-8 text-[var(--sc-text-mid)]">
              {dict.pages.placeholder[lang]}
            </p>
            <div className="mt-9">
              <Link
                href="/"
                className="sc-serif inline-flex min-h-12 items-center justify-center gap-2 bg-[var(--sc-black)] px-6 py-3 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)] no-underline transition-colors hover:bg-[rgba(25,25,25,0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
              >
                {dict.pages.backHome[lang]}
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal delay>
          <ImagePlaceholder
            label={dict.pages.imageSoon[lang]}
            aspect="portrait"
            className="mx-auto w-full max-w-[460px] rounded-lg"
          />
        </Reveal>
      </div>
    </section>
  );
}
