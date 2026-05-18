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
    'mystic_burst', 'mystic_burst',
    'phantom_strike', 'phantom_strike',
    'cold_front',
    'knockdown',
    'healing_rite',
    'enchanter_barrier',
    'basic_magazine', 'basic_magazine',
    'monster_rounds', 'monster_rounds',
    'extra_health', 'extra_health',
    'bullet_armor',
    'melee_lifesteal',
    'sprint_boots',
    'titanic_magazine',
    'curse',
    'soul_rebirth',
  ],
};

export const STARTER_DECK_AI: DeckBlueprint = {
  id: 'starter_ai',
  title: 'Starter — Control',
  heroes: ['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven'],
  cards: [
    'mystic_burst', 'mystic_burst',
    'decay', 'decay',
    'inhibitor',
    'silence_glyph',
    'healing_rite', 'healing_rite',
    'enchanter_barrier',
    'ethereal_shift',
    'extra_health', 'extra_health',
    'extra_regen', 'extra_regen',
    'bullet_armor',
    'metal_skin',
    'spirit_armor',
    'surge_of_power',
    'slowing_hex',
    'divine_barrier',
  ],
};
