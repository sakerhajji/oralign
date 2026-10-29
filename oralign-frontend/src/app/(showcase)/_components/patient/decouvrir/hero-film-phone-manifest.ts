/**
 * The phone film's files — produced by scripts/hero-film/phone.sh and
 * install_phone.py (see the README). Filenames carry a content hash because
 * public/ assets are served `immutable` for a year: a re-encode MUST
 * regenerate this file rather than overwrite a file in place.
 *
 * Shown instead of the brand film on phones held upright (PHONE_MEDIA in
 * hero-film.tsx); same loop dissolve, encoders and VMAF gate as the brand
 * film, no reframing.
 * Source: 1080x1920 H.264, 24 fps, 22.1 s, no audio -> 720x1280.
 *
 *   720x1280   AV1  731 KB (VMAF 95.15, p1 92.56)   H.264 1970 KB (VMAF 95.46, p1 93.55)
 */

import type { FilmRendition } from "./hero-film-manifest";

export const PHONE_FILM: {
  /** First frame of the phone film, so the poster hands over to it seamlessly. */
  poster: string;
  rendition: FilmRendition;
} = {
  poster: "/showcase/hero/oralign-film-phone-poster.6c28ff5c.webp",
  rendition: {
    width: 720,
    height: 1280,
    av1: {
      src: "/showcase/hero/oralign-film-phone.av1.deb32ed4.mp4",
      type: 'video/mp4; codecs="av01.0.05M.10"',
      bitrate: 280806,
    },
    h264: {
      src: "/showcase/hero/oralign-film-phone.h264.c940a50e.mp4",
      type: 'video/mp4; codecs="avc1.640028"',
      bitrate: 756859,
    },
  },
};
