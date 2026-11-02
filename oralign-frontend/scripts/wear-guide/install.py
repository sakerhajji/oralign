"""Install the wear guide films into the app and write their typed manifest.

usage: python install.py <scratch dir> <oralign-frontend dir>
(run encode.sh in <scratch dir> first)

A film this run did not encode keeps its files and its manifest entry.
"""
import re
import shutil
import sys
from pathlib import Path

FILMS = ("desktop", "phone")

work, app = Path(sys.argv[1]), Path(sys.argv[2])
out = work / "out"
dest = app / "public" / "showcase" / "wear-guide"
dest.mkdir(parents=True, exist_ok=True)
target = app / "src/app/(showcase)/_components/patient/decouvrir/wear-guide-manifest.ts"
previous = target.read_text(encoding="utf-8") if target.exists() else ""

rows = [line.split() for line in (out / "manifest.txt").read_text().splitlines() if line.strip()]
encoded = {row[0] for row in rows}

# Remove the earlier generation of each film redone here, so only the
# referenced files ship.
for film in encoded:
    for old in dest.glob(f"oralign-wear-guide-{film}[.-]*"):
        old.unlink()

films: dict[str, dict] = {}
for film, codec, name, width, height, bps, codecs, mean, p1, vmin, dur in rows:
    shutil.copy2(out / name, dest / name)
    f = films.setdefault(film, {"width": int(width), "height": int(height)})
    if codec == "poster":
        f["poster"] = f"/showcase/wear-guide/{name}"
        continue
    f["duration"] = round(float(dur), 2)
    f[codec] = {
        "src": f"/showcase/wear-guide/{name}",
        "type": f'video/mp4; codecs="{codecs}"',
        "bitrate": int(bps),
        "size_kb": (out / name).stat().st_size // 1024,
        "vmaf": (mean, p1),
    }

for f in films.values():
    # AV1 is optional (encode.sh `none`): the browser then plays the H.264.
    assert {"poster", "h264"} <= set(f), f


def kept(name: str) -> tuple[str, str]:
    """The manifest block and table row of a film this run did not touch."""
    block = re.search(rf"^  {name}: \{{.*?^  \}},$", previous, re.S | re.M)
    row = re.search(rf"^ \*   {name} .*$", previous, re.M)
    assert block and row, f"{name}: not encoded in this run and not in the current manifest"
    return block.group(0), row.group(0)


def file_ts(f: dict) -> str:
    return (
        "{\n"
        f'      src: "{f["src"]}",\n'
        f"      type: '{f['type']}',\n"
        f"      bitrate: {f['bitrate']},\n"
        "    }"
    )


def film_ts(name: str) -> str:
    if name not in films:
        return kept(name)[0]
    f = films[name]
    return (
        f"  {name}: {{\n"
        f"    width: {f['width']},\n"
        f"    height: {f['height']},\n"
        f"    duration: {f['duration']},\n"
        f'    poster: "{f["poster"]}",\n'
        + (f"    av1: {file_ts(f['av1'])},\n" if "av1" in f else "")
        + f"    h264: {file_ts(f['h264'])},\n"
        "  },"
    )


def row(name: str) -> str:
    if name not in films:
        return kept(name)[1]
    f = films[name]
    cells = "   ".join(
        f"{label} {f[c]['size_kb']:>5} KB (VMAF {f[c]['vmaf'][0]}, p1 {f[c]['vmaf'][1]})"
        for c, label in (("av1", "AV1"), ("h264", "H.264"))
        if c in f
    )
    return f" *   {name:<8} {f['width']}x{f['height']}  {cells}"


ts = f'''/**
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
{row("desktop")}
{row("phone")}
 */

import type {{ FilmFile }} from "./hero-film-manifest";

export type GuideFilm = {{
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  /** The title card, 2 s in, same size as the video. */
  poster: string;
  /** Absent when an AV1 would not be meaningfully smaller (see encode.sh). */
  av1?: FilmFile;
  h264: FilmFile;
}};

export const WEAR_GUIDE: Record<"desktop" | "phone", GuideFilm> = {{
{film_ts("desktop")}
{film_ts("phone")}
}};
'''
target.write_text(ts, encoding="utf-8", newline="\n")
print("manifest ecrit:", target.name)
for p in sorted(dest.iterdir()):
    print(f"  {p.name:<52} {p.stat().st_size // 1024:>6} KB")
