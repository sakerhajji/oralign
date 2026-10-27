"""Install the final encodes into the app and write the typed manifest.

usage: python install.py <hero-video dir> <oralign-frontend dir>
"""
import shutil
import sys
from pathlib import Path

work, app = Path(sys.argv[1]), Path(sys.argv[2])
out = work / "out"
dest = app / "public" / "showcase" / "hero"
dest.mkdir(parents=True, exist_ok=True)

# Remove earlier generations so only the referenced files ship. The phone
# film (oralign-film-phone*) has its own installer and is left alone.
for old in dest.glob("oralign-film-*"):
    if not old.name.startswith("oralign-film-phone"):
        old.unlink()

rows = [line.split() for line in (out / "manifest.txt").read_text().splitlines() if line.strip()]
renditions: dict[str, dict] = {}
poster = None
for shape, codec, name, width, height, bps, codecs, vmaf_mean, vmaf_p1, vmaf_min in rows:
    shutil.copy2(out / name, dest / name)
    if shape == "poster":
        poster = name
        continue
    r = renditions.setdefault(shape, {"width": int(width), "height": int(height)})
    mime = f'video/mp4; codecs="{codecs}"'
    r[codec] = {
        "src": f"/showcase/hero/{name}",
        "type": mime,
        "bitrate": int(bps),
        "size_kb": (out / name).stat().st_size // 1024,
        "vmaf": (vmaf_mean, vmaf_p1, vmaf_min),
    }

assert poster and set(renditions) == {"tall", "portrait", "square", "wide"}, rows


def file_ts(f: dict) -> str:
    return (
        "{\n"
        f'      src: "{f["src"]}",\n'
        f"      type: '{f['type']}',\n"
        f"      bitrate: {f['bitrate']},\n"
        "    }"
    )


def rendition_ts(shape: str) -> str:
    r = renditions[shape]
    return (
        f"  {shape}: {{\n"
        f"    width: {r['width']},\n"
        f"    height: {r['height']},\n"
        f"    av1: {file_ts(r['av1'])},\n"
        f"    h264: {file_ts(r['h264'])},\n"
        "  },"
    )


table = "\n".join(
    f" *   {shape:<8} {str(renditions[shape]['width']) + 'x' + str(renditions[shape]['height']):<10}"
    f" AV1 {renditions[shape]['av1']['size_kb']:>5} KB (VMAF {renditions[shape]['av1']['vmaf'][0]}, p1 {renditions[shape]['av1']['vmaf'][1]})"
    f"   H.264 {renditions[shape]['h264']['size_kb']:>5} KB (VMAF {renditions[shape]['h264']['vmaf'][0]}, p1 {renditions[shape]['h264']['vmaf'][1]})"
    for shape in ("tall", "portrait", "square", "wide")
)

ts = f'''/**
 * The hero film's files — produced by scripts/hero-film (see its README).
 * Filenames carry a content hash because public/ assets are served
 * `immutable` for a year: a re-encode MUST regenerate this file rather than
 * overwrite a file in place.
 *
 * Source: 1920x1080 H.264, 24 fps, 21.8 s, 7.4 MB, no audio.
 *  - Loop: the last 18 frames dissolve into the first 18, so the end flows
 *    into the start; the seam is as smooth as any ordinary frame step.
 *  - Reframed per box shape; the crop follows the subject and moves only on
 *    the film's own hard cut, or while the camera itself moves. The tall
 *    (phone) cut's end card eases back to 80 % so the ORALIGN wordmark
 *    fits a phone's width (endcard.py).
 *  - AV1: SVT-AV1 preset 3, 10-bit, VQ tune. H.264: x264 veryslow, High
 *    profile, level 4.0 (hardware-decodable on older Androids), aq-mode 3
 *    for the dark gradients. Both faststart, no audio.
 *  - Quality gate: VMAF mean >= 95 and 1st-percentile frame >= 91 against
 *    the lossless reference of the same rendition.
 *
{table}
 */

export type FilmShape = "tall" | "portrait" | "square" | "wide";
export type FilmCodec = "av1" | "h264";

export type FilmFile = {{
  src: string;
  /** Full MIME type with the RFC 6381 codecs string read from the bitstream. */
  type: string;
  /** Average bits per second — mediaCapabilities.decodingInfo needs it. */
  bitrate: number;
}};

export type FilmRendition = {{ width: number; height: number }} & Record<FilmCodec, FilmFile>;

export const HERO_FILM: {{
  fps: number;
  /** First frame of the film, so the poster hands over to it seamlessly. */
  poster: string;
  /**
   * object-position of the poster AND the video; the renditions are cut at
   * this same 49 % position (see reframe.sh), so both show one window.
   */
  posterPosition: string;
  renditions: Record<FilmShape, FilmRendition>;
}} = {{
  fps: 24,
  poster: "/showcase/hero/{poster}",
  posterPosition: "49% 50%",
  renditions: {{
{chr(10).join(rendition_ts(s) for s in ("tall", "portrait", "square", "wide"))}
  }},
}};
'''
target = app / "src/app/(showcase)/_components/patient/decouvrir/hero-film-manifest.ts"
target.write_text(ts, encoding="utf-8", newline="\n")
print("manifest ecrit:", target.name)
for p in sorted(dest.iterdir()):
    print(f"  {p.name:<48} {p.stat().st_size // 1024:>6} KB")
