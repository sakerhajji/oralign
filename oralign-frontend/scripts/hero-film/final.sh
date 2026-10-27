#!/bin/sh
# Final encodes for the hero film.
#   sh final.sh tall:35:25 portrait:35:26 square:36:26 wide:36:27
#   (one <shape>:<av1 crf>:<h264 crf> per rendition)
#
# Output: out/oralign-film-<shape>.<codec>.<hash8>.mp4 + poster, and
# out/manifest.txt with one line per file:
#   shape codec file width height bitrate_bps codec_string vmaf_mean vmaf_p1 vmaf_min
set -e
rm -rf out && mkdir -p out

vmaf() {
  ffmpeg -hide_banner -loglevel quiet -i "$1" -i "work/ref-$2.mkv" \
    -lavfi "[0:v]format=yuv420p,settb=AVTB,setpts=N/24/TB[d];[1:v]format=yuv420p,settb=AVTB,setpts=N/24/TB[ref];[d][ref]libvmaf=model=version=vmaf_v0.6.1:n_threads=8:log_fmt=csv:log_path=/tmp/v.csv" \
    -f null - || true
  awk -F, 'NR==1 { for (i = 1; i <= NF; i++) if ($i == "vmaf") c = i; next } { print $c }' /tmp/v.csv \
    | sort -n | awk '{ v[NR] = $1; s += $1 } END { p = int(NR / 100); if (p < 1) p = 1;
                     printf "%.2f %.2f %.2f", s / NR, v[p], v[1] }'
}

codec_string() { # $1 file, $2 codec → RFC 6381 codecs= value read from the bitstream
  level=$(ffprobe -v error -select_streams v -show_entries stream=level -of csv=p=0 "$1")
  if [ "$2" = h264 ]; then
    printf 'avc1.6400%02X' "$level"            # High profile, no constraint flags
  else
    printf 'av01.0.%02dM.10' "$level"          # Main profile, Main tier, 10-bit
  fi
}

encode() { # $1 shape, $2 codec, $3 crf
  tmp=out/tmp.mp4
  if [ "$2" = av1 ]; then
    ffmpeg -hide_banner -loglevel error -y -i "work/ref-$1.mkv" -an \
      -c:v libsvtav1 -preset 3 -crf "$3" -g 96 -pix_fmt yuv420p10le \
      -svtav1-params tune=0:enable-qm=1 -movflags +faststart "$tmp" 2>/dev/null
  else
    ffmpeg -hide_banner -loglevel error -y -i "work/ref-$1.mkv" -an \
      -c:v libx264 -preset veryslow -tune film -crf "$3" -profile:v high -level:v 4.0 -pix_fmt yuv420p \
      -x264-params keyint=96:min-keyint=24:aq-mode=3 -movflags +faststart "$tmp"
  fi
  hash=$(sha256sum "$tmp" | cut -c1-8)
  file="oralign-film-$1.$2.$hash.mp4"
  mv "$tmp" "out/$file"
  dims=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "out/$file" | tr ',' ' ')
  bytes=$(stat -c%s "out/$file")
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "out/$file")
  bps=$(awk -v b="$bytes" -v d="$dur" 'BEGIN { printf "%d", b * 8 / d }')
  echo "$1 $2 $file $dims $bps $(codec_string "out/$file" "$2") $(vmaf "out/$file" "$1")" >> out/manifest.txt
  printf '%-9s %-5s crf %-3s %6s KB  %s\n' "$1" "$2" "$3" $((bytes / 1024)) "$(tail -1 out/manifest.txt | cut -d' ' -f7-)"
}

for spec in "$@"; do
  shape=$(echo "$spec" | cut -d: -f1)
  encode "$shape" av1 "$(echo "$spec" | cut -d: -f2)"
  encode "$shape" h264 "$(echo "$spec" | cut -d: -f3)"
done

# Poster = frame 0 of the loop master, full 16:9, as a final WebP served
# as-is (no runtime image optimizer): it is cover-scaled height-first on
# every screen narrower than 16:9, so phones and tablets need all 1920 px
# anyway, and a static file is cached immutable instead of revalidated.
# WebP's lossy YUV is BT.601 limited range; the master is BT.709, so the
# matrix is converted explicitly or the colours would shift at the fade-in.
# zscale, not scale: ffmpeg 9's scale=in/out_color_matrix made it WORSE
# (R/B bias -2.6 against a hand-computed BT.709 reference; zscale: ~0).
# POSTER_NAME names it for a second film (the phone film: see phone.sh).
POSTER_NAME=${POSTER_NAME:-oralign-film-poster}
ffmpeg -hide_banner -loglevel error -y -i work/master.mkv \
  -vf "select=eq(n\,0),zscale=matrixin=709:rangein=limited:matrix=470bg:range=limited,format=yuv420p" \
  -frames:v 1 -c:v libwebp -quality 85 -compression_level 6 -preset photo out/poster.webp
phash=$(sha256sum out/poster.webp | cut -c1-8)
mv out/poster.webp "out/$POSTER_NAME.$phash.webp"
pdims=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 work/master.mkv | tr ',' ' ')
echo "poster - $POSTER_NAME.$phash.webp $pdims 0 - - - -" >> out/manifest.txt
ls -l out
