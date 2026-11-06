#!/usr/bin/env python3
"""
Fetch the map's icons from the Deadlock wiki: the Lane Guardian, the Walker
and the Patron (the structures on each side's rule), the Mid-Boss (its plate
in the pit) and the Rejuvenator (the tag a side wears while it holds one).

Each is the wiki's own file, downloaded from https://cdn.deadlock.wiki/<File>
(falling back to the URL the wiki's MediaWiki API gives for File:<File>) and
written as public/art/map_<name>.png, downscaled to 128 px (ffmpeg, Lanczos;
the wiki's files are 164-500 px and the board prints them at 40 px or less).
Without ffmpeg the original is kept as it is. Nothing is redrawn.

    python3 scripts/art/fetch_map_icons.py            # all five
    python3 scripts/art/fetch_map_icons.py walker     # only these names

Requests carry a User-Agent naming this project, and pause between files.
Prints OK or MISS per icon; a MISS keeps the existing file. Exit status 1 if
anything missed. Downloads go to $ART_TMP (default <system tmp>/wikiart).
See public/ART_PIPELINE.md, "The map's icons".
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'public', 'art')
CDN = 'https://cdn.deadlock.wiki/'
API = 'https://deadlock.wiki/api.php'
UA = ('deadlock-tcg/0.0.1 (non-commercial Deadlock fan card game; '
      'scripts/art/fetch_map_icons.py; +https://github.com/BrandeisPatrick/tcg)')
SIZE = 128          # px, square: what public/status keeps its glyphs at
PAUSE = 0.4         # seconds between requests to the wiki
TMP = os.environ.get('ART_TMP') or os.path.join(tempfile.gettempdir(), 'wikiart')
PNG = b'\x89PNG\r\n\x1a\n'

# Our name -> the wiki's file. File:Guardian Icon.png and File:Patron Icon.png
# redirect to the first and third; the Mid-Boss has no icon on the wiki, so its
# model render (the Midboss page's own picture) stands in.
ICONS = {
    'guardian': 'Guardian.png',          # Lane Guardian
    'walker': 'Walker Icon.png',
    'patron': 'Patron.png',
    'mid_boss': 'Mid-Boss model.png',
    'rejuvenator': 'Rejuvenator.png',    # the buff a side holds after the Mid-Boss
}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def download(fname):
    """PNG bytes of the wiki's File:<fname>; raises if neither source has it."""
    fname = fname.replace(' ', '_')
    errors = []
    try:
        data = get(CDN + urllib.parse.quote(fname))
        if data.startswith(PNG):
            return data
        errors.append('cdn: not a PNG')
    except Exception as e:
        errors.append(f'cdn: {e}')
    try:
        time.sleep(PAUSE)
        query = urllib.parse.urlencode({
            'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url',
            'format': 'json', 'redirects': 1, 'titles': 'File:' + fname})
        pages = json.loads(get(f'{API}?{query}'))['query']['pages']
        url = next((p['imageinfo'][0]['url'] for p in pages.values()
                    if p.get('imageinfo')), None)
        if not url:
            raise LookupError(f'no File:{fname} on the wiki')
        time.sleep(PAUSE)
        data = get(url)
        if data.startswith(PNG):
            return data
        errors.append('api: not a PNG')
    except Exception as e:
        errors.append(f'api: {e}')
    raise RuntimeError('; '.join(errors))


def main(argv):
    if any(a in ('-h', '--help') for a in argv):
        print(__doc__)
        return 0
    names = argv or list(ICONS)
    unknown = [n for n in names if n not in ICONS]
    if unknown:
        print('unknown: ' + ', '.join(unknown) + ' (known: ' + ', '.join(ICONS) + ')')
        return 1
    os.makedirs(TMP, exist_ok=True)
    ffmpeg = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    missed = []
    for i, name in enumerate(names):
        if i:
            time.sleep(PAUSE)
        src, dst = os.path.join(TMP, f'map_{name}_src.png'), os.path.join(OUT_DIR, f'map_{name}.png')
        try:
            with open(src, 'wb') as f:
                f.write(download(ICONS[name]))
            part = dst + '.part.png'
            if ffmpeg:
                subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', src,
                                '-vf', f'scale={SIZE}:{SIZE}:force_original_aspect_ratio=decrease:flags=lanczos',
                                '-pix_fmt', 'rgba', part], check=True)
            else:
                shutil.copyfile(src, part)
            with open(part, 'rb') as f:
                if not f.read(8).startswith(PNG):
                    raise RuntimeError('wrote no PNG')
            os.replace(part, dst)
            print(f'OK   {name:12s} <- {ICONS[name]} ({os.path.getsize(dst)} B)')
        except Exception as e:
            kept = ' (kept existing file)' if os.path.exists(dst) else ''
            print(f'MISS {name:12s} <- {ICONS[name]}: {e}{kept}')
            missed.append(name)
    print(f'\n{len(names) - len(missed)} fetched, {len(missed)} missed' + (': ' + ', '.join(missed) if missed else ''))
    return 1 if missed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
