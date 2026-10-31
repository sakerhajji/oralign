"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import { Pause, Play } from "lucide-react";
import {
  HERO_FILM,
  type FilmCodec,
  type FilmRendition,
  type FilmShape,
} from "./hero-film-manifest";

/**
 * The brand film behind the home hero.
 *
 * Built so the page never waits for it and never shows a broken frame:
 *
 *  - The poster (first frame of the film) is a preloaded 22 KB WebP — it is
 *    the LCP element. The video
 *    mounts after hydration, on an idle callback, and fades in only once
 *    frames are actually playing, so there is no black flash and no
 *    competition with the critical path.
 *  - Four renditions, pre-cropped to the SHAPE of the box they fill
 *    (9:16 phones, 4:5 tablets in portrait, square, 16:9 desktop): nobody
 *    downloads pixels that object-fit would crop away. The shape is the
 *    narrowest one at least as wide as the measured box, re-chosen when a
 *    resize changes it — see shapeFor for why that also makes the fade-in
 *    invisible. Nothing downloads until the box is near the viewport.
 *  - Every viewport plays the same brand film. Responsive renditions only
 *    change the crop and resolution, never the content or timeline.
 *  - Two codecs per rendition, AV1 (half the bytes) and H.264: whichever
 *    the device decodes in HARDWARE, AV1 first — a looping film decoded in
 *    software drains the battery of phones without an AV1 decoder. With no
 *    hardware path, the smaller AV1. If neither would be smooth, the poster
 *    stays — a still image beats a stuttering film. A file that fails to
 *    load or decode falls back to H.264, then to the poster.
 *  - The film loops on itself without a cut: its last frames dissolve into
 *    its first ones (see the encode notes in the manifest).
 *  - Off-screen or in a background tab it pauses, so it costs no battery
 *    while nobody watches. A visible pause control satisfies WCAG 2.2.2.
 *  - prefers-reduced-motion or Save-Data: no autoplay and no download —
 *    the poster stays, with a play control for whoever wants the film.
 */

type Labels = { alt: string; play: string; pause: string };

type Status =
  /** Nothing loaded yet (deciding, or waiting for an explicit play). */
  | "idle"
  | "playing"
  /** Paused by the visitor — scroll or tab changes must not restart it. */
  | "paused"
  /** Autoplay refused (e.g. iOS Low Power Mode) or decode not smooth. */
  | "blocked";

const IDLE_TIMEOUT_MS = 1200;
const RESIZE_DEBOUNCE_MS = 250;
/** Start downloading when the box is this close to the viewport. */
const PRELOAD_MARGIN = "300px 0px";

const SHAPES_BY_ASPECT = (Object.keys(HERO_FILM.renditions) as FilmShape[]).sort(
  (a, b) =>
    HERO_FILM.renditions[a].width / HERO_FILM.renditions[a].height -
    HERO_FILM.renditions[b].width / HERO_FILM.renditions[b].height,
);

/**
 * The narrowest rendition at least as wide (in aspect) as the box.
 *
 * Such a rendition fills the box height-first under object-fit: cover —
 * exactly like the 16:9 poster beneath it. Each rendition is cut at the
 * poster's 49 % position and drawn at that same object-position, so the
 * frame the video fades in on is the frame already on screen. It is
 * also the rendition that wastes the fewest pixels. Wider than 16:9, the
 * wide cut is the only one left.
 */
function shapeFor(box: DOMRect): FilmShape {
  const aspect = box.width / Math.max(box.height, 1);
  return (
    SHAPES_BY_ASPECT.find((shape) => {
      const r = HERO_FILM.renditions[shape];
      return r.width / r.height >= aspect - 0.005;
    }) ?? SHAPES_BY_ASPECT[SHAPES_BY_ASPECT.length - 1]
  );
}

function renditionFor(shape: FilmShape): FilmRendition {
  return HERO_FILM.renditions[shape];
}

/** Data-saving or very slow connection: never spend the visitor's bytes uninvited. */
function prefersLightPage(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return Boolean(connection?.saveData) || /(^|-)2g$/.test(connection?.effectiveType ?? "");
}

/**
 * The codec to play this rendition in, or null if neither would be smooth.
 *
 * mediaCapabilities answers for the actual resolution and bitrate, but its
 * `smooth` is optimistic until the browser has decode history (Chromium says
 * true on a first visit), so on its own it would send AV1 to every phone
 * that decodes it in software. `powerEfficient` is the hardware signal and
 * wins; without one, the smaller AV1. Older browsers without
 * mediaCapabilities fall back to canPlayType.
 */
async function pickCodec(rendition: FilmRendition): Promise<FilmCodec | null> {
  const probe = document.createElement("video");
  const capabilities = navigator.mediaCapabilities;
  const software: FilmCodec[] = [];
  for (const codec of ["av1", "h264"] as const) {
    const file = rendition[codec];
    if (!probe.canPlayType(file.type)) continue;
    if (!capabilities?.decodingInfo) return codec;
    try {
      const info = await capabilities.decodingInfo({
        type: "file",
        video: {
          contentType: file.type,
          width: rendition.width,
          height: rendition.height,
          bitrate: file.bitrate,
          framerate: HERO_FILM.fps,
        },
      });
      if (!info.supported || !info.smooth) continue;
      if (info.powerEfficient) return codec;
      software.push(codec);
    } catch {
      software.push(codec);
    }
  }
  return software[0] ?? null;
}

