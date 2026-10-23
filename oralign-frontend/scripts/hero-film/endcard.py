"""Pull the film back on its end card, for the tall (phone) cut only.

A phone shows the film full height on a ~0.5-aspect screen: only ~520-540
of the 1920 source columns. From master t = 19.3 s the ORALIGN wordmark is
550 px wide (+ the ®), so on every phone its first and last letters were
cut. Here, while the camera pushes toward the logo (master t 17.6 -> 19.3 s),
the frame eases back to SCALE (0.80), so the wordmark keeps ~6 % margin on
each side of a 0.48-aspect screen. The bands this opens at the top and
bottom are filled with a blurred, slightly darker extension of the same
frame, feathered into it.

Applied to the SOURCE, before master.sh's loop dissolve: the zoomed-out tail
then simply crossfades into the untouched opening frames, so the loop seam
stays a plain dissolve.

Each Y/U/V plane is resampled on its own (Pillow LANCZOS with a float source
box: sub-pixel exact, so no zoompan-style jitter, and no colour conversion).

usage: python endcard.py <raw yuv420p frames in> <raw out> <first source frame>
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

W, H, FPS = 1920, 1080, 24
MASTER_OFFSET = 18  # master frame k = source frame k + 18 (master.sh)
RAMP = (17.6, 19.3)  # master seconds: the camera's push toward the logo
SCALE = 0.80
# Zoom anchor = centre of the tall cut's window at rest (reframe.sh:
# left edge 0.49 x (1920 - 608) = 642, width 608) and the frame's middle.
CX, CY = 946.0, 540.0
FEATHER = 48  # rows over which the sharp frame melts into the fill


def scale_at(source_frame: int) -> float:
    t = (source_frame - MASTER_OFFSET) / FPS
    u = min(max((t - RAMP[0]) / (RAMP[1] - RAMP[0]), 0.0), 1.0)
    return 1.0 - (1.0 - SCALE) * u * u * (3 - 2 * u)  # smoothstep


def pull_back(plane: np.ndarray, s: float, k: int, luma: bool) -> np.ndarray:
    """Plane scaled by s around the anchor; k = 1 for luma, 2 for chroma."""
    h, w = plane.shape
    pad_y, pad_x, feather = 144 // k, 256 // k, FEATHER // k
    img = Image.fromarray(plane)
    # Fill: heavy blur of the same frame, stretched over the padded canvas.
    fill = img.resize((w // 8, h // 8), Image.BOX).filter(ImageFilter.GaussianBlur(4))
    fill = np.asarray(fill.resize((w + 2 * pad_x, h + 2 * pad_y), Image.BICUBIC), dtype=np.float32)
    if luma:
        fill = 16 + (fill - 16) * 0.9  # recede a little behind the sharp frame
    canvas = fill.copy()
    alpha = np.ones(h, dtype=np.float32)
    ramp = (np.arange(feather, dtype=np.float32) + 0.5) / feather
    alpha[:feather] = ramp
    alpha[-feather:] = ramp[::-1]
    inner = canvas[pad_y:pad_y + h, pad_x:pad_x + w]
    canvas[pad_y:pad_y + h, pad_x:pad_x + w] = inner + (plane.astype(np.float32) - inner) * alpha[:, None]
    cx, cy = CX / k + pad_x, CY / k + pad_y
    box = (cx - (CX / k) / s, cy - (CY / k) / s, cx + (w - CX / k) / s, cy + (h - CY / k) / s)
    out = Image.fromarray(np.clip(np.rint(canvas), 0, 255).astype(np.uint8)).resize((w, h), Image.LANCZOS, box=box)
    return np.asarray(out)


def main() -> None:
    src, dst, first = sys.argv[1], sys.argv[2], int(sys.argv[3])
    frame_bytes = W * H * 3 // 2
    raw = np.fromfile(src, dtype=np.uint8)
    count = raw.size // frame_bytes
    out = np.empty_like(raw[: count * frame_bytes])
    for i in range(count):
        f = raw[i * frame_bytes:(i + 1) * frame_bytes]
        s = scale_at(first + i)
        if s >= 0.9999:
            out[i * frame_bytes:(i + 1) * frame_bytes] = f
            continue
        y = f[: W * H].reshape(H, W)
        u = f[W * H: W * H * 5 // 4].reshape(H // 2, W // 2)
        v = f[W * H * 5 // 4:].reshape(H // 2, W // 2)
        out[i * frame_bytes:(i + 1) * frame_bytes] = np.concatenate(
            [pull_back(y, s, 1, True).ravel(), pull_back(u, s, 2, False).ravel(), pull_back(v, s, 2, False).ravel()]
        )
    out.tofile(dst)
    print(f"{count} frames from source frame {first}; scale {scale_at(first):.3f} -> {scale_at(first + count - 1):.3f}")


if __name__ == "__main__":
    main()
