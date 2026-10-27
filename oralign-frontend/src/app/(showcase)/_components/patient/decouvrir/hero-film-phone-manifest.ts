/**
 * The phone film's files — produced by scripts/hero-film/phone.sh and
 * install_phone.py (see the README). Filenames carry a content hash because
 * public/ assets are served `immutable` for a year: a re-encode MUST
 * regenerate this file rather than overwrite a file in place.
 *
 * Shown instead of the brand film on phones held upright (PHONE_MEDIA in
 * hero-film.tsx). Source: 720x1280 H.264, 24 fps, 7.0 s, no audio; same
 * loop dissolve, encoders and VMAF gate as the brand film, no reframing.
 *
 *   720x1280   AV1  258 KB (VMAF 95.23, p1 93.39)   H.264  648 KB (VMAF 95.21, p1 92.83)
 */

import type { FilmRendition } from "./hero-film-manifest";

export const PHONE_FILM: {
  /** First frame of the phone film, so the poster hands over to it seamlessly. */
  poster: string;
  rendition: FilmRendition;
} = {
  poster: "/showcase/hero/oralign-film-phone-poster.c7c7119a.webp",
  rendition: {
    width: 720,
    height: 1280,
    av1: {
      src: "/showcase/hero/oralign-film-phone.av1.30bdc665.mp4",
      type: 'video/mp4; codecs="av01.0.05M.10"',
      bitrate: 336045,
    },
    h264: {
      src: "/showcase/hero/oralign-film-phone.h264.b09eaa8a.mp4",
      type: 'video/mp4; codecs="avc1.640028"',
      bitrate: 843818,
    },
  },
};
