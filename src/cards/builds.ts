import type { CardId } from '@/engine/types';

/**
 * The default build of every hero: the items it buys, in order — its two
 * signature items first, then two of tier 2, one of tier 3 and one of tier 4
 * that fit its kit; a hero whose kit wants a late spike takes a tier-5 card
 * for the last instead (Haze Infinite Rounds, Wraith Haunting Shot). Six items
 * for three slots (four with the flex slot): the later ones are bought as
 * upgrades of the earlier where Deadlock builds them so (the tier 3 and 4
 * picks mostly do), or into a slot that opens; a tier-5 card has no component,
 * so it needs a slot of its own.
 *
 * Storage keeps the player's own builds, starting from these
 * (storage/playerData.ts). A side that brings no deck of its own — the rival
 * AI always, the player until they save one — is dealt one made from its
 * drafted heroes' builds (`deckFromBuilds`, cards/decks.ts: every hero's
 * first items, round by round), and the AI puts an item on the hero whose
 * build lists it (ai/heuristic.ts).
 */
export const DEFAULT_BUILDS: Record<CardId, CardId[]> = {
  // ----- Passive-only heroes -----
  hero_abrams:     ['healing_booster', 'fortitude', 'bullet_lifesteal', 'spirit_shielding', 'bullet_resilience', 'cheat_death'],
  hero_haze:       ['active_reload', 'burst_fire', 'titanic_magazine', 'intensifying_magazine', 'toxic_bullets', 'infinite_rounds'],
  hero_mo_krill:   ['spirit_lifesteal', 'bullet_resilience', 'guardian_ward', 'weapon_shielding', 'metal_skin', 'plated_armor'],
  hero_rem:        ['extra_spirit', 'healing_nova', 'improved_spirit', 'healing_booster', 'superior_duration', 'boundless_spirit'],
  hero_shiv:       ['slowing_bullets', 'berserker', 'active_reload', 'titanic_magazine', 'weighted_shots', 'crippling_headshot'],
  hero_vindicta:   ['long_range', 'sharpshooter', 'titanic_magazine', 'opening_rounds', 'toxic_bullets', 'crippling_headshot'],
  hero_wraith:     ['spirit_strike', 'spiritual_overflow', 'mystic_shot', 'spirit_lifesteal', 'spirit_snatch', 'haunting_shot'],
  hero_mirage:     ['fleetfoot', 'tesla_bullets', 'active_reload', 'spirit_shredder', 'toxic_bullets', 'ricochet'],
  hero_drifter:    ['restorative_shot', 'frenzy', 'bullet_lifesteal', 'stalker', 'berserker', 'leech'],
  hero_victor:     ['extra_health', 'torment_pulse', 'spirit_lifesteal', 'spirit_shielding', 'fortitude', 'leech'],

  // ----- Skill heroes -----
  hero_dynamo:     ['improved_cooldown', 'rescue_beam', 'healing_booster', 'duration_extender', 'superior_cooldown', 'transcendent_cooldown'],
  hero_kelvin:     ['cold_front', 'knockdown', 'improved_spirit', 'spirit_shielding', 'silence_glyph', 'arctic_blast'],
  hero_lady_geist: ['mystic_vulnerability', 'spirit_snatch', 'improved_spirit', 'spirit_lifesteal', 'decay', 'escalating_exposure'],
  hero_lash:       ['mystic_slow', 'improved_burst', 'improved_spirit', 'suppressor', 'decay', 'lightning_scroll'],
  hero_paige:      ['guardian_ward', 'debuff_remover', 'healing_booster', 'restorative_locket', 'healing_nova', 'divine_barrier'],
  hero_seven:      ['spirit_sap', 'surge_of_power', 'improved_cooldown', 'improved_spirit', 'superior_cooldown', 'focus_lens'],
  hero_sinclair:   ['slowing_hex', 'disarming_hex', 'improved_spirit', 'mystic_vulnerability', 'silence_glyph', 'vortex_web'],
  hero_viscous:    ['reactive_barrier', 'spirit_resilience', 'debuff_reducer', 'improved_spirit', 'fortitude', 'indomitable'],
  hero_yamato:     ['extended_magazine', 'shadow_weave', 'titanic_magazine', 'kinetic_dash', 'heroic_aura', 'glass_cannon'],
  hero_warden:     ['weapon_shielding', 'metal_skin', 'bullet_lifesteal', 'enduring_speed', 'fortitude', 'juggernaut'],
  hero_silver:     ['monster_rounds', 'bullet_lifesteal', 'swift_striker', 'kinetic_dash', 'berserker', 'frenzy'],
};

/** Items a build may hold. */
export const BUILD_SIZE = 6;

/** A hero's default build (empty for an id that names no hero). */
export function defaultBuild(heroId: CardId): CardId[] {
  return [...(DEFAULT_BUILDS[heroId] ?? [])];
}
