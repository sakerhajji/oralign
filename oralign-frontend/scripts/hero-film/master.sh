#!/bin/sh
# Loop master: the last 18 frames dissolve into the first 18 frames, so the
# end of the film flows into its own start with no visible jump.
#   source frames  : 0 .. 523 (21.833 s @ 24 fps)
#   body           : 18 .. 505                       (488 frames)
#   loop dissolve  : tail 506..523 blended into head 0..17 (18 frames)
#                    weight of the head = N/18 (blend's N counts from 1 here), so the LAST dissolve
#                    frame is 100 % source frame 17 and the loop resumes on
#                    source frame 18 — an ordinary frame step, no residue.
#   output         : 506 frames = 21.083 s; output frame k = source frame k+18
set -e
mkdir -p work
ffmpeg -hide_banner -loglevel error -y -i src/source.mp4 -filter_complex "
  [0:v]format=yuv444p,split=3[a][b][c];
  [a]trim=start_frame=18:end_frame=506,setpts=PTS-STARTPTS[body];
  [b]trim=start_frame=506:end_frame=524,setpts=PTS-STARTPTS[tail];
  [c]trim=start_frame=0:end_frame=18,setpts=PTS-STARTPTS[head];
  [tail][head]blend=all_expr='A*(1-N/18)+B*(N/18)'[loop];
  [body][loop]concat=n=2:v=1:a=0,format=yuv420p[out]" \
  -map "[out]" -an -c:v ffv1 -level 3 work/master.mkv
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of default=nw=1 work/master.mkv
