import type { HeroCard } from '@/engine/types';

// Hero stats from the original TcgEngine spec.
// Cards marked TODO_STAT have unknown values and should be tuned against the original .asset files.
export const TODO_STAT = -1;

/**
 * 19 heroes total. Each hero has EXACTLY ONE distinguishing mechanic — either a
 * `skill` (Activate trigger, costs the player's one-skill-per-turn) OR an entry
 * in `passives` (always-on or trigger-based, no cast). Never both.
 *
 * Split (8 passive / 11 skill):
 *   PASSIVE: Abrams, Drifter, Haze, Mo & Krill, Rem, Shiv, Vindicta, Wraith
 *   SKILL:   Dynamo, Kelvin, Lady Geist, Lash, Mirage, Paige, Seven, Sinclair, Viscous, Warden, Yamato
 *
 * Archetypes (8 roles): tank, marksman, caster, healer, bruiser, disruptor,
 * trickster, assassin. Ultimates are 1:1 with heroes.
 *
 * Card text format: `abilityName` carries the skill/passive name (rendered as a
 * tag next to the role on the card subtitle). `text` carries ONLY the
 * mechanical effect — no "Role. AbilityName:" prefix.
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
    abilityName: 'Siphon Life',
    text: 'Heals 3 at start of own turn while Active.',
  },
  {
    id: 'hero_haze',
    name: 'Haze',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 10,
    passives: ['passive_haze_stunbonus'],
    ult: 'ult_haze',
    abilityName: 'Fixation',
    text: '+2 ATK vs Stunned targets.',
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
    abilityName: 'Burrow',
    text: 'Cleanses all debuffs from self at start of own turn.',
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
    abilityName: 'Lil Helpers',
    text: 'Bench-only. Start of own turn: heals ally Active 2.',
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
    abilityName: 'Serrated Knives',
    text: 'Attacks apply Bleed 1 for 2 turns.',
  },
  {
    id: 'hero_vindicta',
    name: 'Vindicta',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 8,
    passives: ['passive_vindicta_flight'],
    ult: 'ult_vindicta',
    abilityName: 'Flight',
    text: 'Long Range. Takes 1 less bullet damage from all sources.',
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
    abilityName: 'Mixed Bullets',
    text: 'Attacks split half bullet / half spirit — pierces single-type resists.',
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
    abilityName: 'Rejuvenating Aurora',
    text: 'Heals an ally for 4 (+ caster Spirit).',
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
    abilityName: 'Frost Grenade',
    text: '3 spirit dmg + Vulnerable 2 turns.',
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
    abilityName: 'Essence Bomb',
    text: '3 spirit dmg to any enemy.',
  },
  {
    id: 'hero_lash',
    name: 'Lash',
    type: 'hero',
    rarity: 3,
    atk: 4,
    hp: 9,
    skill: 'skill_lash',
    ult: 'ult_lash',
    abilityName: 'Ground Strike',
    text: '3 spirit dmg + Stun 1 turn.',
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
    abilityName: 'Plot Armor',
    text: 'Shield 5 on an ally.',
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
    abilityName: 'Static Charge',
    text: '2 spirit dmg + Charged 2 — Stun 2 turns on expiry.',
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
    abilityName: 'Vexing Bolt',
    text: 'Ally +2 Spirit Power for 2 turns.',
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
    abilityName: 'Cube Form',
    text: 'Gains Invincibility 1.',
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
    abilityName: 'Power Slash',
    text: '4 spirit dmg to any enemy.',
  },
  // Disruptor: shields up before the AoE drain. Canon Warden's Willpower
  // (a.k.a. Stomp) hunkers him down; Last Stand is his channeled pulse.
  {
    id: 'hero_warden',
    name: 'Warden',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 11,
    skill: 'skill_warden',
    ult: 'ult_warden',
    abilityName: 'Willpower',
    text: 'Shield 5 on self (+ caster Spirit).',
  },
  // Trickster: canon Mirage spins into a whirlwind that can't be hit and
  // disorients enemies on contact. Stun synergizes with Haze's Fixation +
  // Headshot Booster equipment for follow-up bursts.
  {
    id: 'hero_mirage',
    name: 'Mirage',
    type: 'hero',
    rarity: 3,
    atk: 2,
    hp: 9,
    skill: 'skill_mirage',
    ult: 'ult_mirage',
    abilityName: 'Tornado',
    text: 'Gain Invincible 1 + Vulnerable 1 + Stun 1 on enemy Active.',
  },
  // Assassin: canon Drifter feeds off weakened prey. Bloodscent both heals
  // on hit and amps damage vs low-HP targets.
  {
    id: 'hero_drifter',
    name: 'Drifter',
    type: 'hero',
    rarity: 3,
    atk: 3,
    hp: 9,
    passives: ['passive_drifter_bloodscent'],
    ult: 'ult_drifter',
    abilityName: 'Bloodscent',
    text: 'Heal 1 on attack. +3 bullet dmg vs targets at 4 HP or below.',
  },
];

export const HEROES_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroCard>;