export function HeroFilm({ labels }: { labels: Labels }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  /** Autoplay is off (reduced motion / Save-Data): wait for the button. */
  const [manual, setManual] = useState(false);
  const inView = useRef(true);
  const userPaused = useRef(false);
  const shape = useRef<FilmShape | null>(null);

  /**
   * Pick the rendition + codec for the current box and load it. `optIn`:
   * the visitor pressed play, so a device that would not be smooth still
   * gets the H.264 file rather than nothing.
   */
  const load = useCallback(async (optIn = false) => {
    const box = boxRef.current;
    if (!box) return;
    const nextShape = shapeFor(box.getBoundingClientRect());
    if (nextShape === shape.current) return;
    const rendition = renditionFor(nextShape);
    const codec = (await pickCodec(rendition)) ?? (optIn ? "h264" : null);
    if (!codec) {
      setStatus("blocked");
      return;
    }
    shape.current = nextShape;
    setSrc(rendition[codec].src);
    // Only now, batched with the source: until here `manual` keeps the play
    // button mounted, so the button the visitor just pressed keeps focus.
    setManual(false);
  }, []);

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || userPaused.current || !inView.current || document.hidden) return;
    video.play().then(
      () => setStatus("playing"),
      // Autoplay refused: the poster stays and the button offers to play.
      () => setStatus("blocked"),
    );
  }, []);

  // Decide once the page is idle — the film must never delay first paint —
  // and download only once the box comes near the viewport: a page restored
  // further down (back navigation) does not pay for a film nobody sees.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let near: IntersectionObserver | undefined;
    const start = () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || prefersLightPage()) {
        setManual(true);
        return;
      }
      near = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          near?.disconnect();
          void load();
        },
        { rootMargin: PRELOAD_MARGIN },
      );
      near.observe(box);
    };
    let cancelIdle: () => void;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const id = setTimeout(start, 200);
      cancelIdle = () => clearTimeout(id);
    }
    return () => {
      cancelIdle();
      near?.disconnect();
    };
  }, [load]);

  // Configure the element BEFORE it gets a source: iOS only autoplays a
  // video that is muted at load time, and React sets `muted` as a property
  // late enough for WebKit to miss it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const resumeAt = video.currentTime;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.playsInline = true;
    video.src = src;
    const onReady = () => {
      // A rendition swap after a resize keeps the film where it was.
      if (resumeAt > 0 && resumeAt < video.duration) video.currentTime = resumeAt;
      tryPlay();
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    return () => video.removeEventListener("loadedmetadata", onReady);
  }, [src, tryPlay]);

  // Pause while off-screen or in a background tab; resume when back.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const sync = () => {
      const video = videoRef.current;
      if (!video?.src) return;
      if (!inView.current || document.hidden) video.pause();
      else tryPlay();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView.current = Boolean(entry?.isIntersecting);
      sync();
    });
    observer.observe(box);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [tryPlay]);

  // A resize that changes the box's shape (phone rotation, window drag)
  // swaps to the matching rendition.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || manual) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (shape.current) void load();
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(box);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [load, manual]);

  // Release the decoder and the network connection on unmount.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (status === "playing" && video) {
      userPaused.current = true;
      video.pause();
      setStatus("paused");
      return;
    }
    userPaused.current = false;
    if (!src) {
      // Reduced motion / Save-Data: the click is the opt-in.
      void load(true);
      return;
    }
    tryPlay();
  };

  const onError = () => {
    setShown(false);
    const rendition = shape.current ? renditionFor(shape.current) : null;
    // AV1 that fails to load or decode: one retry with the same cut in H.264.
    if (rendition && src === rendition.av1.src) {
      setSrc(rendition.h264.src);
      return;
    }
    // Nothing left that could play: drop the source, which also removes the
    // button — a play control that can only fail is worse than none.
    setStatus("blocked");
    setSrc(null);
  };

  const showControl = src !== null || manual;
  const playing = status === "playing";

  // The desktop brand-film poster is the LCP element on every viewport
  // (React hoists this into <head>, like next/image's `preload`).
  preload(HERO_FILM.poster, { as: "image", fetchPriority: "high" });

  return (
    <div ref={boxRef} className="absolute inset-0">
      {/* Final WebPs straight from scripts/hero-film, not the image
          optimizer: the 1920 px brand poster is drawn height-first in any
          box narrower than 16:9 and needs all its pixels on tablets, and a
          static file is cached immutable — no optimizer encode after a
          deploy, no revalidation on return visits. */}
      <img
        src={HERO_FILM.poster}
        alt={labels.alt}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: HERO_FILM.posterPosition }}
      />
      <video
        ref={videoRef}
        aria-hidden="true"
        tabIndex={-1}
        loop
        // play() pulls the rest; if autoplay is refused (in-app browsers,
        // data saver) the visitor has not paid for a film they never see.
        preload="metadata"
        disablePictureInPicture
        disableRemotePlayback
        onPlaying={() => setShown(true)}
        onError={onError}
        // pointer-events-none: no native context menu ("Show controls",
        // scrubbing) that would desync the film from the poster and button.
        className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none"
        // Same position as the poster: with the crops cut at that position
        // too, both layers show the same window of the film in any box.
        style={{ opacity: shown ? 1 : 0, objectPosition: HERO_FILM.posterPosition }}
      />
      {showControl && (
        <button
          type="button"
          onClick={toggle}
          // The label names the ACTION and changes with it — so no
          // aria-pressed, which would contradict it for screen readers.
          aria-label={playing ? labels.pause : labels.play}
          // lg:end-24 keeps it clear of the fixed language rail (lg:end-6,
          // ~50 px wide, z-30), which would otherwise cover it mid-scroll.
          className="absolute bottom-4 end-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(25,25,25,0.6)] text-[var(--sc-white)] transition-colors hover:bg-[rgba(25,25,25,0.8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)] sm:bottom-6 sm:end-6 lg:bottom-8 lg:end-24"
        >
          {playing ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
