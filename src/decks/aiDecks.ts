import type { CardId } from '@/engine/types';

// Each archetype now carries a spread across all three build axes — Weapon
// (extended/titanic magazine…), Spirit (extra/improved/boundless spirit), and
// Vitality (extra_health, resists) — so whatever heroes are drafted, the deck
// can itemize toward their lean. (Previously Spirit gear was almost absent, so
// casters could never scale.)

const AI_DECK_BALANCED: CardId[] = [
  'healing_rite', 'rusted_barrel',
  'cold_front', 'slowing_hex',
  'extended_magazine', 'titanic_magazine',   // Weapon
  'extra_spirit', 'improved_spirit',         // Spirit
  'extra_health', 'bullet_resilience',       // Vitality
  'healing_booster', 'restorative_shot',
  'mystic_regeneration', 'knockdown',
];

const AI_DECK_AGGRO: CardId[] = [
  'rusted_barrel', 'cold_front', 'decay',
  'extended_magazine', 'titanic_magazine', 'titanic_magazine', 'glass_cannon',  // Weapon
  'extra_spirit', 'improved_spirit',         // Spirit (so even aggro can run a caster)
  'bullet_resist_shredder',
  'extra_regen', 'restorative_shot', 'healing_rite',
];

const AI_DECK_CONTROL: CardId[] = [
  'healing_rite', 'slowing_hex', 'healbane', 'metal_skin', 'disarming_hex',
  'extra_spirit', 'improved_spirit', 'boundless_spirit',   // Spirit-heavy
  'extra_health', 'spirit_resilience', 'bullet_resilience', // Vitality
  'healing_booster', 'weapon_shielding', 'mystic_regeneration',
];

export type ArchetypeName = 'balanced' | 'aggro' | 'control';
export const AI_DECKS_BY_NAME: Record<ArchetypeName, CardId[]> = {
  balanced: AI_DECK_BALANCED,
  aggro: AI_DECK_AGGRO,
  control: AI_DECK_CONTROL,
};
const ARCHETYPE_NAMES = Object.keys(AI_DECKS_BY_NAME) as ArchetypeName[];

// Eval harness can force a specific archetype for the NEXT getAIDeck() call
// (consumed once, then cleared) so it can run clean archetype-vs-archetype
// matchups. null = pick randomly, as in normal play.
let _forcedNext: ArchetypeName | null = null;
export function forceNextArchetype(name: ArchetypeName | null): void { _forcedNext = name; }

/** Returns a shuffled deck plus which archetype it is (for win-rate tracking). */
export function getAIDeckTagged(): { cards: CardId[]; archetype: ArchetypeName } {
  const archetype = _forcedNext ?? ARCHETYPE_NAMES[Math.floor(Math.random() * ARCHETYPE_NAMES.length)];
  _forcedNext = null;
  const deck = [...AI_DECKS_BY_NAME[archetype]];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { cards: deck, archetype };
}

export function getAIDeck(): CardId[] {
  return getAIDeckTagged().cards;
}
