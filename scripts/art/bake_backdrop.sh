#!/bin/sh
# Bakes the poster backdrop's look into a small image, so the screen behind
# every sheet costs nothing to redraw: the night scene blurred, desaturated,
# darkened and washed teal once, here, instead of by a CSS filter on every
# frame. PosterBackdrop draws it scaled up, with its vignette and grain on top.
#
#   sh scripts/art/bake_backdrop.sh [OUT=public/art/menu_scene_ground.png] [WIDTHxHEIGHT=320x180]
#
# The numbers are the old live CSS, worked through once:
#   blur(18px)   — the scene is drawn ~1.31x (phone) to ~1.4x (1440x900) its
#                  size, so 18 CSS px is ~13.3 px of the 1280-wide source;
#   saturate(0.85) brightness(0.6), then the rgba(6, 24, 20, 0.36) wash —
#                  one colour matrix (the saturate matrix x 0.6 x 0.64) plus
#                  the wash's own 36%, in 16-bit so nothing rounds between.
# The blur leaves only low frequencies, so a small image scaled up loses
# nothing. PNG, not JPEG: JPEG's 8x8 blocks, scaled up 16x on a phone, show as
# faint squares in the dark gradients.
set -e
cd "$(dirname "$0")/../.."
OUT=${1:-public/art/menu_scene_ground.png}
SIZE=${2:-320x180}
FFMPEG=${FFMPEG:-ffmpeg}
# The offsets are the wash in 16-bit (x257): 0.36 x (6, 24, 20).
MIX="r='0.33867*r(X,Y)+0.041184*g(X,Y)+0.0041472*b(X,Y)+555.12'"
MIX="$MIX:g='0.012269*r(X,Y)+0.36758*g(X,Y)+0.0041472*b(X,Y)+2220.48'"
MIX="$MIX:b='0.012269*r(X,Y)+0.041184*g(X,Y)+0.33055*b(X,Y)+1850.4'"
"$FFMPEG" -v error -y -i public/art/menu_scene.jpg \
  -vf "format=gbrp16le,gblur=sigma=13.3:steps=6,geq=$MIX,scale=${SIZE%x*}:${SIZE#*x}:flags=area,format=rgb24" \
  -sws_dither none "$OUT"
ls -l "$OUT"
