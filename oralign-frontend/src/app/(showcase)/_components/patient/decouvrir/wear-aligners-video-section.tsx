"use client";

import { useShowcaseLang } from "../../../_lib/i18n/lang-context";
import { Reveal, revealDelay } from "../../shared/reveal";
import { RevealWords } from "../../shared/split-words";
import { WearGuide } from "./wear-guide";
import { wearGuideCopy } from "./wear-guide-copy";

export function WearAlignersVideoSection() {
  const { lang } = useShowcaseLang();
  const copy = wearGuideCopy[lang];

  return (
    <section
      id="wear-aligners-video"
      data-section-tone="dark"
      aria-labelledby="wear-aligners-video-title"
      className="bg-[var(--sc-black)] px-5 py-20 text-[var(--sc-white)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
    >
      <div className="mx-auto w-full max-w-[1280px]">
        {/* Same columns as the guide below: the title sits over the film,
            the introduction over the steps. The heading comes in word by
            word as it scrolls up; the guide film below manages itself. */}
        <Reveal
          variant="group"
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:items-end lg:gap-12"
        >
          <RevealWords
            id="wear-aligners-video-title"
            className="sc-serif max-w-[22ch] text-balance text-[clamp(1.9rem,3.6vw,3.2rem)] leading-[1.12]"
            text={copy.title}
          />
          <p
            className="sc-fade max-w-[60ch] text-pretty text-[0.95rem] leading-[1.75] text-[var(--sc-text-mid-on-dark)] sm:text-[1rem]"
            style={revealDelay(320)}
          >
            {copy.intro}
          </p>
        </Reveal>

        <div className="mt-10 lg:mt-14">
          <WearGuide steps={copy.steps} labels={copy.labels} listId="wear-guide-steps" />
        </div>
      </div>
    </section>
  );
}
