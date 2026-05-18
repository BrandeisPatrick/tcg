import type { EquipmentCard } from '@/engine/types';

/**
 * Equipment = PASSIVE Deadlock items. Once attached, they stay on the bearer
 * and apply an ongoing effect (stat boost, resist status, on-trigger proc).
 *
 * Tier + cost map to canon Deadlock pricing (verified against the
 * deadlock-api.com `item_tier` field):
 *   T1 (1 soul · 800 in canon) — stat sticks + small passives
 *   T2 (3 souls · 1600 in canon) — meaningful procs + dual-stat sticks
 *   T3 (4 souls · 3200 in canon) — build-defining single passive
 *   T4 mythic (5 souls · 6400 in canon) — game-winning passives
 *
 * Text formatting conventions (auto-bolded by `RuleText`):
 *   - Status keywords (Bullet Resist, Spirit Power, Shield, …)
 *   - Timing markers (On attach, Start of turn, After attacking, Mythic)
 *   - Durations always read "for N turns"
 *   - Stat bonuses use "+N ATK/HP/Spirit"; status grants use the status name
 *
 * Every card here is verified against the Deadlock catalogue and is_active_item=false.
 * For ACTIVE Deadlock items (Healing Rite, Cold Front, Curse, etc.), see `spells.ts`.
 */
export const EQUIPMENT: EquipmentCard[] = [
  // ----- Tier 1 — 1 soul (passive stat sticks + small passives) -----
  { id: 'basic_magazine',       name: 'Basic Magazine',        type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { atk: 1 },           text: '+1 ATK.' },
  { id: 'headshot_booster',     name: 'Headshot Booster',      type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { atk: 1 },           text: '+1 ATK. Attacks deal +2 dmg vs Stunned targets.' },
  { id: 'close_quarters',       name: 'Close Quarters',        type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { atk: 1 },           text: '+1 ATK.' },
  { id: 'extra_health',         name: 'Extra Health',          type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { hp: 3 },            text: '+3 HP.' },
  { id: 'extra_stamina',        name: 'Extra Stamina',         type: 'equipment', rarity: 1, tier: 1, cost: 1, abilities: ['eff_extra_stamina'], text: 'On attach: draw 2 cards.' },
  { id: 'mystic_burst',         name: 'Mystic Burst',          type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { spirit: 1 },        text: '+1 Spirit.' },
  { id: 'sprint_boots',         name: 'Sprint Boots',          type: 'equipment', rarity: 1, tier: 1, cost: 1, abilities: ['eff_sprint_boots_attach'], bonus: { hp: 1 }, text: '+1 HP. On attach: refresh bearer.' },
  { id: 'enduring_spirit',      name: 'Enduring Spirit',       type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { hp: 2, spirit: 1 }, text: '+2 HP, +1 Spirit.' },
  { id: 'extra_regen',          name: 'Extra Regen',           type: 'equipment', rarity: 1, tier: 1, cost: 1, abilities: ['eff_extra_regen'], text: 'Start of turn: heal bearer 1.' },
  { id: 'melee_lifesteal',      name: 'Melee Lifesteal',       type: 'equipment', rarity: 1, tier: 1, cost: 1, abilities: ['eff_melee_lifesteal'], text: 'After attacking: heal bearer 1.' },
  { id: 'monster_rounds',       name: 'Monster Rounds',        type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { atk: 2 },           text: '+2 ATK.' },
  { id: 'spirit_strike',        name: 'Spirit Strike',         type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { spirit: 2 },        text: '+2 Spirit.' },
  { id: 'mystic_expansion',     name: 'Mystic Expansion',      type: 'equipment', rarity: 1, tier: 1, cost: 1, abilities: ['eff_mystic_expansion'], text: 'On attach: bearer gains Long Range (attacks from bench).' },

  // ----- Tier 2 — 3 souls (meaningful passives + dual-stat sticks) -----
  { id: 'bullet_armor',         name: 'Bullet Armor',          type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_armor'], text: 'Bullet Resist 2.' },
  { id: 'spirit_armor',         name: 'Spirit Armor',          type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_spirit_armor'], text: 'Spirit Resist 2.' },
  { id: 'improved_spirit',      name: 'Improved Spirit',       type: 'equipment', rarity: 2, tier: 2, cost: 3, bonus: { spirit: 2 },        text: '+2 Spirit.' },
  { id: 'improved_cooldown',    name: 'Improved Cooldown',     type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_improved_cooldown'], text: "Bearer's skill ignores the one-skill-per-turn limit." },
  { id: 'mystic_vulnerability', name: 'Mystic Vulnerability',  type: 'equipment', rarity: 2, tier: 2, cost: 3, bonus: { spirit: 1, hp: 2 }, text: '+2 HP, +1 Spirit.' },
  { id: 'enchanter_barrier',    name: 'Enchanter Barrier',     type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_enchanter_barrier_attach'], text: 'On attach: Shield 3 on bearer.' },
  { id: 'debuff_remover',       name: 'Debuff Remover',        type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_debuff_remover_attach'], bonus: { hp: 2 }, text: '+2 HP. On attach: cleanse debuffs from bearer.' },
  { id: 'suppressor',           name: 'Suppressor',            type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_suppressor_attach'], bonus: { hp: 2 }, text: '+2 HP. On attach: Silence enemy Active for 1 turn.' },
  { id: 'titanic_magazine',     name: 'Titanic Magazine',      type: 'equipment', rarity: 2, tier: 2, cost: 3, bonus: { atk: 2, hp: 2 },    text: '+2 ATK, +2 HP.' },

  // ----- Tier 3 — 4 souls (build-defining passives) -----
  { id: 'berserker',            name: 'Berserker',             type: 'equipment', rarity: 3, tier: 3, cost: 4, abilities: ['eff_berserker'],  text: 'On attach: +2 Weapon Power.' },
  { id: 'surge_of_power',       name: 'Surge of Power',        type: 'equipment', rarity: 3, tier: 3, cost: 4, bonus: { spirit: 3 },         text: '+3 Spirit.' },

  // ----- Tier 4 mythic — 5 souls -----
  { id: 'frenzy',               name: 'Frenzy',                type: 'equipment', rarity: 4, tier: 3, cost: 5, abilities: ['eff_frenzy'],     text: 'Mythic. +2 Weapon Power.' },
  { id: 'diviners_kevlar',      name: "Diviner's Kevlar",      type: 'equipment', rarity: 4, tier: 3, cost: 5, abilities: ['eff_diviners_kevlar'], bonus: { hp: 3 }, text: 'Mythic. +3 HP, Spirit Resist 4.' },
  { id: 'mystic_reverb',        name: 'Mystic Reverb',         type: 'equipment', rarity: 4, tier: 3, cost: 5, abilities: ['eff_mystic_reverb'], text: 'Mythic. +3 Spirit Power.' },
  { id: 'boundless_spirit',     name: 'Boundless Spirit',      type: 'equipment', rarity: 4, tier: 3, cost: 5, abilities: ['eff_boundless_spirit'], bonus: { hp: 3 }, text: 'Mythic. +3 HP, +5 Spirit Power.' },
  { id: 'inhibitor',            name: 'Inhibitor',             type: 'equipment', rarity: 4, tier: 3, cost: 5, abilities: ['eff_inhibitor_attach'], bonus: { hp: 3, spirit: 1 }, text: 'Mythic. +3 HP, +1 Spirit, Spirit Resist 3.' },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, EquipmentCard>;
