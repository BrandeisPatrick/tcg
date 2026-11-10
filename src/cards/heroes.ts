import type { HeroCard } from '@/engine/types';

/**
 * The 21 heroes in the game, built to docs/hero-design.md (§1–4 the rules, §8
 * the cards). Each is designed from its Deadlock role first (`profile`: role,
 * mix, reach, curve), then fitted to the TCG:
 *  - HP is 4 + its tank score at Level 1, Attack 1 — or 2 for a hero whose
 *    damage is mainly bullet or melee (`gun`) with damage 2 or more — and the
 *    curve moves a point: early +1 (on HP or Attack), late −1 (never below
 *    Attack 1 or HP 4). Rem keeps the floor.
 *  - Each level adds the hero's `growth`: 2 points a level early, 3 mid, 4
 *    late, into Attack for guns, Spirit for casters and HP for tanks. All three
 *    curves are even at Level 2.
 *  - `retreat` is what swapping it out of the Active slot costs: 0 for very
 *    mobile heroes, 1 for most, 2 for slow heavy ones.
 *  - The kit is exactly one skill (`skills`: 1–3 souls, then a 1-turn wait) or
 *    one passive (`passives`), plus an ultimate (`ult`): a button printed on
 *    the card, from Level 2, for 4, 8 or 12 souls by size, then a 3-turn wait.
 *    Victor's and Silver's are charged (their card's `charged`: 20 and 16
 *    souls, 1 less for each damage he takes or she deals), and Victor's is
 *    an optional trigger, asked when he falls rather than pressed.
 *  - No Weakness.
 *
 * Signature items (`signature`): two items that fit the hero's kit, one of
 * tier 1 or 2. The table is in docs/card-design.md.
 *
 * Card text: a hero prints none of its own. Each skill and passive is an
 * AbilityDef (src/abilities) carrying its display `name` ("Frost Grenade") and
 * `text`; each ultimate's name, text and size are its card's
 * (cards/ultimates.ts). `heroAbilities` (src/engine/query.ts) lists a hero's
 * skill or passive; the card face, the hero sheet, the draft and the tutorial
 * all read the kit there.
 */
