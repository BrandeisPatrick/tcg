import type { EquipmentCard } from '@/engine/types';

/**
 * Equipment = passive items. Once attached, they grant an ongoing effect
 * (stat boost, on-trigger proc). V1 minimal set: 9 cards mapping to the
 * basic effects (Bullet Power, HP, Spirit Power, bullet/spirit lifesteal,
 * bullet/spirit resist, bullet/spirit shield).
 *
 * Cost model (V1 locked):
 *   T1 — 1-2 souls (rarity 1)
 *   T2 — 3-4 souls (rarity 2)
 *   Equipment generally costs ~1 more than a comparable spell because the
 *   effect persists across turns.
 *
 * Text formatting conventions: status keywords (Bullet Resist, Spirit Power,
 * Shield, …) auto-bold via `RuleText`.
 */
export const EQUIPMENT: EquipmentCard[] = [
  // ----- T1 (cost 2) — stat sticks + lifesteal -----
  { id: 'extended_magazine',    name: 'Extended Magazine',    type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { atk: 1 },    text: '+1 Bullet Power.' },
  { id: 'extra_health',         name: 'Extra Health',         type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { hp: 2 },     text: '+2 HP.' },
  { id: 'extra_spirit',         name: 'Extra Spirit',         type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { spirit: 1 }, text: '+1 Spirit Power.' },
  { id: 'restorative_shot',     name: 'Restorative Shot',     type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_restorative_shot_proc'],     text: 'After bearer attacks: heal 1.' },
  { id: 'mystic_regeneration',  name: 'Mystic Regeneration',  type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_mystic_regeneration_proc'], text: "After bearer's skill / spell / ult damages an enemy: heal 1." },
  { id: 'extra_regen',          name: 'Extra Regen',          type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { hp: 1 }, text: '+1 HP.' },

  // ----- T2 (cost 3) — stat upgrades (canon T2 Weapon / Spirit) -----
  { id: 'titanic_magazine',  name: 'Titanic Magazine',  type: 'equipment', rarity: 2, tier: 2, cost: 3, bonus: { atk: 2 },    text: '+2 Bullet Power.' },
  { id: 'improved_spirit',   name: 'Improved Spirit',   type: 'equipment', rarity: 2, tier: 2, cost: 3, bonus: { spirit: 2 }, text: '+2 Spirit Power.' },

  // ----- T2 (cost 3) — healing boost (canon T2 Vitality) -----
  { id: 'healing_booster', name: 'Healing Booster', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_healing_booster'], text: 'Healing Boost 2.' },

  // ----- T2 (cost 3) — reactive shields (canon T2 Vitality) -----
  { id: 'weapon_shielding', name: 'Weapon Shielding', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_shield_proc'], text: 'When bearer takes bullet damage: gain Shield 2.' },
  { id: 'spirit_shielding', name: 'Spirit Shielding', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_spirit_shield_proc'], text: 'When bearer takes spirit damage: gain Shield 2.' },

  // ----- T2 (cost 3) — resist shred (canon T2 Spirit) -----
  { id: 'bullet_resist_shredder', name: 'Bullet Resist Shredder', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_resist_shredder_proc'], text: "Bearer's attacks apply Bullet Resist −1 for 1 turn." },

  // ----- T3 (cost 5) — passive resists (canon T3 Vitality) -----
  { id: 'bullet_resilience', name: 'Bullet Resilience', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_bullet_resist'], text: 'Bullet Resist 3.' },
  { id: 'spirit_resilience', name: 'Spirit Resilience', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_spirit_resist'], text: 'Spirit Resist 3.' },

  // ----- T4 (cost 7) — premium items (canon T4) -----
  { id: 'healing_tempo',  name: 'Healing Tempo',  type: 'equipment', rarity: 4, tier: 4, cost: 7, bonus: { atk: 1 }, abilities: ['eff_healing_tempo'], text: '+1 Bullet Power. Healing Boost 3.' },
  { id: 'glass_cannon',   name: 'Glass Cannon',   type: 'equipment', rarity: 4, tier: 4, cost: 7, bonus: { atk: 4, hp: -2 }, text: '+4 Bullet Power. −2 max HP.' },
  { id: 'boundless_spirit', name: 'Boundless Spirit', type: 'equipment', rarity: 4, tier: 4, cost: 7, bonus: { spirit: 4, hp: 2 }, text: '+4 Spirit Power. +2 HP.' },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, EquipmentCard>;
