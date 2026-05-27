import type { CardId } from '@/engine/types';

const AI_DECK_BALANCED: CardId[] = [
  'healing_rite', 'healing_rite',
  'rusted_barrel', 'rusted_barrel',
  'cold_front',
  'slowing_hex',
  'healbane',
  'extended_magazine', 'extended_magazine',
  'extra_health', 'extra_health',
  'restorative_shot',
  'titanic_magazine',
  'healing_booster',
  'bullet_resilience',
];

const AI_DECK_AGGRO: CardId[] = [
  'rusted_barrel', 'rusted_barrel',
  'cold_front', 'cold_front',
  'decay',
  'knockdown',
  'extended_magazine', 'extended_magazine',
  'extra_regen',
  'titanic_magazine', 'titanic_magazine',
  'bullet_resist_shredder',
  'glass_cannon',
  'healing_rite',
  'restorative_shot',
];

const AI_DECK_CONTROL: CardId[] = [
  'healing_rite', 'healing_rite',
  'slowing_hex', 'slowing_hex',
  'healbane',
  'metal_skin',
  'disarming_hex',
  'extra_health', 'extra_health',
  'extra_spirit',
  'healing_booster',
  'weapon_shielding',
  'spirit_resilience',
  'bullet_resilience',
  'mystic_regeneration',
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
