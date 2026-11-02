"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { WEAR_GUIDE } from "./wear-guide-manifest";

/**
 * The wear guide: a silent instructional film and its ten steps as text.
 *
 *  - The steps are the film's chapters AND its text alternative: the current
 *    step follows the film, and choosing one plays the film from there. The
 *    film's captions are burned in, in French; the page carries the same
 *    steps in its own language.
 *  - Desktop and tablet: the 16:9 film beside (or above) the full step list.
 *  - Phone (below `sm`): told like a Story, because that is how a 9:16 film
 *    is watched on a phone — full-bleed film, one segment per step filling
 *    across the top, tap the edges for the previous / next step and the
 *    middle to pause. Under it, the current step in the page's language,
 *    set like the film's own captions (amber number, short amber rule), with
 *    previous / next buttons. The full list folds away behind "see all".
 *  - The cut follows the viewport (9:16 below `sm`, 16:9 above); a rotation
 *    across it swaps cuts and resumes at the same step.
 *  - Nothing downloads with the page: the poster is a lazy WebP, the video
 *    has preload="none" and no source until hydration. Once the frame is a
 *    third on screen it plays muted (the film has no sound) — unless reduced
 *    motion or Save-Data ask for stillness, or autoplay is refused: then it
 *    waits for the play button. Off-screen or in a background tab it pauses,
 *    and it stops on its end card instead of looping.
 *  - AV1 first, H.264 second: the browser plays the first source it can
 *    decode and falls back to the next one if it fails. A cut may have no
 *    AV1 (the phone cut ships its source H.264 as is — see encode.sh).
 */

type Cut = "desktop" | "phone";

const PHONE_MEDIA = "(max-width: 639.98px)";

/**
 * When each step's caption is on screen, in seconds — measured on the 16:9
 * master (frame differences in the caption area, then checked frame by
 * frame). The 9:16 phone_web cut follows the same edit (65.04 s, checked
 * at every step). Re-measure per cut if a film is re-cut.
 */
const TIMELINE = [4.4, 8.4, 12.5, 17.1, 31.0, 39.5, 44.6, 48.8, 53.3, 57.9];
const CHAPTERS: Record<Cut, readonly number[]> = { desktop: TIMELINE, phone: TIMELINE };

/** A step counts as current from just before its caption settles. */
const LEAD = 0.4;
/** Share of the frame that must be on screen before the film starts. */
const START_RATIO = 0.35;

export type GuideStep = { title: string; note?: string };

export type GuideLabels = {
  film: string;
  play: string;
  pause: string;
  replay: string;
  fullscreen: string;
  previous: string;
  next: string;
  pickStep: string;
  showSteps: string;
  hideSteps: string;
  /** Shown on a phone under the film before the first step. */
  tapHint: string;
  /** Pages whose language is not the captions' (French). */
  captions?: string;
};

type Status = "idle" | "playing" | "paused" | "ended";

/** Reduced motion, Save-Data or a very slow connection: never start uninvited. */
function prefersStill(): boolean {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    Boolean(connection?.saveData) ||
    /(^|-)2g$/.test(connection?.effectiveType ?? "")
  );
}

function stepAt(time: number, chapters: readonly number[]): number {
  let step = -1;
  chapters.forEach((start, i) => {
    if (time >= start - LEAD) step = i;
  });
  return step;
}

const pad = (n: number) => String(n).padStart(2, "0");

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_MEDIA);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The cut for this viewport; null on the server and during hydration. */
function useCut(): Cut | null {
  return useSyncExternalStore(
    subscribePhone,
    () => (window.matchMedia(PHONE_MEDIA).matches ? "phone" : "desktop"),
    () => null,
  );
}

const ROUND_BUTTON =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]";

