#!/usr/bin/env python3
"""
Fetch shop_image_webp for every TCG card from deadlock-api.com.

Edit EQ_MAP / SP_MAP below to add new cards. Run from project root:

    python3 scripts/fetch_item_art.py             # fetch everything
    python3 scripts/fetch_item_art.py curse       # fetch one
    python3 scripts/fetch_item_art.py curse mystic_burst   # fetch a few

See public/ART_PIPELINE.md for the full pipeline + gotchas.
"""
import json, os, sys, urllib.request

# --- Passive items (rendered as Equipment) ---
EQ_MAP = {
    'basic_magazine':       'Extended Magazine',
    'headshot_booster':     'Headshot Booster',
    'extra_health':         'Extra Health',
    'improved_spirit':      'Improved Spirit',
    'improved_cooldown':    'Compress Cooldown',   # renamed in canon
    'mystic_burst':         'Mystic Burst',         # passive: bullet bonus on skill hit
    'sprint_boots':         'Sprint Boots',         # passive: +speed/stamina
    'berserker':            'Berserker',
    'bullet_armor':         'Bullet Armor',
    'enduring_spirit':      'Enduring Spirit',
    'extra_regen':          'Extra Regen',
    'melee_lifesteal':      'Melee Lifesteal',
    'monster_rounds':       'Monster Rounds',
    'spirit_armor':         'Spirit Armor',
    'spirit_strike':        'Spirit Strike',
    'mystic_vulnerability': 'Mystic Vulnerability', # passive: skill hits apply vuln
    'enchanter_barrier':    'Reactive Barrier',     # passive: shield triggers on damage
    'debuff_remover':       'Debuff Reducer',       # passive: debuff duration -1
    'suppressor':           'Suppressor',           # passive: silence on parry
    'frenzy':               'Frenzy',
    'diviners_kevlar':      "Diviner's Kevlar",
    'surge_of_power':       'Surge of Power',       # passive: stacks per skill use
    'titanic_magazine':     'Titanic Magazine',
    'mystic_reverb':        'Mystic Reverb',
    'boundless_spirit':     'Boundless Spirit',
    'inhibitor':            'Inhibitor',            # passive mythic: stacks ability resist
    'close_quarters':       'Close Quarters',       # T1 weapon: +ATK at close range (NEW)
    'extra_stamina':        'Extra Stamina',        # T1 vitality: passive stamina (NEW)
    'mystic_expansion':     'Mystic Expansion',     # T1 spirit: +ability range (NEW)
}

# --- Active items (rendered as Spells / one-shot casts) ---
SP_MAP = {
    'healing_rite':         'Healing Rite',
    'cold_front':           'Cold Front',
    'decay':                'Decay',
    'ethereal_shift':       'Ethereal Shift',
    'phantom_strike':       'Phantom Strike',
    'return_fire':          'Return Fire',
    'echo_shard':           'Echo Shard',
    'knockdown':            'Knockdown',
    'silence_glyph':        'Silencer',
    'disarming_hex':        'Disarming Hex',        # replaces withering_whip
    'metal_skin':           'Metal Skin',           # active: bullet resist burst
    'slowing_hex':          'Slowing Hex',
    'curse':                'Cursed Relic',         # renamed in canon
    'divine_barrier':       'Divine Barrier',       # active: cast shield
    'soul_rebirth':         'Rejuvenating Aurora',  # flavor match; TCG-original mechanic
    'rusted_barrel':        'Rusted Barrel',        # T1 spirit active (NEW)
    'golden_goose_egg':     'Golden Goose Egg',     # T1 spirit active (NEW)
}

API = 'https://assets.deadlock-api.com/v2/items'
CATALOGUE = '/tmp/dl_items.json'


def load_catalogue():
    if not os.path.exists(CATALOGUE):
        urllib.request.urlretrieve(API, CATALOGUE)
    data = json.load(open(CATALOGUE))
    return {d['name'].lower(): d for d in data if d.get('name')}


def fetch(card_id, item_name, out_dir, by_name):
    item = by_name.get(item_name.lower())
    if not item:
        print(f'MISS {card_id}: "{item_name}" not in catalogue')
        return
    url = (item.get('shop_image_webp') or item.get('shop_image')
           or item.get('image_webp') or item.get('image'))
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

    opener = urllib.request.build_opener()
    opener.addheaders = [
        ('User-Agent', 'Mozilla/5.0'),
        ('Referer', 'https://deadlock-api.com/'),
    ]
    urllib.request.install_opener(opener)

    by_name = load_catalogue()
    print(f'Loaded {len(by_name)} items from catalogue\n')

    only = set(sys.argv[1:])

    print('=== Equipment ===')
    for cid, name in EQ_MAP.items():
        if only and cid not in only:
            continue
        fetch(cid, name, 'public/items', by_name)

    print('\n=== Spells ===')
    for cid, name in SP_MAP.items():
        if only and cid not in only:
            continue
        fetch(cid, name, 'public/spells', by_name)


if __name__ == '__main__':
    main()
