#!/usr/bin/env python3
"""
Fetch the shop-icon art for every spell and equipment card from the Deadlock wiki.

Card ids and names come from src/cards/spells.ts and src/cards/equipment.ts
(each card's `name` is its canon item name). Each icon is downloaded from
https://cdn.deadlock.wiki/<Name_With_Underscores>.png (falling back to the URL
the wiki's MediaWiki API gives for File:<Name>.png) and encoded to WebP:

    spells     -> public/spells/<id>.webp
    equipment  -> public/items/<id>.webp

Usage (works from any directory; paths resolve from this file):

    python3 scripts/fetch_item_art.py                      # every spell + equipment card
    python3 scripts/fetch_item_art.py curse warp_stone     # only these card ids
    python3 scripts/fetch_item_art.py spell:grit=Grit "item:mystic_slow=Mystic Slow"
        # cards not in the card files yet: <spell|item>:<id>=<Canon Name>

Prints OK or MISS per card. A MISS keeps the existing file. Exit status is 1 if
anything missed. Afterwards it lists cards that have no art and art files no
card uses; it never deletes anything.

WebP encoder, first one available: ffmpeg built with libwebp ($FFMPEG
overrides the binary), cwebp (`brew install webp`), or Pillow in the Python
running this script. Homebrew's ffmpeg ships without libwebp. Downloads go to
$ART_TMP (default <system tmp>/wikiart). No third-party packages are required.

See public/ART_PIPELINE.md.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = (  # (card file, art dir, kind)
    ('src/cards/spells.ts', 'public/spells', 'spell'),
    ('src/cards/equipment.ts', 'public/items', 'item'),
)
CDN = 'https://cdn.deadlock.wiki/'
API = 'https://deadlock.wiki/api.php'
UA = ('deadlock-tcg/0.0.1 (non-commercial Deadlock fan card game; '
      'scripts/fetch_item_art.py; +https://github.com/BrandeisPatrick/tcg)')
QUALITY = 92        # lossy WebP; 200x200 icons land around 8-20 KB
PAUSE = 0.3         # seconds between requests to the wiki
TMP = os.environ.get('ART_TMP') or os.path.join(tempfile.gettempdir(), 'wikiart')
PNG = b'\x89PNG\r\n\x1a\n'

STR = r"""(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")"""
CARD_RE = re.compile(r'\bid:\s*' + STR + r'\s*,\s*name:\s*' + STR)


def read_cards(path):
    """[(id, name)] for every `id: '…', name: '…'` card entry in a .ts file."""
    with open(path, encoding='utf-8') as f:
        src = re.sub(r'/\*.*?\*/', '', f.read(), flags=re.S)
    src = '\n'.join(l for l in src.splitlines() if not l.lstrip().startswith('//'))
    unesc = lambda s: re.sub(r'\\(.)', r'\1', s)
    return [(unesc(m.group(1) if m.group(1) is not None else m.group(2)),
             unesc(m.group(3) if m.group(3) is not None else m.group(4)))
            for m in CARD_RE.finditer(src)]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def download(name):
    """PNG bytes of the item's wiki shop icon; raises if neither source has it."""
    fname = name.replace(' ', '_') + '.png'
    errors = []
    try:
        data = get(CDN + urllib.parse.quote(fname))   # ' -> %27, & -> %26
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


def pick_encoder():
    """(label, encode(src_png, dst_webp)) for the first WebP encoder found."""
    ffmpeg = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if ffmpeg:
        listing = subprocess.run([ffmpeg, '-hide_banner', '-encoders'],
                                 capture_output=True, text=True).stdout
        if re.search(r'\blibwebp\b', listing):
            return 'ffmpeg', lambda src, dst: subprocess.run(
                [ffmpeg, '-y', '-loglevel', 'error', '-i', src, '-c:v', 'libwebp',
                 '-quality', str(QUALITY), '-compression_level', '6', dst], check=True)
    cwebp = shutil.which('cwebp')
    if cwebp:
        return 'cwebp', lambda src, dst: subprocess.run(
            [cwebp, '-quiet', '-q', str(QUALITY), '-m', '6', src, '-o', dst], check=True)
    try:
        from PIL import Image, features
        if features.check('webp'):
            def pillow(src, dst):
                with Image.open(src) as im:
                    alpha = im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info
                    im.convert('RGBA' if alpha else 'RGB').save(
                        dst, 'WEBP', quality=QUALITY, method=6)
            return 'Pillow', pillow
    except ImportError:
        pass
    sys.exit('No WebP encoder found: need ffmpeg built with libwebp, '
             'cwebp (brew install webp), or Pillow.')


def main(argv):
    if any(a in ('-h', '--help') for a in argv):
        print(__doc__)
        return 0
    out_dirs = {kind: d for _, d, kind in SOURCES}
    only, extras = set(), []
    for a in argv:
        m = re.fullmatch(r'(spell|item):([A-Za-z0-9_]+)=(.+)', a)
        if m:
            extras.append(m.groups())
        else:
            only.add(a)

    jobs, ids = [], {}   # jobs: (kind, id, name); ids: kind -> card ids
    for card_file, _, kind in SOURCES:
        cards = read_cards(os.path.join(ROOT, card_file))
        ids[kind] = {cid for cid, _ in cards}
        jobs += [(kind, cid, name) for cid, name in cards]
    extra_ids = {cid for _, cid, _ in extras}
    jobs = [j for j in jobs if j[1] not in extra_ids] + extras
    for kind, cid, _ in extras:
        ids[kind].add(cid)
    if only or extras:
        unknown = only - {cid for _, cid, _ in jobs}
        jobs = [j for j in jobs if j[1] in only or j[1] in extra_ids]
    else:
        unknown = set()

    os.makedirs(TMP, exist_ok=True)
    label, encode = pick_encoder()
    print(f'{len(jobs)} cards, encoder {label}, downloads in {TMP}\n')
    fetched, missed = 0, sorted(unknown)
    for cid in missed:
        print(f'MISS {"?":5s} {cid:24s} not in the card files')
    for i, (kind, cid, name) in enumerate(jobs):
        if i:
            time.sleep(PAUSE)
        dst = os.path.join(ROOT, out_dirs[kind], cid + '.webp')
        png, webp = os.path.join(TMP, cid + '.png'), os.path.join(TMP, cid + '.webp')
        try:
            with open(png, 'wb') as f:
                f.write(download(name))
            if os.path.exists(webp):
                os.remove(webp)
            encode(png, webp)
            with open(webp, 'rb') as f:
                head = f.read(12)
            if head[:4] != b'RIFF' or head[8:12] != b'WEBP':
                raise RuntimeError('encoder wrote no WebP')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(webp, dst + '.part')
            os.replace(dst + '.part', dst)
            fetched += 1
            print(f'OK   {kind:5s} {cid:24s} <- {name} ({os.path.getsize(dst)} B)')
        except Exception as e:
            kept = ' (kept existing file)' if os.path.exists(dst) else ''
            print(f'MISS {kind:5s} {cid:24s} <- {name}: {e}{kept}')
            missed.append(cid)

    print(f'\n{fetched} fetched, {len(missed)} missed'
          + (': ' + ', '.join(missed) if missed else ''))
    for _, out_dir, kind in SOURCES:
        files = {f[:-5] for f in os.listdir(os.path.join(ROOT, out_dir))
                 if f.endswith('.webp')}
        if ids[kind] - files:
            print(f'{out_dir}: no art for {", ".join(sorted(ids[kind] - files))}')
        if files - ids[kind]:
            print(f'{out_dir}: no card uses {", ".join(sorted(files - ids[kind]))}')
    return 1 if missed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
