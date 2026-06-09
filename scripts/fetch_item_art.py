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
# Card-id keys map to the CANON item name used to look up shop art.
# bullet_resist/spirit_resist are V1 card renames that still source art
# from canon Bullet/Spirit Armor.
EQ_MAP = {
    'basic_magazine':       'Extended Magazine',
    'extended_magazine':    'Extended Magazine',
    'headshot_booster':     'Headshot Booster',
    'extra_health':         'Extra Health',
    'extra_spirit':         'Improved Spirit',
    'improved_spirit':      'Improved Spirit',
    'improved_cooldown':    'Compress Cooldown',   # renamed in canon
    'mystic_burst':         'Mystic Burst',         # passive: bullet bonus on skill hit
    'sprint_boots':         'Sprint Boots',         # passive: +speed/stamina
    'berserker':            'Berserker',
    'bullet_resist':        'Bullet Armor',         # V1 rename: art still from canon Bullet Armor
    'spirit_resist':        'Spirit Armor',         # V1 rename: art still from canon Spirit Armor
    'enduring_spirit':      'Enduring Spirit',
    'extra_regen':          'Extra Regen',
    'melee_lifesteal':      'Melee Lifesteal',
    'monster_rounds':       'Monster Rounds',
    'restorative_shot':     'Restorative Shot',     # V1 rename of bullet_lifesteal
    'mystic_regeneration':  'Mystic Regeneration',  # V1 rename of spirit_lifesteal
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
    'mystic_expansion':     'Mystic Expansion',     # T1 spirit: +ability range (NEW)
    'healing_booster':      'Healing Booster',
    'weapon_shielding':     'Weapon Shielding',
    'spirit_shielding':     'Spirit Shielding',
    'glass_cannon':         'Glass Cannon',
    'healing_tempo':        'Healing Tempo',
    'bullet_resilience':    'Bullet Resilience',
    'spirit_resilience':    'Spirit Resilience',
    'bullet_resist_shredder': 'Bullet Resist Shredder',
    # --- Newer cards (canon names) ---
    'burst_fire':           'Burst Fire',
    'ricochet':             'Ricochet',
    'toxic_bullets':        'Toxic Bullets',
    'tesla_bullets':        'Tesla Bullets',
    'crippling_headshot':   'Crippling Headshot',
    'colossus':             'Colossus',
    'leech':                'Leech',
    'siphon_bullets':       'Siphon Bullets',
    'escalating_exposure':  'Escalating Exposure',
    'superior_duration':    'Superior Duration',
    'reactive_barrier':     'Reactive Barrier',
    'bullet_lifesteal':     'Bullet Lifesteal',
    'spirit_lifesteal':     'Spirit Lifesteal',
    'improved_burst':       'Mystic Burst',
    'superior_cooldown':    'Compress Cooldown',      # cooldown family art
    'transcendent_cooldown':'Compress Cooldown',
    'improved_bullet_armor':'Bullet Armor',
    'improved_spirit_armor':'Spirit Armor',
}

# --- Active items (rendered as Spells / one-shot casts) ---
SP_MAP = {
    'healing_rite':         'Healing Rite',
    'cold_front':           'Cold Front',
    'decay':                'Decay',
    'ethereal_shift':       'Ethereal Shift',
    'phantom_strike':       'Phantom Strike',
    'echo_shard':           'Echo Shard',
    'knockdown':            'Knockdown',
    'silence_glyph':        'Silencer',
    'disarming_hex':        'Disarming Hex',
    'metal_skin':           'Metal Skin',           # active: bullet resist burst
    'curse':                'Cursed Relic',         # renamed in canon
    'divine_barrier':       'Divine Barrier',       # active: cast shield
    'soul_rebirth':         'Soul Rebirth',         # canon-faithful: passive respawn-on-death (canon is T4 passive equipment)
    'rusted_barrel':        'Rusted Barrel',        # T1 spirit active (NEW)
    'golden_goose_egg':     'Golden Goose Egg',     # T1 spirit active (NEW)
    'spirit_sap':           'Spirit Sap',
    'slowing_hex':          'Slowing Hex',
    'healbane':             'Healbane',
    # --- Newer active items (canon names) ---
    'active_reload':        'Active Reload',
    'unstoppable':          'Unstoppable',
    'debuff_remover':       'Debuff Reducer',  # closest canon (no active "Debuff Remover")
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
