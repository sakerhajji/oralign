#!/bin/sh
# Loop master: the last 18 frames dissolve into the first 18 frames, so the
# end of the film flows into its own start with no visible jump.
# For a source of F frames (brand film: F = 524, 21.833 s @ 24 fps):
#   body           : 18 .. F-19                      (brand film: 488 frames)
#   loop dissolve  : tail F-18..F-1 blended into head 0..17 (18 frames)
#                    weight of the head = N/18 (blend's N counts from 1 here), so the LAST dissolve
#                    frame is 100 % source frame 17 and the loop resumes on
#                    source frame 18 — an ordinary frame step, no residue.
#   output         : F-18 frames (brand film: 506 = 21.083 s); output frame k = source frame k+18
# Untagged sources are tagged BT.709 (what browsers assume for HD video), so
# the encodes and the poster conversion agree on the colours.
#
#   sh master.sh                                   → work/master.mkv
#   sh master.sh src/source-tall.mkv work/master-tall.mkv   (see endcard.py)
set -e
IN=${1:-src/source.mp4}
OUT=${2:-work/master.mkv}
FRAMES=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 "$IN")
TAIL=$((FRAMES - 18))
mkdir -p work
ffmpeg -hide_banner -loglevel error -y -i "$IN" -filter_complex "
  [0:v]format=yuv444p,split=3[a][b][c];
  [a]trim=start_frame=18:end_frame=$TAIL,setpts=PTS-STARTPTS[body];
  [b]trim=start_frame=$TAIL:end_frame=$FRAMES,setpts=PTS-STARTPTS[tail];
  [c]trim=start_frame=0:end_frame=18,setpts=PTS-STARTPTS[head];
  [tail][head]blend=all_expr='A*(1-N/18)+B*(N/18)'[loop];
  [body][loop]concat=n=2:v=1:a=0,format=yuv420p,
  setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709[out]" \
  -map "[out]" -an -c:v ffv1 -level 3 "$OUT"
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of default=nw=1 "$OUT"
