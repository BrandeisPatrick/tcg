// Starter deck used by both players for the MVP.
// 4 heroes (1 Active + 3 Bench) + 20-card deck made of spells & equipment.
import type { CardId } from '@/engine/types';

export interface DeckBlueprint {
  id: string;
  title: string;
  heroes: [CardId, CardId, CardId, CardId]; // [active, bench0, bench1, bench2]
  cards: CardId[]; // exactly 20
}

export const STARTER_DECK_PLAYER: DeckBlueprint = {
  id: 'starter_player',
  title: 'Starter — Aggro',
  heroes: ['hero_haze', 'hero_vindicta', 'hero_lash', 'hero_paige'],
  cards: [
    // Cost 1 — early-game density
    'healing_rite', 'healing_rite', 'healing_rite',
    'rusted_barrel',
    // Cost 2 — stat sticks + skirmish
    'extended_magazine', 'extended_magazine',
    'close_quarters', 'close_quarters',
    'extra_health', 'extra_health',
    'bullet_lifesteal',
    'cold_front',
    'return_fire',
    // Cost 3 — control + tempo
    'slowing_hex',
    'decay',
    'bullet_armor',
    // Cost 4 — finishers
    'bullet_shield',
    'knockdown',
    'metal_skin',
    'extra_stamina',
  ],
};

export const STARTER_DECK_AI: DeckBlueprint = {
  id: 'starter_ai',
  title: 'Starter — Control',
  heroes: ['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven'],
  cards: [
    // Cost 1 — early healing + brace
    'healing_rite', 'healing_rite',
    'rusted_barrel',
    // Cost 2 — utility + lifesteal
    'extra_health', 'extra_health',
    'extra_spirit',
    'extra_stamina',
    'spirit_lifesteal',
    'cold_front',
    'return_fire',
    // Cost 3 — control
    'decay',
    'slowing_hex',
    'bullet_armor',
    'spirit_armor',
    'extended_magazine',
    'close_quarters',
    // Cost 4 — reactive shields + lock
    'spirit_shield',
    'bullet_shield',
    'metal_skin',
    'knockdown',
  ],
};
