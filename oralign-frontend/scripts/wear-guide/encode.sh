#!/bin/sh
# Wear guide films ("Comment porter vos aligneurs" section of the home page).
# Run in linuxserver/ffmpeg (SVT-AV1 + x264 + libvmaf) from a scratch
# directory holding src/desktop.mp4 (16:9) and src/phone.mp4 (9:16):
#
#   sh "$APP"/scripts/wear-guide/encode.sh desktop:<av1 crf>:<h264 crf> phone:<av1 crf>:<h264 crf>
#   python "$APP"/scripts/wear-guide/install.py . "$APP"
#
# Each film is scaled to its rendition (desktop 1920x1080, phone 1080x1920:
# the burned-in captions need the pixels) as a lossless reference, then
# encoded twice and scored against it — gate: VMAF mean >= 95 and
# 1st-percentile frame >= 91, as for the hero film.
#  - No audio: the masters' AAC track is digital silence.
#  - Keyframes: the step list seeks into the film, and a seek decodes from
#    the previous keyframe. H.264 (what iPhones play) gets one every 2 s.
#    AV1 every 4 s: SVT-AV1 drops ~6 VMAF on the last frame before each
#    keyframe, and at 2 s those dips alone pulled the phone cut's 1st
#    percentile under 91 (90.8 at CRF 29); at 4 s it passes at CRF 30
#    (91.2) and the file is 12 % smaller.
#  - BT.709 tags (the masters are untagged), +faststart for progressive play.
#  - Poster = the title card (2 s in), same size as the video.
set -e
rm -rf out && mkdir -p out work

size() { [ "$1" = phone ] && echo 1080x1920 || echo 1920x1080; }

ref() { # $1 film
  s=$(size "$1")
  ffmpeg -hide_banner -loglevel error -y -i "src/$1.mp4" -an \
    -vf "scale=${s%x*}:${s#*x}:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709" \
    -c:v ffv1 -level 3 "work/ref-$1.mkv"
}

vmaf() { # $1 encode, $2 film → "mean p1 min"
  ffmpeg -hide_banner -loglevel quiet -i "$1" -i "work/ref-$2.mkv" \
    -lavfi "[0:v]format=yuv420p,settb=AVTB,setpts=N/24/TB[d];[1:v]format=yuv420p,settb=AVTB,setpts=N/24/TB[ref];[d][ref]libvmaf=model=version=vmaf_v0.6.1:n_threads=8:log_fmt=csv:log_path=/tmp/v.csv" \
    -f null - || true
  awk -F, 'NR==1 { for (i = 1; i <= NF; i++) if ($i == "vmaf") c = i; next } { print $c }' /tmp/v.csv \
    | sort -n | awk '{ v[NR] = $1; s += $1 } END { p = int(NR / 100); if (p < 1) p = 1;
                     printf "%.2f %.2f %.2f", s / NR, v[p], v[1] }'
}

codec_string() { # $1 file, $2 codec → RFC 6381 codecs= value read from the bitstream
  level=$(ffprobe -v error -select_streams v -show_entries stream=level -of csv=p=0 "$1")
  if [ "$2" = h264 ]; then printf 'avc1.6400%02X' "$level"; else printf 'av01.0.%02dM.10' "$level"; fi
}

encode() { # $1 film, $2 codec, $3 crf
  tmp=out/tmp.mp4
  if [ "$2" = av1 ]; then
    ffmpeg -hide_banner -loglevel error -y -i "work/ref-$1.mkv" -an \
      -c:v libsvtav1 -preset 4 -crf "$3" -g 96 -pix_fmt yuv420p10le \
      -svtav1-params tune=0:enable-qm=1 -movflags +faststart "$tmp" 2>/dev/null
  else
    ffmpeg -hide_banner -loglevel error -y -i "work/ref-$1.mkv" -an \
      -c:v libx264 -preset veryslow -tune film -crf "$3" -profile:v high -level:v 4.0 -pix_fmt yuv420p \
      -x264-params keyint=48:min-keyint=24:aq-mode=3 -movflags +faststart "$tmp"
  fi
  hash=$(sha256sum "$tmp" | cut -c1-8)
  file="oralign-wear-guide-$1.$2.$hash.mp4"
  mv "$tmp" "out/$file"
  dims=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "out/$file" | tr ',' ' ')
  bytes=$(stat -c%s "out/$file")
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "out/$file")
  bps=$(awk -v b="$bytes" -v d="$dur" 'BEGIN { printf "%d", b * 8 / d }')
  echo "$1 $2 $file $dims $bps $(codec_string "out/$file" "$2") $(vmaf "out/$file" "$1") $dur" >> out/manifest.txt
  printf '%-8s %-5s crf %-3s %6s KB  %s\n' "$1" "$2" "$3" $((bytes / 1024)) "$(tail -1 out/manifest.txt | cut -d' ' -f7-9)"
}

poster() { # $1 film — zscale converts BT.709 to WebP's BT.601 (see hero-film/final.sh)
  ffmpeg -hide_banner -loglevel error -y -ss 2 -i "work/ref-$1.mkv" -frames:v 1 \
    -vf "zscale=matrixin=709:rangein=limited:matrix=470bg:range=limited,format=yuv420p" \
    -c:v libwebp -quality 82 -compression_level 6 -preset photo out/poster.webp
  hash=$(sha256sum out/poster.webp | cut -c1-8)
  mv out/poster.webp "out/oralign-wear-guide-$1-poster.$hash.webp"
  echo "$1 poster oralign-wear-guide-$1-poster.$hash.webp $(size "$1" | tr x ' ') 0 - - - - -" >> out/manifest.txt
}

for spec in "$@"; do
  film=$(echo "$spec" | cut -d: -f1)
  ref "$film"
  encode "$film" av1 "$(echo "$spec" | cut -d: -f2)"
  encode "$film" h264 "$(echo "$spec" | cut -d: -f3)"
  poster "$film"
done
ls -l out
