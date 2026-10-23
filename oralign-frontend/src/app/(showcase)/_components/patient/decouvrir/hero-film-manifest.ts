/**
 * The hero film's files — produced by scripts/hero-film (see its README).
 * Filenames carry a content hash because public/ assets are served
 * `immutable` for a year: a re-encode MUST regenerate this file rather than
 * overwrite a file in place.
 *
 * Source: 1920x1080 H.264, 24 fps, 21.8 s, 7.4 MB, no audio.
 *  - Loop: the last 18 frames dissolve into the first 18, so the end flows
 *    into the start; the seam is as smooth as any ordinary frame step.
 *  - Reframed per box shape; the crop follows the subject and moves only on
 *    the film's own hard cut, or while the camera itself moves.
 *  - AV1: SVT-AV1 preset 3, 10-bit, VQ tune. H.264: x264 veryslow, High
 *    profile, level 4.0 (hardware-decodable on older Androids), aq-mode 3
 *    for the dark gradients. Both faststart, no audio.
 *  - Quality gate: VMAF mean >= 95 and 1st-percentile frame >= 91 against
 *    the lossless reference of the same rendition.
 *
 *   tall     608x1080   AV1   708 KB (VMAF 96.26, p1 91.33)   H.264  1532 KB (VMAF 95.58, p1 92.40)
 *   portrait 864x1080   AV1   815 KB (VMAF 96.59, p1 93.51)   H.264  1724 KB (VMAF 95.39, p1 91.52)
 *   square   1080x1080  AV1   857 KB (VMAF 96.27, p1 92.92)   H.264  2020 KB (VMAF 95.41, p1 91.79)
 *   wide     1920x1080  AV1  1005 KB (VMAF 96.02, p1 92.90)   H.264  2571 KB (VMAF 95.10, p1 91.86)
 */

export type FilmShape = "tall" | "portrait" | "square" | "wide";
export type FilmCodec = "av1" | "h264";

export type FilmFile = {
  src: string;
  /** Full MIME type with the RFC 6381 codecs string read from the bitstream. */
  type: string;
  /** Average bits per second — mediaCapabilities.decodingInfo needs it. */
  bitrate: number;
};

export type FilmRendition = { width: number; height: number } & Record<FilmCodec, FilmFile>;

export const HERO_FILM: {
  fps: number;
  /** First frame of the film, so the poster hands over to it seamlessly. */
  poster: string;
  /**
   * object-position of the poster AND the video; the renditions are cut at
   * this same 49 % position (see reframe.sh), so both show one window.
   */
  posterPosition: string;
  renditions: Record<FilmShape, FilmRendition>;
} = {
  fps: 24,
  poster: "/showcase/hero/oralign-film-poster.b29a21bd.webp",
  posterPosition: "49% 50%",
  renditions: {
  tall: {
    width: 608,
    height: 1080,
    av1: {
      src: "/showcase/hero/oralign-film-tall.av1.98265164.mp4",
      type: 'video/mp4; codecs="av01.0.04M.10"',
      bitrate: 275193,
    },
    h264: {
      src: "/showcase/hero/oralign-film-tall.h264.cbb328ad.mp4",
      type: 'video/mp4; codecs="avc1.640028"',
      bitrate: 595629,
    },
  },
  portrait: {
    width: 864,
    height: 1080,
    av1: {
      src: "/showcase/hero/oralign-film-portrait.av1.06cbc52b.mp4",
      type: 'video/mp4; codecs="av01.0.05M.10"',
      bitrate: 316979,
    },
    h264: {
      src: "/showcase/hero/oralign-film-portrait.h264.3aad27d1.mp4",
      type: 'video/mp4; codecs="avc1.640028"',
      bitrate: 670009,
    },
  },
  square: {
    width: 1080,
    height: 1080,
    av1: {
      src: "/showcase/hero/oralign-film-square.av1.265104bd.mp4",
      type: 'video/mp4; codecs="av01.0.08M.10"',
      bitrate: 333153,
    },
    h264: {
      src: "/showcase/hero/oralign-film-square.h264.95643898.mp4",
      type: 'video/mp4; codecs="avc1.640028"',
      bitrate: 785240,
    },
  },
  wide: {
    width: 1920,
    height: 1080,
    av1: {
      src: "/showcase/hero/oralign-film-wide.av1.3d4ddd75.mp4",
      type: 'video/mp4; codecs="av01.0.08M.10"',
      bitrate: 390718,
    },
    h264: {
      src: "/showcase/hero/oralign-film-wide.h264.424e6e06.mp4",
      type: 'video/mp4; codecs="avc1.640028"',
      bitrate: 999101,
    },
  },
  },
};
