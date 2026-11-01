"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Maximize2, Pause, Play, RotateCcw } from "lucide-react";
import { WEAR_GUIDE } from "./wear-guide-manifest";

/**
 * The wear guide: a silent instructional film and its ten steps as text.
 *
 *  - The steps are the film's chapters AND its text alternative: the step on
 *    screen is highlighted while the film plays, and choosing one plays the
 *    film from there. The film's captions are burned in, in French; the list
 *    carries the same steps in the page's language.
 *  - Phones (below the `sm` breakpoint, where the frame turns 9:16) get the
 *    9:16 cut, everything wider the 16:9 one. The choice follows the
 *    viewport: a rotation swaps cuts and resumes at the same step.
 *  - Nothing downloads with the page: the poster is a lazy WebP, the video
 *    has preload="none" and no source until hydration. Once the frame is a
 *    third on screen it plays muted (the film has no sound) — unless reduced
 *    motion or Save-Data ask for stillness, or autoplay is refused: then it
 *    waits for the play button. Off-screen or in a background tab it pauses,
 *    and it stops on its end card instead of looping.
 *  - AV1 first, H.264 second: the browser plays the first source it can
 *    decode and falls back to the next one if it fails.
 */

type Cut = "desktop" | "phone";

const PHONE_MEDIA = "(max-width: 639.98px)";

/**
 * When each step's caption is on screen, in seconds, per cut — measured on
 * the masters (frame differences in the caption area, then checked frame by
 * frame). Re-measure if a film is re-cut: the two cuts drift apart after
 * step 5.
 */
const CHAPTERS: Record<Cut, readonly number[]> = {
  desktop: [4.4, 8.4, 12.5, 17.1, 31.0, 39.5, 44.6, 48.8, 53.3, 57.9],
  phone: [4.5, 8.5, 12.5, 17.1, 29.1, 37.5, 42.6, 46.0, 49.8, 54.5],
};

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
  pickStep: string;
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
  const [progress, setProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
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

  const seek = (step: number) => {
    const video = videoRef.current;
    if (!video || !cut) return;
    startByHand();
    const time = CHAPTERS[cut][step];
    if (video.readyState >= 1) video.currentTime = time;
    else pendingTime.current = time;
    activeRef.current = step;
    setActive(step);
    play();
    // On a phone the list sits under the film: bring the film back to view.
    if (cut === "phone") {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      frameRef.current?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    }
  };

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
    setProgress(video.duration ? video.currentTime / video.duration : 0);
  };

  const film = WEAR_GUIDE[cut ?? "desktop"];
  const playing = status === "playing";
  const showCenter = status === "ended" || (manual && status !== "playing");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:items-start lg:gap-12">
      <div className="lg:sticky lg:top-28">
        <div
          ref={frameRef}
          className={[
            "relative overflow-hidden",
            // The films' studio cream, so the frame reads as the film before
            // the lazy poster arrives.
            fullscreen ? "bg-black" : "aspect-[9/16] bg-[#f3eadf] sm:aspect-video",
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
              (["av1", "h264"] as const).map((codec) => (
                <source key={`${cut}-${codec}`} src={WEAR_GUIDE[cut][codec].src} type={WEAR_GUIDE[cut][codec].type} />
              ))}
          </video>

          {showCenter && (
            <button
              type="button"
              onClick={toggle}
              className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-[rgba(25,25,25,0.74)] px-5 py-3 text-[0.9rem] font-medium text-[var(--sc-white)] backdrop-blur-sm transition-colors hover:bg-[rgba(25,25,25,0.88)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
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
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full bg-[rgba(25,25,25,0.66)] p-1 text-[var(--sc-white)] backdrop-blur-sm sm:inset-x-4 sm:bottom-4">
              <button
                type="button"
                onClick={toggle}
                // The label names the action and changes with it.
                aria-label={playing ? labels.pause : status === "ended" ? labels.replay : labels.play}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--sc-sun)]"
              >
                {playing ? (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden="true" />
                )}
              </button>
              {/* Progress, with a tick where each step begins. The step list
                  is the way to move in the film, so this stays visual. */}
              <div aria-hidden="true" className="relative mx-1 h-[3px] flex-1 rounded-full bg-[rgba(242,245,239,0.24)]">
                <div
                  className="absolute inset-y-0 start-0 rounded-full bg-[var(--sc-sun)] transition-[width] duration-300 ease-linear motion-reduce:transition-none"
                  style={{ width: `${progress * 100}%` }}
                />
                {CHAPTERS[cut ?? "desktop"].map((start) => (
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--sc-sun)]"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        {labels.captions && (
          <p className="mt-3 text-[0.8rem] text-[var(--sc-text-mid-on-dark)]">{labels.captions}</p>
        )}
      </div>

      <div>
        <p className="text-[0.88rem] text-[var(--sc-text-mid-on-dark)]">{labels.pickStep}</p>
        <ol id={listId} className="mt-4 border-t border-[rgba(242,245,239,0.12)]">
          {steps.map((step, i) => {
            const current = i === active;
            return (
              <li key={step.title} className="border-b border-[rgba(242,245,239,0.12)]">
                <button
                  type="button"
                  onClick={() => seek(i)}
                  aria-current={current ? "step" : undefined}
                  className="group relative grid w-full grid-cols-[2.6rem_minmax(0,1fr)] gap-x-2 py-3.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-3 start-0 w-0.5 transition-colors ${current ? "bg-[var(--sc-sun)]" : "bg-transparent"}`}
                  />
                  <span
                    className={`sc-serif ps-3.5 pt-px text-[0.95rem] tabular-nums transition-colors ${current ? "text-[var(--sc-sun)]" : "text-[rgba(242,245,239,0.42)]"}`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span
                      className={`block text-[0.98rem] leading-snug transition-colors ${current ? "text-[var(--sc-white)]" : "text-[rgba(242,245,239,0.8)] group-hover:text-[var(--sc-white)]"}`}
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
  );
}
