#!/bin/sh
# Phone film: a separate 9:16 film the hero plays on phones held upright
# (PHONE_MEDIA in hero-film.tsx) instead of a crop of the brand film.
# Same loop dissolve, encoders and VMAF gate as the brand film; no reframing,
# the source is already 9:16. Run from a scratch directory holding the
# source as src/source.mp4:
#
#   sh "$APP"/scripts/hero-film/phone.sh <av1 crf> <h264 crf>
#   python "$APP"/scripts/hero-film/install_phone.py . "$APP"
#
# A larger source is scaled to PHONE_SIZE (default 720x1280, the size the
# brand film's phone cut has too): a phone shows the hero ~390 CSS px wide,
# and at 1080x1920 the H.264 file most iPhones get doubles for little that
# shows on a soft-lit film. The poster comes from the same scaled master, so
# it hands over to the video pixel for pixel.
set -e
HERE=$(dirname "$0")
SIZE=${PHONE_SIZE:-720x1280}
sh "$HERE/master.sh"
if [ "$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=s=x:p=0 work/master.mkv)" != "$SIZE" ]; then
  ffmpeg -hide_banner -loglevel error -y -i work/master.mkv \
    -vf "scale=${SIZE%x*}:${SIZE#*x}:flags=lanczos+accurate_rnd+full_chroma_int,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709" \
    -an -c:v ffv1 -level 3 work/master-scaled.mkv
  mv work/master-scaled.mkv work/master.mkv
fi
cp work/master.mkv work/ref-phone.mkv
POSTER_NAME=oralign-film-phone-poster sh "$HERE/final.sh" "phone:$1:$2"
# For the manifest's notes (install_phone.py).
ffprobe -v error -select_streams v -show_entries stream=width,height,codec_name,r_frame_rate:format=duration \
  -of default=nw=1 src/source.mp4 > out/source.txt
