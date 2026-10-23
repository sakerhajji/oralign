# Hero film — encode pipeline

Produces the home-hero film files in `public/showcase/hero/` and the typed
manifest `src/app/(showcase)/_components/patient/decouvrir/hero-film-manifest.ts`.
Re-run it whenever the film changes; never overwrite a file in
`public/showcase/hero/` in place (those URLs are cached `immutable` for a
year — the content hash in each name is what makes a new version reach
returning visitors).

## Run

From a scratch directory holding the source film as `src/source.mp4`
(`$APP` = the `oralign-frontend` directory):

```sh
cp "$APP"/scripts/hero-film/*.sh .
docker run --rm --entrypoint sh -v "$PWD:/w" -w /w linuxserver/ffmpeg:latest -c '
  sh master.sh &&                       # lossless seamless-loop master
  sh reframe.sh &&                      # tall / portrait / square / wide references
  sh final.sh tall:35:25 portrait:35:26 square:36:26 wide:36:27
'
python "$APP"/scripts/hero-film/install.py . "$APP"
```

`linuxserver/ffmpeg` is used because it ships SVT-AV1, x264 **and**
libvmaf; `final.sh` scores every encode against its lossless reference.

## What each step does, and why

- **master.sh** — the film's last 18 frames dissolve into its first 18,
  so the loop has no cut. The blend weight reaches 100 % on the last frame
  (ffmpeg's `blend` counts `N` from 1), which makes the seam exactly as
  smooth as an ordinary frame step (SSIM 0.9908 = the film's own step there).
- **reframe.sh** — the full-screen hero box is ~9:16 on phones, ~4:5 on
  tablets in portrait and ~16:9 on desktop, so most of a 16:9 frame would
  be cropped by `object-fit` on anything but desktop. Each rendition is
  pre-cropped to its box shape, so nobody downloads pixels they cannot see.
  At rest the crop sits at the poster's 49 % position (left edge =
  0.49 × (1920 − width)), so the video and the poster show the same window
  in any box and the fade-in is pixel-aligned. The crop follows the
  subject: it jumps on the film's hard cut (output frame 278) to keep the
  yellow box in frame, and eases back while the camera moves toward the
  logo.
- **final.sh** — AV1 (SVT-AV1 preset 3, 10-bit, VQ tune) and H.264 (x264
  veryslow, High profile, **level 4.0**, aq-mode 3 for the dark gradients),
  `+faststart`, no audio, 4 s GOP. The level is pinned on purpose: left
  alone, `veryslow` uses 16 reference frames and lands on level 5.0, which
  some older Android hardware decoders reject — they would fall back to
  software decoding, where stutter comes from. CRFs were chosen by sweep
  to the gate **VMAF mean ≥ 95
  and worst-1 %-frame ≥ 91**; the mean alone hides the dark fades where
  banding appears first.

## Serving requirements

- Byte-range requests (`206`) — Safari will not play an MP4 without them.
  Next's standalone server answers them for `public/`; nginx passes them
  through. Never gzip video.
- `Cache-Control: public, max-age=31536000, immutable` via `next.config.ts`
  `headers()` — safe only because the names are content-hashed.
