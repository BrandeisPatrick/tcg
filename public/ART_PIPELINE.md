# Card art pipeline

All hero / spell / item `.webp` files in `public/heroes/`, `public/spells/`, and
`public/items/` are pulled from the community-maintained **Deadlock Assets API**:

- Metadata index: `https://assets.deadlock-api.com/v2/items`
- Asset bucket:   `https://assets-bucket.deadlock-api.com/assets-api-res/images/...`

The API serves a JSON catalogue of every Deadlock item. Each entry includes
`image_webp` (small icon), `shop_image_webp` (the larger painted shop tile),
and `is_active_item` (true = cast/active, false = passive). We use
`shop_image_webp` because it's the only one big enough to fill a card art
window. Heroes pull from `images/heroes/{slug}_card.webp` directly.

## Type contract (verified by audit)

- **Spells** in our TCG map ONLY to canon items with `is_active_item == true`.
- **Equipment** in our TCG map ONLY to canon items with `is_active_item == false`.
- Single exception: `soul_rebirth` is a TCG-original mythic (no canon active item
  with that mechanic), so it's a spell with Rejuvenating Aurora's art for flavor.

If you add a new card, audit it before shipping:

```bash
python3 -c "
import json
data = json.load(open('/tmp/dl_items.json'))
item = next(d for d in data if d['name'].lower() == 'YOUR_CANON_NAME'.lower())
print('is_active_item:', item.get('is_active_item'))
"
# True => place in SP_MAP (spells.ts).
# False => place in EQ_MAP (equipment.ts).
```

## Re-running the fetch

When you add a new card or want to refresh art, edit the mapping in the script
that matches the card type, then re-run it. Files overwrite in place.

### Items (passive equipment) + Spells (active items)

`scripts/fetch_item_art.py`:

```python
#!/usr/bin/env python3
"""
Fetch shop_image_webp for every TCG card from deadlock-api.com.
Edit EQ_MAP / SP_MAP to add new cards. Run from project root.
"""
import json, os, sys, urllib.request

# TCG card id -> Deadlock item name (as it appears in the v2/items catalogue)
EQ_MAP = {
    'basic_magazine':      'Extended Magazine',
    'headshot_booster':    'Headshot Booster',
    'extra_health':        'Extra Health',
    'improved_spirit':     'Improved Spirit',
    'improved_cooldown':   'Compress Cooldown',   # renamed in canon; was 'Improved Cooldown'
    'berserker':           'Berserker',
    'bullet_armor':        'Bullet Armor',
    'enduring_spirit':     'Enduring Spirit',
    'extra_regen':         'Extra Regen',
    'melee_lifesteal':     'Melee Lifesteal',
    'metal_skin':          'Metal Skin',
    'monster_rounds':      'Monster Rounds',
    'spirit_armor':        'Spirit Armor',
    'spirit_strike':       'Spirit Strike',
    'frenzy':              'Frenzy',
    'diviners_kevlar':     "Diviner's Kevlar",
    'divine_barrier':      'Divine Barrier',
    'titanic_magazine':    'Titanic Magazine',
    'mystic_reverb':       'Mystic Reverb',
    'boundless_spirit':    'Boundless Spirit',
}

SP_MAP = {
    'healing_rite':         'Healing Rite',
    'mystic_burst':         'Mystic Burst',
    'mystic_vulnerability': 'Mystic Vulnerability',
    'cold_front':           'Cold Front',
    'decay':                'Decay',
    'enchanter_barrier':    'Reactive Barrier',
    'ethereal_shift':       'Ethereal Shift',
    'phantom_strike':       'Phantom Strike',
    'return_fire':          'Return Fire',
    'sprint_boots':         'Sprint Boots',
    'debuff_remover':       'Debuff Reducer',
    'withering_whip':       'Wither & Die',
    'surge_of_power':       'Surge of Power',
    'echo_shard':           'Echo Shard',
    'inhibitor':            'Inhibitor',
    'knockdown':            'Knockdown',
    'silence_glyph':        'Silencer',
    'suppressor':           'Suppressor',
    'slowing_hex':          'Slowing Hex',
    'curse':                'Cursed Relic',   # renamed in canon; was 'Curse'
    'soul_rebirth':         'Rejuvenating Aurora',   # canon Vitality T4 revive-on-death; flavor match
}

API = 'https://assets.deadlock-api.com/v2/items'
CATALOGUE = '/tmp/dl_items.json'

def load_catalogue():
    if not os.path.exists(CATALOGUE):
        opener = urllib.request.build_opener()
        opener.addheaders = [('User-Agent', 'Mozilla/5.0')]
        urllib.request.install_opener(opener)
        urllib.request.urlretrieve(API, CATALOGUE)
    data = json.load(open(CATALOGUE))
    return {d['name'].lower(): d for d in data if d.get('name')}

def fetch(card_id, item_name, out_dir, by_name):
    item = by_name.get(item_name.lower())
    if not item:
        print(f'MISS {card_id}: "{item_name}" not in catalogue')
        return
    url = item.get('shop_image_webp') or item.get('shop_image') \
        or item.get('image_webp') or item.get('image')
    if not url:
        print(f'NO_URL {card_id}')
        return
    out = f'{out_dir}/{card_id}.webp'
    try:
        urllib.request.urlretrieve(url, out)
        print(f'OK   {card_id:25s} <- {item_name} ({os.path.getsize(out)} B)')
    except Exception as e:
        print(f'FAIL {card_id}: {e}')

def main():
    os.makedirs('public/items', exist_ok=True)
    os.makedirs('public/spells', exist_ok=True)

    # Headers — the bucket sometimes 403s without a referer
    opener = urllib.request.build_opener()
    opener.addheaders = [
        ('User-Agent', 'Mozilla/5.0'),
        ('Referer', 'https://deadlock-api.com/'),
    ]
    urllib.request.install_opener(opener)

    by_name = load_catalogue()
    print(f'Loaded {len(by_name)} items from catalogue\n')

    # Allow filtering: `python3 scripts/fetch_item_art.py curse mystic_burst`
    only = set(sys.argv[1:])

    print('=== Equipment ===')
    for cid, name in EQ_MAP.items():
        if only and cid not in only: continue
        fetch(cid, name, 'public/items', by_name)

    print('\n=== Spells ===')
    for cid, name in SP_MAP.items():
        if only and cid not in only: continue
        fetch(cid, name, 'public/spells', by_name)

if __name__ == '__main__':
    main()
```

Usage:

```bash
# Fetch everything (overwrites existing files)
python3 scripts/fetch_item_art.py

# Fetch just one or a few cards
python3 scripts/fetch_item_art.py curse surge_of_power
```

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

## Gotchas

- **Wrong category will MISS silently.** Spells and items are pulled into
  separate directories; if you put `'sprint_boots'` in `EQ_MAP` instead of
  `SP_MAP`, the file lands in `public/items/` and the renderer (which looks
  in `public/spells/sprint_boots.webp` for spells) won't find it.
- **Some TCG cards are renamed for flavor.** `enchanter_barrier` → Deadlock's
  `Reactive Barrier`; `withering_whip` → `Wither & Die`; `silence_glyph` →
  `Silencer`; `debuff_remover` → `Debuff Reducer`; `basic_magazine` →
  `Extended Magazine`. Always check the catalogue if a fetch MISSes.
- **TCG originals have no canon art.** `soul_rebirth` is invented; the
  procedural SVG fallback in `src/ui/CardFrame.tsx` `FallbackGlyph` handles it.
  Same for any future TCG-only cards.
- **The catalogue is cached at `/tmp/dl_items.json`.** Delete it to force a
  fresh download (e.g., after Valve updates the game).
