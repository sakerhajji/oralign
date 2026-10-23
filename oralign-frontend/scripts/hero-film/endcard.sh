#!/bin/sh
# The phone cut's end card (see endcard.py), in two halves around the
# Python step:
#   sh endcard.sh extract       → work/tail.yuv       (source frames 430..523, raw)
#   python endcard.py work/tail.yuv work/tail-pulled.yuv 430
#   sh endcard.sh splice        → src/source-tall.mkv (frames 0..429 untouched)
# then: sh master.sh src/source-tall.mkv work/master-tall.mkv
set -e
FIRST=430   # before the pull-back starts (source frame 440): copied bit-exact
mkdir -p work
case "$1" in
  extract)
    ffmpeg -hide_banner -loglevel error -y -i src/source.mp4 \
      -vf "select=gte(n\,$FIRST)" -f rawvideo -pix_fmt yuv420p work/tail.yuv
    ;;
  splice)
    ffmpeg -hide_banner -loglevel error -y -i src/source.mp4 \
      -f rawvideo -pix_fmt yuv420p -s 1920x1080 -r 24 -color_range tv -colorspace bt709 -i work/tail-pulled.yuv \
      -filter_complex "[0:v]trim=end_frame=$FIRST,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[out]" \
      -map "[out]" -an -c:v ffv1 -level 3 \
      -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv src/source-tall.mkv
    ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of default=nw=1 src/source-tall.mkv
    ;;
  *)
    echo "usage: sh endcard.sh extract|splice" >&2
    exit 1
    ;;
esac
