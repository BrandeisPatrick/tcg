import type { HeroCard } from '@/engine/types';

// Hero stats from the original TcgEngine spec.
// Cards marked TODO_STAT have unknown values and should be tuned against the original .asset files.
export const TODO_STAT = -1;

/**
 * 16 heroes total. Each hero has EXACTLY ONE distinguishing mechanic — either a
 * `skill` (Activate trigger, costs the player's one-skill-per-turn) OR an entry
 * in `passives` (always-on or trigger-based, no cast). Never both.
 *
 * Split (7 passive / 9 skill):
 *   PASSIVE: Abrams, Haze, Mo & Krill, Rem, Shiv, Vindicta, Wraith
 *   SKILL:   Dynamo, Kelvin, Lady Geist, Lash, Paige, Seven, Sinclair, Viscous, Yamato
 *
 * Ultimates are 1:1 with heroes and remain unchanged across this restructure.
 */
export const HEROES: HeroCard[] = [
  // ----- PASSIVE-only heroes -----
  {
    id: 'hero_abrams',
    name: 'Abrams',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 14,
    passives: ['passive_abrams_heal'],
    ult: 'ult_abrams',
    text: 'Tank. Heals 2 at start of own turn while Active.',
  },
  {
    id: 'hero_haze',
    name: 'Haze',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 8,
    passives: ['passive_haze_stunbonus'],
    ult: 'ult_haze',
    text: 'Marksman. Fixation: +2 ATK vs Stunned targets.',
  },
  {
    id: 'hero_mo_krill',
    name: 'Mo & Krill',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 11,
    passives: ['passive_mo_krill_burrow'],
    ult: 'ult_mo_krill',
    text: 'Bruiser. Burrow: cleanses all debuffs from self at start of own turn.',
  },
  {
    id: 'hero_rem',
    name: 'Rem',
    type: 'hero',
    rarity: 3,
    atk: 1,
    hp: 7,
    passives: ['passive_rem_benchheal'],
    ult: 'ult_rem',
    text: 'Healer. Bench-only. Start of own turn: heals ally Active 2.',
    flags: { benchOnly: true },
  },
  {
    id: 'hero_shiv',
    name: 'Shiv',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 9,
    passives: ['passive_shiv_bleed'],
    ult: 'ult_shiv',
    text: 'Bruiser. Serrated Knives: attacks apply Bleed 1 for 2 turns.',
  },
  {
    id: 'hero_vindicta',
    name: 'Vindicta',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 7,
    passives: ['passive_vindicta_flight'],
    ult: 'ult_vindicta',
    text: 'Marksman. Long Range. Flight: takes 1 less attack damage from all sources.',
    flags: { longRange: true },
  },
  {
    id: 'hero_wraith',
    name: 'Wraith',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 9,
    passives: ['passive_wraith_mixed'],
    ult: 'ult_wraith',
    text: 'Caster. Attacks split half bullet / half spirit — pierces single-type resists.',
  },

  // ----- SKILL-only heroes -----
  {
    id: 'hero_dynamo',
    name: 'Dynamo',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 11,
    skill: 'skill_dynamo',
    ult: 'ult_dynamo',
    text: 'Healer. Skill heals an ally for 3.',
  },
  {
    id: 'hero_kelvin',
    name: 'Kelvin',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 12,
    skill: 'skill_kelvin',
    ult: 'ult_kelvin',
    text: 'Caster. Arctic Beam: 2 spirit dmg to any enemy.',
  },
  {
    id: 'hero_lady_geist',
    name: 'Lady Geist',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 9,
    skill: 'skill_lady_geist',
    ult: 'ult_lady_geist',
    text: 'Caster. Skill deals 3 spirit dmg to any enemy.',
  },
  {
    id: 'hero_lash',
    name: 'Lash',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 8,
    skill: 'skill_lash',
    ult: 'ult_lash',
    text: 'Bruiser. Ground Strike: 3 spirit dmg + Stun 1 turn.',
  },
  {
    id: 'hero_paige',
    name: 'Paige',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 10,
    skill: 'skill_paige',
    ult: 'ult_paige',
    text: 'Healer. Plot Armor: Shield 5 on an ally.',
  },
  {
    id: 'hero_seven',
    name: 'Seven',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 9,
    skill: 'skill_seven_static',
    ult: 'ult_seven',
    text: 'Caster. Static Charge: applies Charged 2 turns — Stun 2 turns on expiry.',
  },
  {
    id: 'hero_sinclair',
    name: 'Sinclair',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 10,
    skill: 'skill_sinclair',
    ult: 'ult_sinclair',
    text: 'Caster. Skill grants ally +2 Spirit Power for 2 turns.',
  },
  {
    id: 'hero_viscous',
    name: 'Viscous',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 13,
    skill: 'skill_viscous',
    ult: 'ult_viscous',
    text: 'Tank. Cube Form: gains Invincibility 1.',
  },
  {
    id: 'hero_yamato',
    name: 'Yamato',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 9,
    skill: 'skill_yamato',
    ult: 'ult_yamato',
    text: 'Bruiser. Power Slash: 5 spirit dmg to any enemy.',
  },
];

export const HEROES_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroCard>;
