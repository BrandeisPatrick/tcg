#!/usr/bin/env python3
"""Crop hero portraits from the Reddit compilation source.

Per-hero crop tuning: each entry overrides defaults so I can fix faces being
cut off or name banners showing through. Run with no args for all heroes,
or `python3 scripts/crop_heroes.py wraith abrams` to crop a subset.
"""
from PIL import Image
import os, sys

SRC = '/Users/patrickli/Downloads'
DST = 'public/heroes'
PFX = 'a-quick-compilation-of-all-the-updated-hero-select-screens-v0-'

# x_pct: horizontal center of crop as fraction of source width
# y_top_pct: top of crop as fraction of source height (default 0 — start at top)
# h_pct: crop height as fraction of source height (default 0.75 — skip name banner at bottom)
DEFAULT = {'x_pct': 0.60, 'y_top_pct': 0.0, 'h_pct': 0.75}

HEROES = {
    'abrams':     {'hash': 'erhvd0f751kf1'},
    'drifter':    {'hash': 'ze9vykn0lxjf1'},
    'dynamo':     {'hash': 'm1y16ln0lxjf1'},
    'haze':       {'hash': 'o5xq6ln0lxjf1'},
    'kelvin':     {'hash': 'ayo9pnn0lxjf1'},
    'lady_geist': {'hash': 'd8o47in0lxjf1'},
    'lash':       {'hash': 'z21agkn0lxjf1'},
    'mirage':     {'hash': '39kxqspklxjf1'},
    'mo_krill':   {'hash': 'mve06gz0lxjf1'},
    'paige':      {'hash': 'df8a9kn0lxjf1'},
    'seven':      {'hash': 'xvdtfjn0lxjf1'},
    'shiv':       {'hash': 'f04rrdq0lxjf1'},
    'sinclair':   {'hash': 'q6f9kpjjlxjf1'},
    'vindicta':   {'hash': 'uiqxvmn0lxjf1'},
    'viscous':    {'hash': 'ugurjkn0lxjf1'},
    'warden':     {'hash': 'vp8kpln0lxjf1'},
    'wraith':     {'hash': '04vxawpolxjf1'},
    'yamato':     {'hash': 's2pwp2milxjf1'},
}

TARGET_W, TARGET_H = 280, 380
TARGET_ASPECT = TARGET_W / TARGET_H  # ~0.737

def crop_one(hero, cfg):
    cfg = {**DEFAULT, **cfg}
    src = f'{SRC}/{PFX}{cfg["hash"]}.webp'
    img = Image.open(src)
    W, H = img.size
    crop_h = int(H * cfg['h_pct'])
    crop_w = int(crop_h * TARGET_ASPECT)
    y_start = int(H * cfg['y_top_pct'])
    x_center = int(W * cfg['x_pct'])
    x_start = max(0, min(W - crop_w, x_center - crop_w // 2))
    cropped = img.crop((x_start, y_start, x_start + crop_w, y_start + crop_h))
    resized = cropped.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    out = f'{DST}/hero_{hero}_card.webp'
    resized.save(out, format='WEBP', quality=92)
    print(f'OK  hero_{hero}_card.webp  src {W}x{H}  '
          f'crop ({x_start},{y_start},{crop_w},{crop_h})  '
          f'-> {TARGET_W}x{TARGET_H}')

def main():
    only = set(sys.argv[1:])
    for hero, cfg in HEROES.items():
        if only and hero not in only:
            continue
        crop_one(hero, cfg)

if __name__ == '__main__':
    main()
