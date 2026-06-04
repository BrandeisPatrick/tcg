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

const AI_DECKS = [AI_DECK_BALANCED, AI_DECK_AGGRO, AI_DECK_CONTROL];

export function getAIDeck(): CardId[] {
  const deck = [...AI_DECKS[Math.floor(Math.random() * AI_DECKS.length)]];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
