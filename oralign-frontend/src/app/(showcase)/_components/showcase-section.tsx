"use client";

import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { dict } from "../_lib/i18n/dict";
import { ImagePlaceholder } from "./shared/image-placeholder";
import { Reveal } from "./shared/reveal";

/**
 * Reusable anchored section for the patient category pages.
 *
 * Renders `<section id={id}>` (so the nav hash links + the active-section
 * observer + the CSS `scroll-margin-top` all work) with the showcase's
 * eyebrow + heading + intro placeholder + image slot. Each concrete
 * section (OralignSection, ParcoursSection, …) is a thin component that
 * fills this in — replace the placeholder copy + `ImagePlaceholder` with
 * real content per section as it's finalised.
 *
 * `heading="h1"` on the first section of a page keeps one H1 per page for
 * SEO; the rest use H2. `tone`/`flip` alternate the rhythm down the page.
 */
export function ShowcaseSection({
  id,
  titleKey,
  heading = "h2",
  tone = "light",
  flip = false,
  fullScreen = false,
}: {
  id: string;
  titleKey: string;
  heading?: "h1" | "h2";
  tone?: "light" | "tinted";
  flip?: boolean;
  fullScreen?: boolean;
}) {
  const { lang } = useShowcaseLang();
  const title = dict.nav[titleKey as keyof typeof dict.nav]?.[lang] ?? titleKey;
  const Heading = heading;
  const bg = tone === "tinted" ? "bg-[rgba(25,25,25,0.025)]" : "bg-[var(--sc-white)]";

  return (
    <section
      id={id}
      data-section-tone="light"
      aria-labelledby={`${id}-title`}
      className={[
        bg,
        "px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28",
        fullScreen
          ? "flex min-h-[calc(100svh-4rem)] items-center sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
          : "",
      ].join(" ")}
    >
      <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className={flip ? "lg:order-2" : ""}>
          <div className="max-w-[560px]">
            <div className="mb-5 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
              <span
                className="h-px w-8 bg-[var(--sc-sun-deep)]"
                aria-hidden="true"
              />
              <span>{dict.pages.eyebrow[lang]}</span>
            </div>
            <Heading
              id={`${id}-title`}
              className="sc-serif text-[clamp(1.9rem,3.8vw,3.3rem)] font-normal leading-[1.07] tracking-[-0.02em]"
            >
              {title}
            </Heading>
            <p className="mt-5 max-w-[480px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
              {dict.pages.placeholder[lang]}
            </p>
          </div>
        </Reveal>

        <Reveal delay className={flip ? "lg:order-1" : ""}>
          <ImagePlaceholder
            label={dict.pages.imageSoon[lang]}
            aspect="portrait"
            className="mx-auto w-full max-w-[440px]"
          />
        </Reveal>
      </div>
    </section>
  );
}
