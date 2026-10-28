"use client";

import { getImageProps } from "next/image";
import { useEffect, useRef } from "react";

/**
 * The laser-trimming film behind the Precision section.
 *
 * Two cuts of the same 35 s footage (no audio): 16:9 for desktop and
 * tablet, 9:16 for phones. Each comes as AV1 (encoded here, VMAF ≥ 95
 * against the delivered file) and as the delivered H.264, byte for byte.
 * Filenames carry a content hash: public/ is served immutable for a year.
 *
 *   desktop 1920x1080  AV1 5.3 MB (VMAF 95.4)   H.264 7.9 MB
 *   mobile   720x1280  AV1 3.1 MB (VMAF 95.3)   H.264 5.6 MB
 *
 * Built so the page never pays for what it does not show:
 *  - The section renders one film per layout (`media`): the full-bleed
 *    desktop one and the stacked phone/tablet one. Only the instance whose
 *    layout is on screen ever gets a source — never both.
 *  - Nothing downloads until the section is within 300 px of the viewport;
 *    the film pauses when it leaves it and when the tab is hidden.
 *  - AV1 only where the device decodes it efficiently (mediaCapabilities),
 *    H.264 otherwise.
 *  - The poster (art-directed per viewport, optimised by next/image) stays
 *    underneath; the video fades in once frames actually play, so there is
 *    no black flash. Reduced motion, Save-Data, a refused autoplay or a
 *    failed load all leave the poster in place.
 *  - State goes to the element (data attributes), not React state: no
 *    re-render while scrolling.
 */

type Cut = { av1: string; h264: string; av1Type: string; h264Type: string };

const FILM: Record<"desktop" | "mobile", Cut> = {
  desktop: {
    av1: "/showcase/precision/oralign-laser-desktop.av1.27a669c2.mp4",
    h264: "/showcase/precision/oralign-laser-desktop.h264.96127431.mp4",
    av1Type: 'video/mp4; codecs="av01.0.08M.10"',
    h264Type: 'video/mp4; codecs="avc1.640028"',
  },
  mobile: {
    av1: "/showcase/precision/oralign-laser-mobile.av1.c011b94a.mp4",
    h264: "/showcase/precision/oralign-laser-mobile.h264.c7559335.mp4",
    av1Type: 'video/mp4; codecs="av01.0.05M.10"',
    h264Type: 'video/mp4; codecs="avc1.640028"',
  },
};

const POSTER = {
  desktop: "/showcase/precision/oralign-laser-poster-desktop.a38cf74c.jpg",
  mobile: "/showcase/precision/oralign-laser-poster-mobile.ef3b9239.jpg",
};

/** Phones get the 9:16 cut; tablets and desktops the 16:9 one. */
const PHONE = "(max-width: 767.98px)";

async function pickSource(cut: Cut, size: { width: number; height: number }): Promise<string> {
  const video = document.createElement("video");
  if (!video.canPlayType(cut.av1Type)) return cut.h264;
  try {
    const info = await navigator.mediaCapabilities?.decodingInfo({
      type: "file",
      video: { contentType: cut.av1Type, ...size, bitrate: 1_200_000, framerate: 25 },
    });
    // Software AV1 drains phone batteries: only with a hardware path.
    return info?.supported && info.powerEfficient ? cut.av1 : cut.h264;
  } catch {
    return cut.h264;
  }
}

export function PrecisionFilm({
  media,
  label,
  className = "",
}: {
  /** The layout this instance belongs to; it stays idle outside it. */
  media: string;
  /** Describes the footage (the poster's alt). */
  label: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const video = videoRef.current;
    if (!box || !video) return;
    if (!window.matchMedia(media).matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    // iOS only autoplays inline, muted video — set as properties too:
    // React does not reflect `muted` to the attribute.
    video.muted = true;
    video.playsInline = true;

    let visible = false;
    let loading = false;
    const phone = window.matchMedia(PHONE).matches;
    const cut = phone ? FILM.mobile : FILM.desktop;
    const size = phone ? { width: 720, height: 1280 } : { width: 1920, height: 1080 };

    const play = () => {
      if (visible && !document.hidden && video.src) video.play().catch(() => {});
    };
    const onPlaying = () => {
      video.dataset.ready = "true";
    };
    const onVisibility = () => (document.hidden ? video.pause() : play());

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (!visible) {
          video.pause();
          return;
        }
        if (video.src) {
          play();
        } else if (!loading) {
          loading = true;
          void pickSource(cut, size).then((src) => {
            video.src = src;
            play();
          });
        }
      },
      // Start fetching a little before the section scrolls in.
      { rootMargin: "300px 0px" },
    );

    video.addEventListener("playing", onPlaying);
    document.addEventListener("visibilitychange", onVisibility);
    io.observe(box);
    return () => {
      io.disconnect();
      video.removeEventListener("playing", onPlaying);
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
    };
  }, [media]);

  // Art-directed poster: the 9:16 frame on phones, the 16:9 one above.
  const common = { alt: label, sizes: "100vw", quality: 75 };
  const {
    props: { srcSet: desktopSrcSet },
  } = getImageProps({ ...common, src: POSTER.desktop, width: 1920, height: 1080 });
  const {
    props: { srcSet: mobileSrcSet, ...img },
  } = getImageProps({ ...common, src: POSTER.mobile, width: 720, height: 1280 });

  return (
    <div ref={boxRef} className={`absolute inset-0 overflow-hidden ${className}`}>
      <picture>
        <source media={PHONE} srcSet={mobileSrcSet} />
        <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
        {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
        <img {...img} className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <video
        ref={videoRef}
        aria-hidden="true"
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-out data-[ready=true]:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}
