"""Install the phone film's encodes into the app and write its typed manifest.

usage: python install_phone.py <phone-film dir> <oralign-frontend dir>
(run phone.sh in <phone-film dir> first)
"""
import shutil
import sys
from pathlib import Path

work, app = Path(sys.argv[1]), Path(sys.argv[2])
out = work / "out"
dest = app / "public" / "showcase" / "hero"
dest.mkdir(parents=True, exist_ok=True)

# Remove the earlier generation so only the referenced files ship.
for old in dest.glob("oralign-film-phone*"):
    old.unlink()

rows = [line.split() for line in (out / "manifest.txt").read_text().splitlines() if line.strip()]
rendition: dict = {}
poster = None
for shape, codec, name, width, height, bps, codecs, vmaf_mean, vmaf_p1, vmaf_min in rows:
    shutil.copy2(out / name, dest / name)
    if shape == "poster":
        poster = name
        continue
    assert shape == "phone", rows
    rendition.update(width=int(width), height=int(height))
    rendition[codec] = {
        "src": f"/showcase/hero/{name}",
        "type": f'video/mp4; codecs="{codecs}"',
        "bitrate": int(bps),
        "size_kb": (out / name).stat().st_size // 1024,
        "vmaf": (vmaf_mean, vmaf_p1),
    }

assert poster and {"av1", "h264"} <= set(rendition), rows


def file_ts(f: dict) -> str:
    return (
        "{\n"
        f'      src: "{f["src"]}",\n'
        f"      type: '{f['type']}',\n"
        f"      bitrate: {f['bitrate']},\n"
        "    }"
    )


def line(codec: str, label: str) -> str:
    f = rendition[codec]
    return f"{label} {f['size_kb']:>4} KB (VMAF {f['vmaf'][0]}, p1 {f['vmaf'][1]})"


# phone.sh records the source (ffprobe key=value lines).
src = dict(l.split("=", 1) for l in (out / "source.txt").read_text().split() if "=" in l)
num, den = src["r_frame_rate"].split("/")
codec_label = {"h264": "H.264", "hevc": "HEVC", "av1": "AV1"}.get(src["codec_name"], src["codec_name"])
source = (
    f"{src['width']}x{src['height']} {codec_label}, "
    f"{round(int(num) / int(den))} fps, {float(src['duration']):.1f} s"
)


ts = f'''/**
 * The phone film's files — produced by scripts/hero-film/phone.sh and
 * install_phone.py (see the README). Filenames carry a content hash because
 * public/ assets are served `immutable` for a year: a re-encode MUST
 * regenerate this file rather than overwrite a file in place.
 *
 * Shown instead of the brand film on phones held upright (PHONE_MEDIA in
 * hero-film.tsx); same loop dissolve, encoders and VMAF gate as the brand
 * film, no reframing.
 * Source: {source}, no audio -> {rendition['width']}x{rendition['height']}.
 *
 *   {rendition['width']}x{rendition['height']}   {line('av1', 'AV1')}   {line('h264', 'H.264')}
 */

import type {{ FilmRendition }} from "./hero-film-manifest";

export const PHONE_FILM: {{
  /** First frame of the phone film, so the poster hands over to it seamlessly. */
  poster: string;
  rendition: FilmRendition;
}} = {{
  poster: "/showcase/hero/{poster}",
  rendition: {{
    width: {rendition['width']},
    height: {rendition['height']},
    av1: {file_ts(rendition['av1'])},
    h264: {file_ts(rendition['h264'])},
  }},
}};
'''
target = app / "src/app/(showcase)/_components/patient/decouvrir/hero-film-phone-manifest.ts"
target.write_text(ts, encoding="utf-8", newline="\n")
print("manifest ecrit:", target.name)
for p in sorted(dest.glob("oralign-film-phone*")):
    print(f"  {p.name:<48} {p.stat().st_size // 1024:>6} KB")
