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
    'rusted_barrel', 'rusted_barrel',
    // Cost 2 — stat sticks + sustain
    'extended_magazine', 'extended_magazine', 'extended_magazine',
    'extra_health', 'extra_health',
    'restorative_shot', 'restorative_shot',
    // Cost 3 — burst + control
    'cold_front', 'cold_front',
    'disarming_hex',
    'decay',
    'bullet_resist',
    // Cost 4 — finishers
    'bullet_shield',
    'knockdown',
    'metal_skin',
  ],
};

export const STARTER_DECK_AI: DeckBlueprint = {
  id: 'starter_ai',
  title: 'Starter — Control',
  heroes: ['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven'],
  cards: [
    // Cost 1 — early healing + weaken
    'healing_rite', 'healing_rite', 'healing_rite',
    'rusted_barrel',
    // Cost 2 — utility + sustain
    'extra_health', 'extra_health',
    'extra_spirit', 'extra_spirit',
    'mystic_regeneration', 'mystic_regeneration',
    'extended_magazine',
    // Cost 3 — control + burst
    'cold_front',
    'decay',
    'disarming_hex',
    'bullet_resist',
    'spirit_resist',
    // Cost 4 — reactive shields + lock
    'spirit_shield',
    'bullet_shield',
    'metal_skin',
    'knockdown',
  ],
};
