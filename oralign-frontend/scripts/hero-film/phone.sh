#!/bin/sh
# Phone film: a separate 9:16 film the hero plays on phones held upright
# (PHONE_MEDIA in hero-film.tsx) instead of a crop of the brand film.
# Same loop dissolve, encoders and VMAF gate as the brand film; no reframing,
# the source is already 9:16. Run from a scratch directory holding the
# source as src/source.mp4:
#
#   sh "$APP"/scripts/hero-film/phone.sh <av1 crf> <h264 crf>
#   python "$APP"/scripts/hero-film/install_phone.py . "$APP"
set -e
HERE=$(dirname "$0")
sh "$HERE/master.sh"
cp work/master.mkv work/ref-phone.mkv
POSTER_NAME=oralign-film-phone-poster sh "$HERE/final.sh" "phone:$1:$2"
