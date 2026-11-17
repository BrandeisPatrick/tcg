import type { CardId } from '@/engine/types';

/**
 * Ready decks: a squad of three heroes (SQUAD_SIZE) and the 16 items of their deck, made to
 * be picked and played as they are (the Loadout's "Ready decks" row). Since 2026-11-16 there
 * are seven, one for each archetype Patrick named ("bullet one target, bullet many targets,
 * spirit burst, spirit area, CC, Graves, tank and support"), each hero in one of them; the
 * eighth, Crossfire (2026-11-17), mixes the two damage types, each opening the target for
 * the other, so it seats Mirage, the one hero left out, beside Haze and Kelvin. Every
 * choice is reasoned in docs/deck-plan.md. No sim ran.
 *
 *  - 16 items at most 28 souls at the prices they print, and at most two of them over 2
 *    souls: the deck's payoffs. The lane pays 2 a turn, so a side has about 30 souls by its
 *    turn 9 for the 11 or so items it draws: every one of them can be played.
 *  - At most MAX_COPIES (4) of one card (Patrick, 2026-11-16): a deck leans on its engine.
 *  - At least one upgrade beside the item it is built from (played onto the hero wearing
 *    that item, the upgrade costs only the difference).
 *  - A counter: Counterspell, Debuff Reducer, Dispel Magic or Knockdown.
 *  - One Golden Goose Egg (draw 2), no more: running out of cards loses (2026-11-16).
 *  - Mostly equipment: spells are played once, so at most half the deck.
 */
export interface ReadyDeck {
  id: string;
  name: string;
  /** One line: how it wins. */
  blurb: string;
  /** The squad, in pick order: the first is the natural first Active. */
  heroes: [CardId, CardId, CardId];
  /** The 16 items, cheapest tier first. */
  items: CardId[];
}

const n = (k: number, id: CardId): CardId[] => Array.from({ length: k }, () => id);

export const READY_DECKS: readonly ReadyDeck[] = [
  {
    id: 'headshot',
    name: 'Headshot',
    blurb: 'One gun at a time, one target: every swing finds a bonus, full HP, above half or below it.',
    heroes: ['hero_drifter', 'hero_vindicta', 'hero_wraith'],
    items: [
      // Kinetic Dash is built from Extra Stamina since 2026-11-17: one of each.
      ...n(4, 'headshot_booster'), ...n(2, 'extended_magazine'), 'restorative_shot', 'golden_goose_egg', 'extra_stamina',
      ...n(2, 'opening_rounds'), 'titanic_magazine', 'kinetic_dash',
      'knockdown', 'headhunter', 'express_shot',
    ],
  },
  {
    id: 'spray',
    name: 'Spray',
    blurb: 'Every swing hits them all: Split Shot and Tesla spread it, Stalker bleeds and shreds each one, Haze ends it.',
    heroes: ['hero_warden', 'hero_haze', 'hero_silver'],
    items: [
      // Kinetic Dash beside Extra Stamina, its component since 2026-11-17 (a Magazine out for it).
      ...n(3, 'extended_magazine'), 'extra_stamina', 'restorative_shot', 'golden_goose_egg',
      ...n(4, 'split_shot'), 'titanic_magazine', ...n(2, 'stalker'), 'kinetic_dash',
      'knockdown', 'tesla_bullets',
    ],
  },
  {
    id: 'nuke',
    name: 'Nuke',
    blurb: 'Every skill is a kill shot: Tankbuster and Mystic Burst ride it, Echo Shard casts it twice, Infuser heals off it.',
    heroes: ['hero_lady_geist', 'hero_shiv', 'hero_yamato'],
    items: [
      ...n(2, 'extra_spirit'), ...n(3, 'mystic_burst'), 'golden_goose_egg',
      ...n(2, 'improved_spirit'), ...n(2, 'mystic_vulnerability'), 'spirit_lifesteal',
      'knockdown', 'improved_burst',
      ...n(2, 'echo_shard'), 'infuser',
    ],
  },
  {
    id: 'storm',
    name: 'Storm',
    blurb: "Area skills on every enemy, and Greater Expansion turns Seven's one-target charge into a storm.",
    heroes: ['hero_kelvin', 'hero_lash', 'hero_seven'],
    items: [
      ...n(4, 'extra_spirit'), ...n(2, 'mystic_expansion'), 'extra_charge', 'golden_goose_egg',
      ...n(2, 'improved_spirit'), ...n(2, 'mystic_vulnerability'), 'mystic_slow',
      'knockdown', 'greater_expansion', 'torment_pulse',
    ],
  },
  {
    id: 'lockdown',
    name: 'Lockdown',
    blurb: 'Stun, disarm, silence and lock their spells, each a turn longer, until their deck runs dry.',
    heroes: ['hero_mo_krill', 'hero_sinclair', 'hero_viscous'],
    items: [
      'rusted_barrel', ...n(4, 'extra_health'), ...n(2, 'extra_regen'), 'golden_goose_egg',
      ...n(2, 'duration_extender'), 'slowing_hex',
      ...n(2, 'knockdown'), 'disarming_hex', 'superior_duration', 'silence_glyph',
    ],
  },
  {
    id: 'graveyard',
    name: 'Graveyard',
    blurb: 'Grind them out: Abrams holds the lane, Rem puts their carry to sleep, and every Ghoul that falls mills a card.',
    heroes: ['hero_abrams', 'hero_graves', 'hero_rem'],
    items: [
      ...n(4, 'extra_health'), ...n(2, 'extra_regen'), 'healing_rite', 'golden_goose_egg',
      'debuff_reducer', 'weapon_shielding', 'spirit_shielding', ...n(2, 'mystic_slow'), 'healbane',
      'fortitude', 'healing_nova',
    ],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: "Heal and shield every turn: Victor's aura wounds them all, and a hero Dynamo heals swings harder and retreats free.",
    heroes: ['hero_victor', 'hero_dynamo', 'hero_paige'],
    items: [
      ...n(3, 'extra_health'), 'extra_regen', ...n(2, 'healing_rite'), 'sprint_boots', 'restorative_shot', 'extended_magazine', 'golden_goose_egg',
      ...n(2, 'healing_booster'), 'enduring_speed', 'restorative_locket', 'debuff_reducer',
      'healing_tempo',
    ],
  },
  {
    id: 'crossfire',
    name: 'Crossfire',
    blurb: "Spirit opens them for the gun and the gun for spirit: Kelvin's grenade cuts Bullet Resist, Haze's swings cut Spirit Resist, Mirage's mark cashes it.",
    heroes: ['hero_haze', 'hero_mirage', 'hero_kelvin'],
    items: [
      ...n(3, 'extra_spirit'), ...n(2, 'spirit_strike'), ...n(2, 'extended_magazine'), 'golden_goose_egg',
      ...n(3, 'bullet_resist_shredder'), 'spirit_shredder', 'cold_front',
      'knockdown', 'alchemical_fire', 'spirit_rend',
    ],
  },
];

/** The ready deck a squad and a deck match exactly (the same heroes in the
 *  same order, the same items in any order), or undefined. */
export function readyDeckInUse(squad: readonly (CardId | null)[], deck: readonly CardId[]): ReadyDeck | undefined {
  const sorted = [...deck].sort().join('|');
  return READY_DECKS.find((d) => d.heroes.every((h, i) => squad[i] === h) && [...d.items].sort().join('|') === sorted);
}
