import type { CardId } from '@/engine/types';

/**
 * Ready decks: a squad of three heroes (SQUAD_SIZE) and the 16 items of their deck, made to
 * be picked and played as they are (the Loadout's "Ready decks" row). Each is a legal deck
 * (`deckProblem`, decks.ts) built to one recipe; every choice is reasoned in docs/deck-plan.md
 * ("Redesigned 2026-11-16: the ready decks by reasoning"). No sim ran.
 *
 *  - 16 items at most 56 souls at the prices they print (a spell priced for one play counts
 *    its own price), and at most two of them over 4 souls: the deck's payoffs. The lane pays
 *    2 a turn, so a side has about 30 souls by its turn 9 for the 11 or so items it draws.
 *  - At most 2 copies of one card (Pokémon TCG Pocket's rule, inside MAX_COPIES).
 *  - One upgrade line beside the item it is built from (played onto the hero wearing that
 *    item, the upgrade costs only the difference); never an upgrade without its component.
 *  - A counter (docs/card-design.md, "Counters"): Counterspell, Debuff Reducer, Dispel Magic
 *    or Knockdown.
 *  - One draw card, Golden Goose Egg (draw 2); Graveyard carries two, to find its Ghouls too.
 *  - Mostly equipment: spells are played once, so at most half the deck.
 *  - Built for the rules of 2026-11-16: a side swings twice a turn when its Retreat is free
 *    (attack, Retreat, attack), so free Retreats and what a hero gets for stepping in are worth
 *    a swing; the Cooldown items shorten every wait, a charged skill's too; Healing Tempo turns
 *    a heal into a swing and a free Retreat.
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

const x2 = (id: CardId): CardId[] => [id, id];

export const READY_DECKS: readonly ReadyDeck[] = [
  {
    id: 'gunline',
    name: 'Gunline',
    blurb: 'Two shots a turn. Warden holds the lane, retreats for free, and Vindicta or Haze shoots again.',
    heroes: ['hero_warden', 'hero_vindicta', 'hero_haze'],
    items: [
      ...x2('extended_magazine'), ...x2('headshot_booster'), ...x2('restorative_shot'), 'grit', 'golden_goose_egg',
      ...x2('swift_striker'), 'kinetic_dash', 'titanic_magazine', 'improved_cooldown',
      'knockdown', 'burst_fire', 'toxic_bullets',
    ],
  },
  {
    id: 'spirit_storm',
    name: 'Spirit Storm',
    blurb: "Three skills that hit every enemy, cast more often: Lash and Kelvin soften, Seven's storm finishes.",
    heroes: ['hero_lash', 'hero_seven', 'hero_kelvin'],
    items: [
      ...x2('extra_spirit'), ...x2('mystic_burst'), 'mystic_regeneration', 'extra_charge', 'healing_rite', 'golden_goose_egg',
      ...x2('improved_spirit'), ...x2('improved_cooldown'), 'mystic_vulnerability',
      'knockdown', 'torment_pulse', 'superior_cooldown',
    ],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: "Victor's aura wounds them all, Dynamo's aurora heals your side into a free Retreat, and Drifter finishes the wounded.",
    heroes: ['hero_victor', 'hero_dynamo', 'hero_drifter'],
    items: [
      ...x2('extended_magazine'), ...x2('extra_health'), ...x2('healing_rite'), 'restorative_shot', 'grit', 'sprint_boots', 'golden_goose_egg',
      'healing_booster', 'improved_cooldown', 'kinetic_dash', 'bullet_lifesteal', 'debuff_reducer',
      'healing_tempo',
    ],
  },
  {
    id: 'ambush',
    name: 'Ambush',
    blurb: 'Swap in, strike, swap again: every hero that steps in hits for 3 more.',
    heroes: ['hero_silver', 'hero_yamato', 'hero_mirage'],
    items: [
      ...x2('extended_magazine'), ...x2('headshot_booster'), 'restorative_shot', 'grit', 'golden_goose_egg',
      ...x2('kinetic_dash'), 'titanic_magazine', 'swift_striker', 'improved_cooldown',
      'majestic_leap', 'knockdown', 'tesla_bullets', 'burst_fire',
    ],
  },
  {
    id: 'lockdown',
    name: 'Lockdown',
    blurb: 'Disarm, silence and hex them every turn, then Wraith shoots twice.',
    heroes: ['hero_mo_krill', 'hero_sinclair', 'hero_wraith'],
    items: [
      'rusted_barrel', ...x2('extended_magazine'), ...x2('extra_health'), 'grit', 'golden_goose_egg',
      'slowing_hex', ...x2('improved_cooldown'), 'titanic_magazine',
      ...x2('disarming_hex'), 'knockdown', 'superior_cooldown', 'burst_fire',
    ],
  },
  {
    id: 'graveyard',
    name: 'Graveyard',
    blurb: 'Graves fills your deck with Ghouls and roots what would swap away; every Ghoul that falls costs them a card.',
    heroes: ['hero_viscous', 'hero_graves', 'hero_lady_geist'],
    items: [
      ...x2('extra_spirit'), ...x2('golden_goose_egg'), 'healing_rite', 'extra_health', 'mystic_burst', 'mystic_regeneration',
      'improved_spirit', ...x2('improved_cooldown'), 'mystic_slow', 'spirit_lifesteal', 'debuff_reducer',
      'torment_pulse', 'decay',
    ],
  },
];

/** The ready deck a squad and a deck match exactly (the same heroes in the
 *  same order, the same items in any order), or undefined. */
export function readyDeckInUse(squad: readonly (CardId | null)[], deck: readonly CardId[]): ReadyDeck | undefined {
  const sorted = [...deck].sort().join('|');
  return READY_DECKS.find((d) => d.heroes.every((h, i) => squad[i] === h) && [...d.items].sort().join('|') === sorted);
}
