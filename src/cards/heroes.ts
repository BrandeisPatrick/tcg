import type { HeroCard } from '@/engine/types';

/**
 * 19 heroes total. A hero carries one or two abilities: `skills` (Activate
 * trigger; a hero uses ONE skill a turn and gives up the turn's attack to use
 * it; `[]` for a passive-only hero) and `passives` (always-on or trigger-based,
 * no cast). Today every hero has exactly one ability — a skill or a passive,
 * never both.
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
    ult: 'ult_abrams',
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
    ult: 'ult_haze',
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
    ult: 'ult_mo_krill',
  },
  {
    id: 'hero_rem',
    name: 'Rem',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_rem'],
    ult: 'ult_rem',
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
    ult: 'ult_shiv',
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
    ult: 'ult_vindicta',
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
    ult: 'ult_wraith',
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
    ult: 'ult_dynamo',
  },
  {
    id: 'hero_kelvin',
    name: 'Kelvin',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 6,
    skills: ['skill_kelvin'],
    ult: 'ult_kelvin',
  },
  {
    id: 'hero_lady_geist',
    name: 'Lady Geist',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_lady_geist'],
    ult: 'ult_lady_geist',
  },
  {
    id: 'hero_lash',
    name: 'Lash',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_lash'],
    ult: 'ult_lash',
  },
  {
    id: 'hero_paige',
    name: 'Paige',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 4,
    skills: ['skill_paige'],
    ult: 'ult_paige',
  },
  {
    id: 'hero_seven',
    name: 'Seven',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 4,
    skills: ['skill_seven_static'],
    ult: 'ult_seven',
  },
  {
    id: 'hero_sinclair',
    name: 'Sinclair',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 4,
    skills: ['skill_sinclair'],
    ult: 'ult_sinclair',
  },
  {
    id: 'hero_viscous',
    name: 'Viscous',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 4,
    skills: ['skill_viscous'],
    ult: 'ult_viscous',
  },
  {
    id: 'hero_yamato',
    name: 'Yamato',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 6,
    skills: ['skill_yamato'],
    ult: 'ult_yamato',
  },
  {
    id: 'hero_warden',
    name: 'Warden',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 5,
    skills: ['skill_warden'],
    ult: 'ult_warden',
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
    ult: 'ult_mirage',
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
    ult: 'ult_drifter',
  },
];

export const HEROES_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroCard>;
