#!/bin/sh
# Films the trailer: every take at 60 frames a second (the long one beside the
# short ones), each encoded to H.264, then joined into one file.
#
#   npm run dev                                   # in another terminal
#   sh scripts/film/shoot-all.sh [OUT=deadlock-tcg-trailer.mp4] [WORK=film-takes]
#
# DEV_URL when the dev server is not on http://localhost:5173. Needs Playwright
# and ffmpeg (scripts/film/lib.cjs). It takes about ten minutes on four cores;
# WORK holds some 400 MB of frames, and is yours to delete.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-deadlock-tcg-trailer.mp4}"
WORK="${2:-film-takes}"
rm -rf "$WORK" && mkdir -p "$WORK"
FPS=60 node "$HERE/shoot.cjs" match "$WORK" > "$WORK/match.log" 2>&1 &
M=$!
for t in title lesson screens end; do
  FPS=60 node "$HERE/shoot.cjs" "$t" "$WORK" > "$WORK/$t.log" 2>&1
  tail -1 "$WORK/$t.log"
done
wait $M
tail -2 "$WORK/match.log"
for t in title match lesson screens end; do
  ffmpeg -hide_banner -loglevel error -y -framerate 60 -i "$WORK/$t/f%06d.jpg" \
    -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -r 60 "$WORK/$t.mp4"
done
printf "file 'title.mp4'\nfile 'match.mp4'\nfile 'lesson.mp4'\nfile 'screens.mp4'\nfile 'end.mp4'\n" > "$WORK/list.txt"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$WORK/list.txt" -c copy -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=width,height,r_frame_rate,nb_frames:format=duration,size -of default=nw=1 "$OUT"
# A take that threw in the page is not one to keep.
if grep -h "PAGE ERROR" "$WORK"/*.log; then echo "page errors: see $WORK/*.log" >&2; exit 1; fi
echo "wrote $OUT"
