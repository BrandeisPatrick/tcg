import type { CardId } from '@/engine/types';

/**
 * Ready decks: a squad of four heroes and the 16 items of their deck, made to
 * be picked and played as they are (the Loadout's "Ready decks" row). Each is
 * a legal deck (`deckProblem`, decks.ts) built to one recipe, written down in
 * docs/deck-plan.md ("Ready decks"):
 *
 *  - Base items only, at most 2 copies of one (Pokémon TCG Pocket's rule,
 *    inside this game's cap of MAX_COPIES).
 *  - The curve of a lane that pays 2 souls a turn: 8 tier-1, 6 tier-2 and 2
 *    tier-3 items, 56 souls in all. The dearer tiers arrive as upgrades:
 *    playing a base item shuffles what it builds into the deck.
 *  - Two Compress Cooldown (`improved_cooldown`) in every deck: the draw
 *    engine, as every Pocket deck carries its two Professor's Research.
 *  - The rest comes from the squad's own builds (their base items), so each
 *    hero finds something made for it.
 */
export interface ReadyDeck {
  id: string;
  name: string;
  /** One line: how it wins. */
  blurb: string;
  /** The squad, in pick order: the first is the natural first Active. */
  heroes: [CardId, CardId, CardId, CardId];
  /** The 16 items, cheapest tier first. */
  items: CardId[];
}

/** `id` twice. */
const x2 = (id: CardId): CardId[] => [id, id];

export const READY_DECKS: readonly ReadyDeck[] = [
  {
    id: 'gunline',
    name: 'Gunline',
    blurb: 'Out-gun the lane. Warden holds it while Vindicta and Haze shoot.',
    heroes: ['hero_warden', 'hero_vindicta', 'hero_haze', 'hero_paige'],
    items: [
      ...x2('extended_magazine'), ...x2('headshot_booster'), ...x2('restorative_shot'), ...x2('grit'),
      ...x2('improved_cooldown'), ...x2('active_reload'), 'long_range', 'opening_rounds',
      'burst_fire', 'toxic_bullets',
    ],
  },
  {
    id: 'spirit_storm',
    name: 'Spirit Storm',
    blurb: 'Skills that hit every enemy, and the items that feed on them.',
    heroes: ['hero_lady_geist', 'hero_seven', 'hero_lash', 'hero_kelvin'],
    items: [
      ...x2('extra_spirit'), ...x2('mystic_burst'), ...x2('mystic_regeneration'), ...x2('spirit_strike'),
      ...x2('improved_cooldown'), ...x2('cold_front'), 'mystic_vulnerability', 'spirit_lifesteal',
      'knockdown', 'torment_pulse',
    ],
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    blurb: "Outlast them. Heal and shield while Victor's aura grinds them down.",
    heroes: ['hero_abrams', 'hero_viscous', 'hero_victor', 'hero_rem'],
    items: [
      ...x2('extra_health'), ...x2('extra_regen'), ...x2('grit'), ...x2('healing_rite'),
      ...x2('improved_cooldown'), ...x2('bullet_lifesteal'), 'healing_booster', 'battle_vest',
      'bullet_resilience', 'torment_pulse',
    ],
  },
  {
    id: 'ambush',
    name: 'Ambush',
    blurb: 'Swap in, strike, swap out. Cheap Retreats and extra attacks.',
    heroes: ['hero_silver', 'hero_yamato', 'hero_mirage', 'hero_drifter'],
    items: [
      ...x2('sprint_boots'), ...x2('extended_magazine'), ...x2('restorative_shot'), ...x2('headshot_booster'),
      ...x2('improved_cooldown'), ...x2('kinetic_dash'), 'fleetfoot', 'swift_striker',
      'tesla_bullets', 'berserker',
    ],
  },
  {
    id: 'lockdown',
    name: 'Lockdown',
    blurb: 'Silence, disarm and stun, then Wraith finishes it.',
    heroes: ['hero_mo_krill', 'hero_sinclair', 'hero_dynamo', 'hero_wraith'],
    items: [
      ...x2('rusted_barrel'), ...x2('spirit_strike'), ...x2('extra_spirit'), 'healing_rite', 'extra_health',
      ...x2('improved_cooldown'), ...x2('slowing_hex'), 'mystic_shot', 'spirit_lifesteal',
      'knockdown', 'silence_glyph',
    ],
  },
];

/** The ready deck a squad and a deck match exactly (the same heroes in the
 *  same order, the same items in any order), or undefined. */
export function readyDeckInUse(squad: readonly (CardId | null)[], deck: readonly CardId[]): ReadyDeck | undefined {
  const sorted = [...deck].sort().join('|');
  return READY_DECKS.find((d) => d.heroes.every((h, i) => squad[i] === h) && [...d.items].sort().join('|') === sorted);
}
