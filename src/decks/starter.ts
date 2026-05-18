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
    // T1 plays (cost 1) — early-game density so the deck functions on T1-T2
    'healing_rite', 'healing_rite',
    'rusted_barrel',
    'mystic_burst', 'mystic_burst',
    'basic_magazine', 'basic_magazine',
    'monster_rounds', 'monster_rounds',
    'extra_health',
    'melee_lifesteal',
    'sprint_boots',
    // T2 (cost 2-3) — staple skirmish
    'cold_front',
    'slowing_hex',
    'bullet_armor',
    'titanic_magazine',
    // T3-T4 (cost 4-5) — finishers
    'knockdown',
    'phantom_strike',
    'curse',
    'soul_rebirth',
  ],
};

export const STARTER_DECK_AI: DeckBlueprint = {
  id: 'starter_ai',
  title: 'Starter — Control',
  heroes: ['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven'],
  cards: [
    // T1 plays
    'healing_rite', 'healing_rite',
    'golden_goose_egg',
    'extra_regen', 'extra_regen',
    'spirit_strike',
    'enduring_spirit',
    'extra_health', 'extra_health',
    // T2 (cost 2-3)
    'cold_front',
    'return_fire',
    'bullet_armor',
    'spirit_armor',
    'enchanter_barrier',
    // T3 (cost 3-4)
    'decay',
    'metal_skin',
    'surge_of_power',
    // T4 mythic finishers
    'silence_glyph',
    'divine_barrier',
    'echo_shard',
  ],
};
