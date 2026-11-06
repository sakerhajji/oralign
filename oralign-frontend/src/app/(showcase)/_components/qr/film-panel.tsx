"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { RotateCcw, X } from "lucide-react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import type { WearGuide as WearGuidePlayer } from "../patient/decouvrir/wear-guide";
import { wearGuideCopy } from "../patient/decouvrir/wear-guide-copy";
import { QR_COPY } from "./qr-copy";

/**
 * When the player cannot be fetched (a dropped connection, or a deploy
 * that replaced its file while the page was open), the panel says so and
 * offers a reload — the URL still carries #guide, so the film reopens —
 * instead of the error crossing the whole welcome.
 */
function FilmUnavailable(props: ComponentProps<typeof WearGuidePlayer>) {
  void props;
  const { lang } = useShowcaseLang();
  const c = QR_COPY[lang].film;
  return (
    <div role="alert" className="flex flex-col items-start gap-5 py-12">
      <p className="max-w-[40ch] text-[1rem] leading-[1.65] text-[var(--sc-text-mid-on-dark)]">{c.unavailable}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-[rgba(242,245,239,0.24)] px-5 text-[0.7rem] font-semibold tracking-[0.16em] text-[var(--sc-white)] uppercase transition-colors hover:border-[var(--sc-sun)] rtl:tracking-normal"
      >
        <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {c.retry}
      </button>
    </div>
  );
}

/**
 * The player of the home page's wear guide, fetched only when the guide is
 * opened: the QR welcome itself stays light on a slow phone connection.
 * The frame keeps its own size while the code arrives (9:16 full bleed on
 * a phone, 16:9 above), so nothing jumps.
 */
const WearGuide = dynamic(
  () =>
    import("../patient/decouvrir/wear-guide")
      .then((module) => module.WearGuide)
      .catch(() => FilmUnavailable),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden="true" className="-mx-5 aspect-[9/16] bg-[#f3eadf] sm:mx-0 sm:aspect-video" />
    ),
  },
);

/**
 * The film over the QR welcome: the official wear guide (the home page's
 * "Comment porter vos aligneurs ORALIGN® pour obtenir les meilleurs
 * résultats", its film and its ten steps), full screen, without leaving
 * the page. The player plays muted once on screen, pauses and goes full
 * screen on demand, and is unmounted (its video released) on close.
 *
 * The frame is sized by the screen's HEIGHT as well as its width: below
 * the panel's one-line header (2.75rem button + 1.25rem padding + 1px
 * rule) the whole film always fits, with its pause and full-screen
 * buttons — in a phone browser whose toolbars take a sixth of the screen,
 * and in landscape. The player's frame bleeds to this wrapper's edges, so
 * capping the wrapper caps the frame; the black panel frames the sides.
 */
export function FilmPanel({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const { lang } = useShowcaseLang();
  const guide = wearGuideCopy[lang];
  const c = QR_COPY[lang];

  return (
    <div className="min-h-full bg-[var(--sc-black)] text-[var(--sc-white)]">
      <div className="sticky top-0 z-10 border-b border-[rgba(242,245,239,0.08)] bg-[var(--sc-black)]">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-5 py-2.5 sm:px-8 lg:px-12">
          {/* One line below lg, so the header keeps the height the frame
              is sized against: the card's own short title on a phone, the
              film's full title from sm up (two lines allowed from lg). */}
          <h2 id={titleId} className="sc-serif min-w-0 text-[1rem] leading-snug sm:text-[1.2rem]">
            <span className="block truncate sm:hidden">{c.guide.title}</span>
            <span className="hidden text-pretty sm:line-clamp-1 lg:line-clamp-2">{guide.title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={c.film.close}
            className="-me-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--sc-text-mid-on-dark)] transition-colors hover:bg-[rgba(242,245,239,0.08)] hover:text-[var(--sc-white)]"
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1280px] px-5 pt-0 pb-12 max-sm:max-w-[calc((100dvh_-_4rem_-_1px)*9/16)] sm:px-8 sm:pt-8 sm:max-lg:max-w-[calc((100dvh_-_6rem_-_1px)*16/9_+_4rem)] lg:px-12 lg:pt-12">
        <WearGuide steps={guide.steps} labels={guide.labels} listId="qr-guide-steps" />
      </div>
    </div>
  );
}