export const HEROES: HeroCard[] = [
  // In the order the game has always listed them (the draft pool, the story
  // map's offers and the set numbers read it); each card names its role.
  {
    id: 'hero_abrams', name: 'Abrams', type: 'hero', rarity: 3,
    atk: 2, hp: 7, growth: { atk: 1, hp: 2, spirit: 0 }, retreat: 2,
    profile: { role: 'Tank', mix: { tank: 3, damage: 2, control: 1, support: 0 }, reach: 'one', curve: 'mid', gun: true },
    skills: [], passives: ['passive_abrams_heal'], ult: 'eff_ult_abrams',
    signature: ['healing_booster', 'fortitude'],
  },
  {
    id: 'hero_haze', name: 'Haze', type: 'hero', rarity: 3,
    atk: 1, hp: 4, growth: { atk: 3, hp: 1, spirit: 0 }, retreat: 1,
    profile: { role: 'Gun carry', mix: { tank: 0, damage: 3, control: 0, support: 0 }, reach: 'one', curve: 'late', gun: true },
    skills: [], passives: ['passive_haze_fixation'], ult: 'eff_ult_haze',
    signature: ['active_reload', 'burst_fire'],
  },
  {
    id: 'hero_mo_krill', name: 'Mo & Krill', type: 'hero', rarity: 3,
    atk: 1, hp: 6, growth: { atk: 0, hp: 3, spirit: 1 }, retreat: 1,
    profile: { role: 'Tank', mix: { tank: 3, damage: 1, control: 3, support: 0 }, reach: 'one', curve: 'late' },
    skills: ['skill_mo_krill'], ult: 'eff_ult_mo_krill',
    signature: ['spirit_lifesteal', 'bullet_resilience'],
  },
  {
    // Rem stands in the lane like any hero (Patrick, 2026-11-09: no longer
    // bench-only); Tag Along makes her equipment on an ally for 2 turns.
    id: 'hero_rem', name: 'Rem', type: 'hero', rarity: 3,
    atk: 1, hp: 4, growth: { atk: 0, hp: 1, spirit: 3 }, retreat: 0,
    profile: { role: 'Support', mix: { tank: 0, damage: 0, control: 1, support: 3 }, reach: 'one', curve: 'late' },
    skills: ['skill_rem'], ult: 'eff_ult_rem',
    signature: ['extra_spirit', 'healing_nova'],
  },
  {
    id: 'hero_shiv', name: 'Shiv', type: 'hero', rarity: 3,
    atk: 1, hp: 6, growth: { atk: 2, hp: 1, spirit: 1 }, retreat: 1,
    profile: { role: 'Bruiser', mix: { tank: 2, damage: 3, control: 0, support: 0 }, reach: 'one', curve: 'late', gun: true },
    skills: ['skill_shiv'], ult: 'eff_ult_shiv',
    signature: ['slowing_bullets', 'berserker'],
  },
  {
    id: 'hero_vindicta', name: 'Vindicta', type: 'hero', rarity: 3,
    atk: 2, hp: 5, growth: { atk: 2, hp: 0, spirit: 0 }, retreat: 0,
    profile: { role: 'Marksman', mix: { tank: 0, damage: 3, control: 0, support: 0 }, reach: 'one', curve: 'early', gun: true },
    skills: [], passives: ['passive_vindicta_flight'], ult: 'eff_ult_vindicta',
    signature: ['long_range', 'sharpshooter'],
  },
  {
    id: 'hero_wraith', name: 'Wraith', type: 'hero', rarity: 3,
    atk: 1, hp: 4, growth: { atk: 3, hp: 1, spirit: 0 }, retreat: 0,
    profile: { role: 'Gun carry', mix: { tank: 0, damage: 3, control: 1, support: 0 }, reach: 'one', curve: 'late', gun: true },
    skills: ['skill_wraith'], ult: 'eff_ult_wraith',
    signature: ['spirit_strike', 'spiritual_overflow'],
  },
  {
    id: 'hero_dynamo', name: 'Dynamo', type: 'hero', rarity: 3,
    atk: 1, hp: 5, growth: { atk: 0, hp: 1, spirit: 2 }, retreat: 1,
    profile: { role: 'Support', mix: { tank: 1, damage: 1, control: 3, support: 2 }, reach: 'many', curve: 'mid' },
    skills: ['skill_dynamo'], ult: 'eff_ult_dynamo',
    signature: ['improved_cooldown', 'rescue_beam'],
  },
  {
    id: 'hero_kelvin', name: 'Kelvin', type: 'hero', rarity: 3,
    atk: 1, hp: 6, growth: { atk: 0, hp: 1, spirit: 2 }, retreat: 1,
    profile: { role: 'Support', mix: { tank: 2, damage: 1, control: 2, support: 3 }, reach: 'many', curve: 'mid' },
    skills: ['skill_kelvin'], ult: 'eff_ult_kelvin',
    signature: ['cold_front', 'knockdown'],
  },
  {
    id: 'hero_lady_geist', name: 'Lady Geist', type: 'hero', rarity: 3,
    atk: 1, hp: 7, growth: { atk: 0, hp: 0, spirit: 2 }, retreat: 2,
    profile: { role: 'Bruiser', mix: { tank: 2, damage: 3, control: 0, support: 0 }, reach: 'both', curve: 'early' },
    skills: ['skill_lady_geist'], ult: 'eff_ult_lady_geist',
    signature: ['mystic_vulnerability', 'spirit_snatch'],
  },
  {
    id: 'hero_lash', name: 'Lash', type: 'hero', rarity: 3,
    atk: 1, hp: 5, growth: { atk: 0, hp: 1, spirit: 2 }, retreat: 0,
    profile: { role: 'Assassin', mix: { tank: 1, damage: 2, control: 3, support: 0 }, reach: 'many', curve: 'mid' },
    skills: ['skill_lash'], ult: 'eff_ult_lash',
    signature: ['mystic_slow', 'improved_burst'],
  },
  {
    id: 'hero_paige', name: 'Paige', type: 'hero', rarity: 3,
    atk: 1, hp: 5, growth: { atk: 0, hp: 0, spirit: 2 }, retreat: 1,
    profile: { role: 'Support', mix: { tank: 0, damage: 1, control: 1, support: 3 }, reach: 'many', curve: 'early' },
    skills: ['skill_paige'], ult: 'eff_ult_paige',
    signature: ['guardian_ward', 'debuff_remover'],
  },
  {
    id: 'hero_seven', name: 'Seven', type: 'hero', rarity: 3,
    atk: 1, hp: 4, growth: { atk: 0, hp: 1, spirit: 3 }, retreat: 1,
    profile: { role: 'Spirit caster', mix: { tank: 1, damage: 3, control: 1, support: 0 }, reach: 'many', curve: 'late' },
    skills: ['skill_seven'], ult: 'eff_ult_seven',
    signature: ['spirit_sap', 'surge_of_power'],
  },
  {
    id: 'hero_sinclair', name: 'Sinclair', type: 'hero', rarity: 3,
    atk: 1, hp: 4, growth: { atk: 0, hp: 1, spirit: 2 }, retreat: 1,
    profile: { role: 'Controller', mix: { tank: 0, damage: 1, control: 3, support: 1 }, reach: 'one', curve: 'mid' },
    skills: ['skill_sinclair'], ult: 'eff_ult_sinclair',
    signature: ['slowing_hex', 'disarming_hex'],
  },
  {
    id: 'hero_viscous', name: 'Viscous', type: 'hero', rarity: 3,
    atk: 1, hp: 6, growth: { atk: 0, hp: 2, spirit: 1 }, retreat: 1,
    profile: { role: 'Tank', mix: { tank: 2, damage: 1, control: 3, support: 2 }, reach: 'many', curve: 'mid' },
    skills: ['skill_viscous'], ult: 'eff_ult_viscous',
    signature: ['reactive_barrier', 'spirit_resilience'],
  },
  {
    id: 'hero_yamato', name: 'Yamato', type: 'hero', rarity: 3,
    atk: 2, hp: 5, growth: { atk: 1, hp: 1, spirit: 1 }, retreat: 0,
    profile: { role: 'Assassin', mix: { tank: 1, damage: 3, control: 0, support: 0 }, reach: 'one', curve: 'mid', gun: true },
    skills: ['skill_yamato'], ult: 'eff_ult_yamato',
    signature: ['extended_magazine', 'shadow_weave'],
  },
  {
    id: 'hero_warden', name: 'Warden', type: 'hero', rarity: 3,
    atk: 2, hp: 7, growth: { atk: 1, hp: 1, spirit: 0 }, retreat: 1,
    profile: { role: 'Bruiser', mix: { tank: 2, damage: 2, control: 1, support: 0 }, reach: 'one', curve: 'early', gun: true },
    skills: ['skill_warden'], ult: 'eff_ult_warden',
    signature: ['weapon_shielding', 'metal_skin'],
  },
  {
    id: 'hero_mirage', name: 'Mirage', type: 'hero', rarity: 3,
    atk: 1, hp: 4, growth: { atk: 1, hp: 1, spirit: 2 }, retreat: 0,
    profile: { role: 'Assassin', mix: { tank: 1, damage: 2, control: 1, support: 0 }, reach: 'one', curve: 'late' },
    skills: [], passives: ['passive_mirage_djinns_mark'], ult: 'eff_ult_mirage',
    signature: ['fleetfoot', 'tesla_bullets'],
  },
  {
    id: 'hero_drifter', name: 'Drifter', type: 'hero', rarity: 3,
    atk: 2, hp: 6, growth: { atk: 2, hp: 1, spirit: 0 }, retreat: 1,
    profile: { role: 'Assassin', mix: { tank: 2, damage: 3, control: 1, support: 0 }, reach: 'one', curve: 'mid', gun: true },
    skills: [], passives: ['passive_drifter_bloodscent'], ult: 'eff_ult_drifter',
    signature: ['restorative_shot', 'frenzy'],
  },
  {
    // The tank who won't die: his Aura burns him too, and every hit he soaks
    // up makes his charged revive cheaper (asked when he falls).
    id: 'hero_victor', name: 'Victor', type: 'hero', rarity: 3,
    atk: 1, hp: 6, growth: { atk: 0, hp: 3, spirit: 1 }, retreat: 2,
    profile: { role: 'Tank', mix: { tank: 3, damage: 2, control: 0, support: 0 }, reach: 'many', curve: 'late' },
    skills: [], passives: ['passive_victor_aura'], ult: 'eff_ult_victor',
    signature: ['extra_health', 'torment_pulse'],
  },
  {
    // Kick-marks one target and shotguns it; the damage she deals charges her
    // wolf form.
    id: 'hero_silver', name: 'Silver', type: 'hero', rarity: 3,
    atk: 2, hp: 6, growth: { atk: 2, hp: 1, spirit: 0 }, retreat: 1,
    profile: { role: 'Bruiser', mix: { tank: 2, damage: 3, control: 1, support: 0 }, reach: 'one', curve: 'mid', gun: true },
    skills: ['skill_silver'], ult: 'eff_ult_silver',
    signature: ['monster_rounds', 'bullet_lifesteal'],
  },
];

export const HEROES_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroCard>;
