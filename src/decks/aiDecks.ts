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
  // New cards (mixed) — so the eval exercises them.
  'colossus', 'reactive_barrier', 'leech', 'transcendent_cooldown',
  'improved_bullet_armor', 'siphon_bullets', 'improved_burst',
];

const AI_DECK_AGGRO: CardId[] = [
  'rusted_barrel', 'cold_front', 'decay',
  'extended_magazine', 'titanic_magazine', 'titanic_magazine', 'glass_cannon',  // Weapon
  'extra_spirit', 'improved_spirit',         // Spirit (so even aggro can run a caster)
  'bullet_resist_shredder',
  'extra_regen', 'restorative_shot', 'healing_rite',
  // New weapon/offense cards.
  'mystic_burst', 'toxic_bullets', 'tesla_bullets', 'active_reload',
  'surge_of_power', 'berserker', 'crippling_headshot', 'frenzy',
  'bullet_lifesteal', 'inhibitor', 'burst_fire', 'ricochet',
];

const AI_DECK_CONTROL: CardId[] = [
  'healing_rite', 'slowing_hex', 'healbane', 'metal_skin', 'disarming_hex',
  'extra_spirit', 'improved_spirit', 'boundless_spirit',   // Spirit-heavy
  'extra_health', 'spirit_resilience', 'bullet_resilience', // Vitality
  'healing_booster', 'weapon_shielding', 'mystic_regeneration',
  // New control / caster cards.
  'curse', 'silence_glyph', 'debuff_remover', 'unstoppable', 'echo_shard',
  'suppressor', 'escalating_exposure', 'mystic_reverb', 'improved_cooldown',
  'superior_cooldown', 'diviners_kevlar', 'spirit_lifesteal',
  'improved_spirit_armor', 'superior_duration',
];

export type ArchetypeName = 'balanced' | 'aggro' | 'control';
export const AI_DECKS_BY_NAME: Record<ArchetypeName, CardId[]> = {
  balanced: AI_DECK_BALANCED,
  aggro: AI_DECK_AGGRO,
  control: AI_DECK_CONTROL,
};
const ARCHETYPE_NAMES = Object.keys(AI_DECKS_BY_NAME) as ArchetypeName[];

/** Returns a shuffled deck plus which archetype it is (for win-rate tracking). */
export function getAIDeckTagged(): { cards: CardId[]; archetype: ArchetypeName } {
  const archetype = ARCHETYPE_NAMES[Math.floor(Math.random() * ARCHETYPE_NAMES.length)];
  const deck = [...AI_DECKS_BY_NAME[archetype]];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { cards: deck, archetype };
}
