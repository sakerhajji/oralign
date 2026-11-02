/**
 * The wear guide films ("Comment porter vos aligneurs" section) — produced
 * by scripts/wear-guide (encode.sh + install.py). Filenames carry a content
 * hash because public/ assets are served `immutable` for a year: a re-encode
 * MUST regenerate this file rather than overwrite a file in place.
 *
 * Silent, 24 fps, BT.709, no audio track. Keyframes for the step list's
 * seeks: H.264 every 2 s (a source already in web H.264 is shipped as is,
 * with its own), AV1 every 4 s. Quality gate: VMAF mean >= 95 and
 * 1st-percentile frame >= 91 against the lossless reference of the same size.
 *
 *   desktop  1920x1080  AV1  4263 KB (VMAF 96.85, p1 91.28)   H.264  8138 KB (VMAF 96.23, p1 91.39)
 *   phone    720x1280  H.264  3639 KB (VMAF 98.11, p1 97.43)
 */

import type { FilmFile } from "./hero-film-manifest";

export type GuideFilm = {
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  /** The title card, 2 s in, same size as the video. */
  poster: string;
  /** Absent when an AV1 would not be meaningfully smaller (see encode.sh). */
  av1?: FilmFile;
  h264: FilmFile;
};

export const WEAR_GUIDE: Record<"desktop" | "phone", GuideFilm> = {
  desktop: {
    width: 1920,
    height: 1080,
    duration: 65.04,
    poster: "/showcase/wear-guide/oralign-wear-guide-desktop-poster.af6e14ff.webp",
    av1: {
      src: "/showcase/wear-guide/oralign-wear-guide-desktop.av1.b8a32954.mp4",
      type: 'video/mp4; codecs="av01.0.08M.10"',
      bitrate: 537011,
    },
    h264: {
      src: "/showcase/wear-guide/oralign-wear-guide-desktop.h264.c29f45d1.mp4",
      type: 'video/mp4; codecs="avc1.640028"',
      bitrate: 1024991,
    },
  },
  phone: {
    width: 720,
    height: 1280,
    duration: 65.04,
    poster: "/showcase/wear-guide/oralign-wear-guide-phone-poster.71115322.webp",
    h264: {
      src: "/showcase/wear-guide/oralign-wear-guide-phone.h264.85d6c83b.mp4",
      type: 'video/mp4; codecs="avc1.4D401F"',
      bitrate: 458400,
    },
  },
};
