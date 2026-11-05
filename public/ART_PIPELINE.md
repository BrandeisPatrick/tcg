# Card art pipeline

Spell and equipment art is the item's painted 200×200 shop icon from the
**Deadlock wiki**: `https://cdn.deadlock.wiki/<Item_Name>.png` (spaces → `_`,
URL-encoded, so `Diviner's Kevlar` → `Diviner%27s_Kevlar.png`). If the CDN
misses, the script asks the MediaWiki API for the file's URL
(`https://deadlock.wiki/api.php?action=query&prop=imageinfo&iiprop=url&titles=File:<Item_Name>.png`).
The old source, `assets.deadlock-api.com`, is dead.

- Spells (canon **active** items) → `public/spells/<id>.webp`
- Equipment (canon **passive** items) → `public/items/<id>.webp`

The card's `name` in `src/cards/spells.ts` / `src/cards/equipment.ts` is the
canon item name, so there is no mapping table: a renamed card (e.g.
`improved_burst` is "Tankbuster") gets its real picture automatically.

## Re-running the fetch

`scripts/fetch_item_art.py` (stdlib only) reads both card files, downloads
each icon, encodes WebP (quality 92, ~3–20 KB), prints `OK` / `MISS` per card,
and then lists cards with no art and art files no card uses. A `MISS` keeps
the existing file. It never deletes; remove unused files by hand.

```bash
python3 scripts/fetch_item_art.py                     # every spell + equipment card
python3 scripts/fetch_item_art.py curse warp_stone    # just these ids
python3 scripts/fetch_item_art.py spell:grit=Grit "item:mystic_slow=Mystic Slow"
                                                      # cards not in the card files yet
```

The normal WebP route is `brew install webp`, which gives `cwebp`, or an ffmpeg
built with libwebp (`FFMPEG=…` picks the binary; Homebrew's ffmpeg has no
libwebp). The script takes the first it finds: ffmpeg with libwebp, then
`cwebp`, then Pillow in the running Python. An honest User-Agent is required:
every request to the wiki names this project, never a browser (`UA` at the top
of each script), and both fetch scripts, this one and
`scripts/art/fetch_map_icons.py`, now send one. Downloads land in `$ART_TMP`
(default `<system tmp>/wikiart`).

### Heroes

Heroes use a different path (`images/heroes/{slug}_card.webp`) and a different
slug system — the API slug doesn't match our hero IDs. The previous fetch used
this mapping:

```python
# TCG hero id -> Deadlock API slug (which differs from in-game name in some cases)
HERO_MAP = {
    'hero_abrams':      'bull',
    'hero_dynamo':      'sumo',
    'hero_haze':        'haze',
    'hero_kelvin':      'kelvin',
    'hero_lady_geist':  'spectre',
    'hero_lash':        'lash',
    'hero_mo_krill':    'krill',
    'hero_paige':       'forge',
    'hero_rem':         'rutger',
    'hero_seven':       'gigawatt',
    'hero_shiv':        'shiv',
    'hero_sinclair':    'magician',
    'hero_vindicta':    'hornet',
    'hero_viscous':     'viscous',
    'hero_yamato':      'yamato',
    'hero_wraith':      'wraith',
}
# Each hero has 3 sizes: _card (portrait), _mm (minimap), _sm (small icon)
# Source: https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/{slug}_{kind}.webp
```

Hero portraits are already pulled and live in `public/heroes/`. No re-run needed
unless a new hero is added.

## The map's icons

The structures strip on each side's rule, the Mid-Boss's pit and the
Rejuvenator tag print the game's own pictures, from the Deadlock wiki like the
item art, into `public/art/map_<name>.png`:

| File | Wiki file |
|---|---|
| `map_guardian.png` | `Guardian.png` (the Lane Guardian; `Guardian Icon.png` redirects to it) |
| `map_walker.png` | `Walker Icon.png` |
| `map_patron.png` | `Patron.png` (`Patron Icon.png` redirects to it) |
| `map_mid_boss.png` | `Mid-Boss model.png` (the Midboss page's picture: the wiki has no Mid-Boss icon) |
| `map_rejuvenator.png` | `Rejuvenator.png` (the buff's icon) |

```bash
python3 scripts/art/fetch_map_icons.py              # all five
python3 scripts/art/fetch_map_icons.py walker       # just these
```

The script (stdlib only) asks the CDN first and the MediaWiki API second, with a
User-Agent naming this project, and downscales each file to 128 px with ffmpeg
(Lanczos; any ffmpeg will do, the files stay PNG). The board draws them in
`src/ui/board/MapIcon.tsx`, the art on the graphite ground inside its owner's
keyline. Credits: `public/art/CREDITS.md` and `src/art/credits.ts`.

## The backdrop

Every sheet floats on `public/art/menu_scene_ground.png`: the night scene
(`public/art/menu_scene.jpg`) with its blur, grade and teal wash baked in, so
`PosterBackdrop` draws a plain image instead of running a CSS filter on every
frame. Its vignette and grain stay live CSS on top. After changing the scene or
the look, re-bake it (ffmpeg, from the project root):

```bash
sh scripts/art/bake_backdrop.sh            # → public/art/menu_scene_ground.png, 320x180
```

The script spells out how the old CSS (`blur(18px) saturate(0.85)
brightness(0.6)` under an `rgba(6, 24, 20, 0.36)` wash) became its numbers.
Keep it a PNG: JPEG's 8x8 blocks show as faint squares once scaled up.

## The map's paper tooth

The story map's sheet is printed with `public/art/paper_mottle.png`, a 160px
see-through tile baked from `PAPER_MOTTLE` (the feTurbulence SVG in
`src/ui/poster.ts`). The map used to lay the SVG itself over the sheet with
`mix-blend-mode: multiply`, which ran the turbulence again for every tile the
sheet rasterised; the tile is drawn plainly, with no blend mode, and its colour
and alpha are fitted so it lands where the multiply did on the papers and the
water. After changing the mottle or those inks, re-bake it (headless Chrome and
ffmpeg, from the project root):

```bash
node scripts/art/bake_mottle.mjs            # → public/art/paper_mottle.png
```

`PAPER_MOTTLE` itself stays: the other sheets use it as a plain background and
are not rasterised tile by tile.

## Gotchas

- **A MISS means the wiki has no `File:<Card Name>.png`.** Check the card's
  name against the item's wiki page; TCG-only cards have no canon art and fall
  back to the procedural SVG in `src/ui/card/CardFrame.tsx` (`FallbackGlyph`).
- **Type decides the folder.** The renderer looks in `spells/` for spells and
  `items/` for equipment, so moving a card between the two files needs a
  re-fetch (and the old file deleted).
- **Hero portraits** still come from the dead deadlock-api bucket mapping
  above; they are already in `public/heroes/` and need no re-run.
