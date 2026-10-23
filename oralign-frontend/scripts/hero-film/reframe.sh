#!/bin/sh
# Lossless reference per rendition, cropped to the shape of the box it fills.
#
# The film is 16:9 but the hero box is ~9:16 on phones, ~4:5 on tablets in
# portrait and ~16:9 on desktop, so most of the frame would be cropped by
# object-fit anyway — pre-cropping means the visitor never downloads pixels
# they cannot see.
#
# The crop's left edge follows the subject:
#   rest  0.49 x (1920 - w): the same 49 % position the poster and the
#         <video> use (object-position), so under object-fit: cover the
#         video shows exactly the poster's window in ANY box and the fade-in
#         is pixel-aligned. Held until the hard cut at output frame 278
#         (t = 11.583 s).
#   c1    during the two-box shot, centred on c1 x 1920 (the jump happens ON
#         the cut, so it is invisible)
#   eases back to rest over 15.75–17.55 s while the camera itself moves
#         toward the logo, so the reframe rides on the camera move.
set -e
cx() { # $1 = c1, $2 = crop width  →  x expression of t, rounded to an even pixel
  rest="0.49*(1920-$2)"
  shot="($1*1920-$2/2)"
  s="((t-15.75)/1.8)"
  x="if(lt(t,11.583),$rest,if(lt(t,15.75),$shot,if(lt(t,17.55),$shot+($rest-$shot)*$s*$s*(3-2*$s),$rest)))"
  echo "2*floor((max(0,min(1920-$2,$x))+1)/2)"
}
# Tall 9:16 (phones in portrait): too narrow for the two-box shot, so it
# follows the action instead — the case dropping into the black box. Cut
# from master-tall.mkv, whose end card is pulled back so the ORALIGN
# wordmark fits a phone's width (endcard.py).
ffmpeg -hide_banner -loglevel error -y -i work/master-tall.mkv \
  -vf "crop=w=608:h=1080:y=0:x='$(cx 0.56 608)'" -c:v ffv1 -level 3 work/ref-tall.mkv
# Portrait 4:5 and square: wide enough to keep the yellow ORALIGN box in
# frame next to the black one.
ffmpeg -hide_banner -loglevel error -y -i work/master.mkv \
  -vf "crop=w=864:h=1080:y=0:x='$(cx 0.38 864)'" -c:v ffv1 -level 3 work/ref-portrait.mkv
ffmpeg -hide_banner -loglevel error -y -i work/master.mkv \
  -vf "crop=w=1080:h=1080:y=0:x='$(cx 0.42 1080)'" -c:v ffv1 -level 3 work/ref-square.mkv
# Wide = the native 1920x1080 frame, untouched: it fills desktop screens,
# and tablets get it at 2x density, so anything smaller would be upscaled.
cp work/master.mkv work/ref-wide.mkv
for r in tall portrait square wide; do
  printf '%-9s ' $r
  ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 work/ref-$r.mkv
done