export function WearGuide({
  steps,
  labels,
  listId,
}: {
  steps: readonly GuideStep[];
  labels: GuideLabels;
  listId: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cut = useCut();
  const [status, setStatus] = useState<Status>("idle");
  /** The video layer is up — it fades in over the poster once frames play. */
  const [shown, setShown] = useState(false);
  /** Waiting for the visitor's play (stillness asked, or autoplay refused). */
  const [manual, setManual] = useState(false);
  const [active, setActive] = useState(-1);
  const [time, setTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  /** Phone: the full step list, folded by default. */
  const [listOpen, setListOpen] = useState(false);
  const activeRef = useRef(-1);
  const inView = useRef(false);
  const userPaused = useRef(false);
  /** Start or resume on its own when visible — off once stillness is asked. */
  const autoplay = useRef(true);
  /** Time to apply once the next source has its metadata (seek before load). */
  const pendingTime = useRef<number | null>(null);
  const lastCut = useRef<Cut | null>(null);

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {
      // Refused (iOS Low Power Mode, some in-app browsers): wait for a tap.
      autoplay.current = false;
      setManual(true);
    });
  }, []);

  // iOS only autoplays a video that is muted when it loads, and React sets
  // `muted` as a property too late for WebKit to notice.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.playsInline = true;
  }, []);

  // A rotation across the breakpoint swaps cuts at the same step.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cut) return;
    const previous = lastCut.current;
    lastCut.current = cut;
    if (!previous || previous === cut) return;
    const wasPlaying = !video.paused && !video.ended;
    pendingTime.current = activeRef.current >= 0 ? CHAPTERS[cut][activeRef.current] : 0;
    video.load();
    if (wasPlaying) play();
  }, [cut, play]);

  // Play while a third of the frame is on screen; pause off-screen or in a
  // background tab.
  useEffect(() => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame || !video) return;
    const resume = () => {
      if (!inView.current || document.hidden || userPaused.current || video.ended) return;
      if (!autoplay.current) return;
      if (prefersStill()) {
        autoplay.current = false;
        setManual(true);
        return;
      }
      play();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView.current = Boolean(entry?.isIntersecting) && entry.intersectionRatio >= START_RATIO;
        if (inView.current) resume();
        else video.pause();
      },
      { threshold: [0, START_RATIO] },
    );
    observer.observe(frame);
    const onVisibility = () => (document.hidden ? video.pause() : resume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [play]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Release the decoder and the connection on unmount.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  const startByHand = () => {
    userPaused.current = false;
    autoplay.current = true;
    setManual(false);
  };

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused && !video.ended) {
      userPaused.current = true;
      video.pause();
      return;
    }
    startByHand();
    if (video.ended) video.currentTime = 0;
    play();
  };

  /** Play from `seconds`, with `step` shown as current right away. */
  const jump = (seconds: number, step: number) => {
    const video = videoRef.current;
    if (!video) return;
    startByHand();
    if (video.readyState >= 1) video.currentTime = seconds;
    else pendingTime.current = seconds;
    activeRef.current = step;
    setActive(step);
    setTime(seconds);
    play();
  };

  const seek = (step: number, { scroll = false } = {}) => {
    if (!cut) return;
    jump(CHAPTERS[cut][step], step);
    // From the folded list on a phone: bring the film back into view.
    if (scroll && cut === "phone") {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      frameRef.current?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    }
  };

  // Before step 1 "previous" replays the title card; after step 10 "next" stays.
  const previous = () => (active <= 0 ? jump(0, -1) : seek(active - 1));
  const next = () => seek(Math.min(active + 1, steps.length - 1));

  const toggleFullscreen = () => {
    const frame = frameRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    try {
      if (frame?.requestFullscreen) void frame.requestFullscreen();
      else if (frame?.webkitRequestFullscreen) frame.webkitRequestFullscreen();
      // iPhone: only the video element itself can go full screen.
      else video?.webkitEnterFullscreen?.();
    } catch {
      // Not allowed here (e.g. inside a frame): the film simply stays inline.
    }
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || pendingTime.current === null) return;
    video.currentTime = pendingTime.current;
    pendingTime.current = null;
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !cut) return;
    const step = stepAt(video.currentTime, CHAPTERS[cut]);
    if (step !== activeRef.current) {
      activeRef.current = step;
      setActive(step);
    }
    setTime(video.currentTime);
  };

  const film = WEAR_GUIDE[cut ?? "desktop"];
  const chapters = CHAPTERS[cut ?? "desktop"];
  const playing = status === "playing";
  const showCenter = status === "ended" || (manual && status !== "playing");
  const toggleLabel = playing ? labels.pause : status === "ended" ? labels.replay : labels.play;
  const toggleIcon = playing ? (
    <Pause className="h-4 w-4" aria-hidden="true" />
  ) : (
    <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden="true" />
  );
  /** How much of step i has played, 0..1 — the phone's story segments. */
  const filled = (i: number) => {
    const start = chapters[i] - LEAD;
    const end = i + 1 < chapters.length ? chapters[i + 1] - LEAD : film.duration;
    return Math.min(1, Math.max(0, (time - start) / (end - start)));
  };
  const current = active >= 0 ? steps[active] : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:items-start lg:gap-12">
      <div className="lg:sticky lg:top-28">
        <div
          ref={frameRef}
          className={[
            "relative overflow-hidden",
            // Phone: full-bleed, edge to edge like a Story. The films'
            // studio cream fills the frame before the lazy poster arrives.
            fullscreen ? "bg-black" : "-mx-5 aspect-[9/16] bg-[#f3eadf] sm:mx-0 sm:aspect-video",
          ].join(" ")}
        >
          <picture>
            <source
              media={PHONE_MEDIA}
              srcSet={WEAR_GUIDE.phone.poster}
              width={WEAR_GUIDE.phone.width}
              height={WEAR_GUIDE.phone.height}
            />
            <img
              src={WEAR_GUIDE.desktop.poster}
              alt=""
              width={WEAR_GUIDE.desktop.width}
              height={WEAR_GUIDE.desktop.height}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full ${fullscreen ? "object-contain" : "object-cover"}`}
            />
          </picture>
          <video
            ref={videoRef}
            aria-label={labels.film}
            aria-describedby={listId}
            preload="none"
            playsInline
            muted
            disablePictureInPicture
            disableRemotePlayback
            onPlaying={() => {
              setShown(true);
              setStatus("playing");
            }}
            onPause={(e) => setStatus(e.currentTarget.ended ? "ended" : "paused")}
            onEnded={() => setStatus("ended")}
            onEmptied={() => setShown(false)}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            className={[
              "absolute inset-0 h-full w-full transition-opacity duration-500 ease-out motion-reduce:transition-none",
              fullscreen ? "object-contain" : "object-cover",
            ].join(" ")}
            style={{ opacity: shown ? 1 : 0 }}
          >
            {cut &&
              [WEAR_GUIDE[cut].av1, WEAR_GUIDE[cut].h264].map(
                (file) => file && <source key={file.src} src={file.src} type={file.type} />,
              )}
          </video>

          {/* Phone: one segment per step, filling as the film plays. */}
          <div aria-hidden="true" className="absolute inset-x-3 top-3 flex gap-1 sm:hidden">
            {chapters.map((start, i) => (
              <span key={start} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-[rgba(25,25,25,0.16)]">
                <span
                  className="absolute inset-y-0 start-0 rounded-full bg-[rgba(25,25,25,0.78)] transition-[width] duration-300 ease-linear motion-reduce:transition-none"
                  style={{ width: `${filled(i) * 100}%` }}
                />
              </span>
            ))}
          </div>

          {/* Phone: tap the start edge for the previous step, the end edge
              for the next, the middle to pause — the Story gesture. Shortcuts
              only: the buttons under the film and the list do the same. */}
          <div aria-hidden="true" className="absolute inset-x-0 top-8 bottom-16 flex sm:hidden">
            <button type="button" tabIndex={-1} onClick={previous} className="h-full w-1/3 cursor-default" />
            <button type="button" tabIndex={-1} onClick={toggle} className="h-full w-1/3 cursor-default" />
            <button type="button" tabIndex={-1} onClick={next} className="h-full w-1/3 cursor-default" />
          </div>

          {showCenter && (
            <button
              type="button"
              onClick={toggle}
              className="absolute left-1/2 top-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-[rgba(25,25,25,0.74)] px-5 py-3 text-[0.9rem] font-medium text-[var(--sc-white)] backdrop-blur-sm transition-colors hover:bg-[rgba(25,25,25,0.88)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
            >
              {status === "ended" ? (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              )}
              {status === "ended" ? labels.replay : labels.play}
            </button>
          )}

          {status !== "idle" && (
            <>
              {/* Phone: two round buttons; the segments are the progress. */}
              <div className="absolute bottom-3 end-3 z-10 flex gap-2 text-[var(--sc-white)] sm:hidden">
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={toggleLabel}
                  className={`${ROUND_BUTTON} bg-[rgba(25,25,25,0.62)] backdrop-blur-sm`}
                >
                  {toggleIcon}
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={labels.fullscreen}
                  className={`${ROUND_BUTTON} bg-[rgba(25,25,25,0.62)] backdrop-blur-sm`}
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {/* Tablet and desktop: one bar, progress with a tick per step. */}
              <div className="absolute inset-x-4 bottom-4 z-10 hidden items-center gap-2 rounded-full bg-[rgba(25,25,25,0.66)] p-1 text-[var(--sc-white)] backdrop-blur-sm sm:flex">
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={toggleLabel}
                  className={`${ROUND_BUTTON} h-9 w-9 hover:bg-white/10`}
                >
                  {toggleIcon}
                </button>
                {/* The step list is the way to move in the film, so the
                    progress stays visual. */}
                <div aria-hidden="true" className="relative mx-1 h-[3px] flex-1 rounded-full bg-[rgba(242,245,239,0.24)]">
                  <div
                    className="absolute inset-y-0 start-0 rounded-full bg-[var(--sc-sun)] transition-[width] duration-300 ease-linear motion-reduce:transition-none"
                    style={{ width: `${film.duration ? (time / film.duration) * 100 : 0}%` }}
                  />
                  {chapters.map((start) => (
                    <span
                      key={start}
                      className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-[rgba(242,245,239,0.55)]"
                      style={{ insetInlineStart: `${(start / film.duration) * 100}%` }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={labels.fullscreen}
                  className={`${ROUND_BUTTON} h-9 w-9 hover:bg-white/10`}
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Phone: the current step, set like the film's own captions. The
            minimum height fits a title and a short note, so only the
            longest note (step 4) moves what lies below — never the film. */}
        <div className="mt-6 flex min-h-[9rem] items-start gap-4 sm:hidden">
          <div
            key={active}
            className="min-w-0 flex-1 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
          >
            {current ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="sc-serif text-[1.75rem] leading-none tabular-nums text-[var(--sc-sun)]">
                    {pad(active + 1)}
                  </span>
                  <span className="text-[0.8rem] tabular-nums text-[var(--sc-text-mid-on-dark)]">
                    / {pad(steps.length)}
                  </span>
                </p>
                <span aria-hidden="true" className="mt-3 block h-px w-8 bg-[var(--sc-sun)]" />
                <p className="mt-3 text-[1.08rem] leading-snug text-[var(--sc-white)]">{current.title}</p>
                {current.note && (
                  <p className="mt-2 text-[0.86rem] leading-relaxed text-[var(--sc-text-mid-on-dark)]">
                    {current.note}
                  </p>
                )}
              </>
            ) : (
              <p className="pt-1 text-[0.92rem] leading-relaxed text-[var(--sc-text-mid-on-dark)]">
                {labels.tapHint}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={previous}
              disabled={active < 0}
              aria-label={labels.previous}
              className={`${ROUND_BUTTON} h-11 w-11 border border-[rgba(242,245,239,0.22)] text-[var(--sc-white)] disabled:opacity-35`}
            >
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={next}
              disabled={active >= steps.length - 1}
              aria-label={labels.next}
              className={`${ROUND_BUTTON} h-11 w-11 border border-[rgba(242,245,239,0.22)] text-[var(--sc-white)] disabled:opacity-35`}
            >
              <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
        </div>

        {labels.captions && (
          <p className="mt-3 text-[0.8rem] text-[var(--sc-text-mid-on-dark)]">{labels.captions}</p>
        )}
      </div>

      <div>
        {/* Phone: the full list folds away; the film and its caption lead. */}
        <button
          type="button"
          onClick={() => setListOpen((open) => !open)}
          aria-expanded={listOpen}
          aria-controls={`${listId}-panel`}
          className="flex w-full items-center justify-between gap-4 border-y border-[rgba(242,245,239,0.12)] py-4 text-start text-[0.95rem] text-[var(--sc-white)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sc-sun)] sm:hidden"
        >
          {listOpen ? labels.hideSteps : labels.showSteps}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${listOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        <div id={`${listId}-panel`} className={listOpen ? "" : "hidden sm:block"}>
          <p className="hidden text-[0.88rem] text-[var(--sc-text-mid-on-dark)] sm:block">{labels.pickStep}</p>
          <ol id={listId} className="sm:mt-4 sm:border-t sm:border-[rgba(242,245,239,0.12)]">
            {steps.map((step, i) => {
              const isCurrent = i === active;
              return (
                <li key={step.title} className="border-b border-[rgba(242,245,239,0.12)]">
                  <button
                    type="button"
                    onClick={() => seek(i, { scroll: true })}
                    aria-current={isCurrent ? "step" : undefined}
                    className="group relative grid w-full grid-cols-[2.6rem_minmax(0,1fr)] gap-x-2 py-3.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-y-3 start-0 w-0.5 transition-colors ${isCurrent ? "bg-[var(--sc-sun)]" : "bg-transparent"}`}
                    />
                    <span
                      className={`sc-serif ps-3.5 pt-px text-[0.95rem] tabular-nums transition-colors ${isCurrent ? "text-[var(--sc-sun)]" : "text-[rgba(242,245,239,0.42)]"}`}
                    >
                      {pad(i + 1)}
                    </span>
                    <span>
                      <span
                        className={`block text-[0.98rem] leading-snug transition-colors ${isCurrent ? "text-[var(--sc-white)]" : "text-[rgba(242,245,239,0.8)] group-hover:text-[var(--sc-white)]"}`}
                      >
                        {step.title}
                      </span>
                      {step.note && (
                        <span className="mt-1 block text-[0.84rem] leading-relaxed text-[var(--sc-text-mid-on-dark)]">
                          {step.note}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
