import type { HeroCard } from '@/engine/types';

/**
 * 19 heroes total. A hero carries one or two abilities: `skills` (Activate
 * trigger; free, each on its own cooldown; `[]` for a passive-only hero) and
 * `passives` (always-on or trigger-based, no cast) — today every hero has
 * exactly one of the two, never both — plus its ultimate (`ult`, an ability
 * id), unlocked at Level 2. A hero uses one ability a turn (a skill, an active
 * item it wears, or its ultimate), and the Active may still make the turn's
 * attack after it.
 *
 * Split (8 passive / 11 skill):
 *   PASSIVE: Abrams, Drifter, Haze, Mirage, Mo & Krill, Shiv, Vindicta, Wraith
 *   SKILL:   Dynamo, Kelvin, Lady Geist, Lash, Paige, Rem, Seven, Sinclair, Viscous, Warden, Yamato
 *
 * Stats are a NATURAL LEAN, not a role cap. attack = bullet, skill = spirit;
 * every hero gains +1 of each stat per level and can be itemized into a Weapon,
 * Spirit, or Vitality build (Abrams can be built into a spirit caster). Base
 * offense is intentionally low at Lv1 so early fights take 2–3 turns and the
 * late game snowballs via levels + items. See docs/balance-model.md.
 *
 * Signature items (`signature`): two items that fit the hero's kit, one of
 * tier 1 or 2, both on sale in any match the hero is drafted into. The table is
 * in docs/card-design.md.
 *
 * Card text: a hero prints none of its own. Each skill and passive is an
 * AbilityDef (src/abilities) carrying its display `name` ("Frost Grenade") and
 * `text`, the mechanical effect only — no "Role. AbilityName:" prefix.
 * `heroAbilities` (src/engine/query.ts) lists a hero's, skills first; the card
 * face, the hero sheet, the draft and the tutorial all read the kit there.
 */
export const HEROES: HeroCard[] = [
  // ----- PASSIVE-only heroes -----
  {
    id: 'hero_abrams',
    name: 'Abrams',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 5,
    skills: [],
    passives: ['passive_abrams_heal'],
    ult: 'eff_ult_abrams',
    signature: ['healing_booster', 'fortitude'],
  },
  {
    id: 'hero_haze',
    name: 'Haze',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 5,
    skills: [],
    passives: ['passive_haze_fixation'],
    ult: 'eff_ult_haze',
    signature: ['active_reload', 'burst_fire'],
  },
  {
    id: 'hero_mo_krill',
    name: 'Mo & Krill',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 7,
    skills: [],
    passives: ['passive_mo_krill_burrow'],
    ult: 'eff_ult_mo_krill',
    signature: ['spirit_lifesteal', 'bullet_resilience'],
  },
  {
    id: 'hero_rem',
    name: 'Rem',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_rem'],
    ult: 'eff_ult_rem',
    signature: ['extra_spirit', 'healing_nova'],
    flags: { benchOnly: true },
  },
  {
    id: 'hero_shiv',
    name: 'Shiv',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 5,
    skills: [],
    passives: ['passive_shiv_bleed'],
    ult: 'eff_ult_shiv',
    signature: ['slowing_bullets', 'berserker'],
  },
  {
    id: 'hero_vindicta',
    name: 'Vindicta',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 5,
    skills: [],
    passives: ['passive_vindicta_flight'],
    ult: 'eff_ult_vindicta',
    signature: ['long_range', 'toxic_bullets'],
  },
  {
    id: 'hero_wraith',
    name: 'Wraith',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 6,
    skills: [],
    passives: ['passive_wraith_mixed'],
    ult: 'eff_ult_wraith',
    signature: ['spirit_strike', 'spiritual_overflow'],
  },

  // ----- SKILL-only heroes -----
  {
    id: 'hero_dynamo',
    name: 'Dynamo',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 6,
    skills: ['skill_dynamo'],
    ult: 'eff_ult_dynamo',
    signature: ['improved_cooldown', 'rescue_beam'],
  },
  {
    id: 'hero_kelvin',
    name: 'Kelvin',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 6,
    skills: ['skill_kelvin'],
    ult: 'eff_ult_kelvin',
    signature: ['cold_front', 'knockdown'],
  },
  {
    id: 'hero_lady_geist',
    name: 'Lady Geist',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_lady_geist'],
    ult: 'eff_ult_lady_geist',
    signature: ['mystic_vulnerability', 'spirit_snatch'],
  },
  {
    id: 'hero_lash',
    name: 'Lash',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_lash'],
    ult: 'eff_ult_lash',
    signature: ['mystic_slow', 'improved_burst'],
  },
  {
    id: 'hero_paige',
    name: 'Paige',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 4,
    skills: ['skill_paige'],
    ult: 'eff_ult_paige',
    signature: ['guardian_ward', 'debuff_remover'],
  },
  {
    id: 'hero_seven',
    name: 'Seven',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 4,
    skills: ['skill_seven_static'],
    ult: 'eff_ult_seven',
    signature: ['spirit_sap', 'surge_of_power'],
  },
  {
    id: 'hero_sinclair',
    name: 'Sinclair',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_sinclair'],
    ult: 'eff_ult_sinclair',
    signature: ['slowing_hex', 'disarming_hex'],
  },
  {
    id: 'hero_viscous',
    name: 'Viscous',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 4,
    skills: ['skill_viscous'],
    ult: 'eff_ult_viscous',
    signature: ['reactive_barrier', 'spirit_resilience'],
  },
  {
    id: 'hero_yamato',
    name: 'Yamato',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 6,
    skills: ['skill_yamato'],
    ult: 'eff_ult_yamato',
    signature: ['extended_magazine', 'shadow_weave'],
  },
  {
    id: 'hero_warden',
    name: 'Warden',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 5,
    skills: ['skill_warden'],
    ult: 'eff_ult_warden',
    signature: ['weapon_shielding', 'metal_skin'],
  },
  {
    id: 'hero_mirage',
    name: 'Mirage',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 6,
    skills: [],
    passives: ['passive_mirage_djinns_mark'],
    ult: 'eff_ult_mirage',
    signature: ['fleetfoot', 'tesla_bullets'],
  },
  {
    id: 'hero_drifter',
    name: 'Drifter',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 5,
    skills: [],
    passives: ['passive_drifter_bloodscent'],
    ult: 'eff_ult_drifter',
    signature: ['restorative_shot', 'frenzy'],
  },
];

export const HEROES_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroCard>;
