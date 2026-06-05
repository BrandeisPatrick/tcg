import type { EquipmentCard } from '@/engine/types';

/**
 * Equipment = passive items. Once attached, they grant an ongoing effect
 * (stat boost, on-trigger proc). V1 minimal set: 9 cards mapping to the
 * basic effects (Bullet Power, HP, Spirit Power, bullet/spirit lifesteal,
 * bullet/spirit resist, bullet/spirit shield).
 *
 * Cost model (tier-banded, 1–10 economy):
 *   T1 — 1-2 souls (rarity 1)
 *   T2 — 3-4 souls (rarity 2)
 *   T3 — 5-6 souls (rarity 3)
 *   T4 — 7+ souls  (rarity 4, premium)
 *   Cost is picked within the tier's band by relative power; there is no
 *   single formula tying magnitude to cost.
 *
 * Text formatting conventions: status keywords (Bullet Resist, Spirit Power,
 * Shield, …) auto-bold via `RuleText`.
 */
export const EQUIPMENT: EquipmentCard[] = [
  // ----- T1 (cost 1-2) — stat sticks + lifesteal -----
  { id: 'extended_magazine',    name: 'Extended Magazine',    type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { atk: 1 },    text: '+1 Bullet Power.' },
  { id: 'extra_spirit',         name: 'Extra Spirit',         type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { spirit: 1 }, text: '+1 Spirit Power.' },
  { id: 'extra_regen',          name: 'Extra Regen',          type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_extra_regen_proc'], text: 'At the start of your turn: heal 1.' },
  { id: 'extra_health',         name: 'Extra Health',         type: 'equipment', rarity: 1, tier: 1, cost: 1, bonus: { hp: 2 },     text: '+2 HP.' },
  { id: 'restorative_shot',     name: 'Restorative Shot',     type: 'equipment', rarity: 1, tier: 1, cost: 1, abilities: ['eff_restorative_shot_proc'],     text: 'After bearer attacks: heal 1.' },
  { id: 'mystic_regeneration',  name: 'Mystic Regeneration',  type: 'equipment', rarity: 1, tier: 1, cost: 1, abilities: ['eff_mystic_regeneration_proc'], text: "After bearer's skill / spell / ult damages an enemy: heal 1." },

  // ----- T2 (cost 3-4) — stat upgrades (canon T2 Weapon / Spirit) -----
  { id: 'titanic_magazine',  name: 'Titanic Magazine',  type: 'equipment', rarity: 2, tier: 2, cost: 4, bonus: { atk: 2 },    text: '+2 Bullet Power.' },
  { id: 'improved_spirit',   name: 'Improved Spirit',   type: 'equipment', rarity: 2, tier: 2, cost: 4, bonus: { spirit: 2 }, text: '+2 Spirit Power.' },

  // ----- T2 (cost 3-4) — healing boost (canon T2 Vitality) -----
  { id: 'healing_booster', name: 'Healing Booster', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_healing_booster'], text: 'Healing Boost 2.' },

  // ----- T2 (cost 3-4) — reactive shields (canon T2 Vitality) -----
  { id: 'weapon_shielding', name: 'Weapon Shielding', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_shield_proc'], text: 'When bearer takes bullet damage: gain Shield 2.' },
  { id: 'spirit_shielding', name: 'Spirit Shielding', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_spirit_shield_proc'], text: 'When bearer takes spirit damage: gain Shield 2.' },

  // ----- T2 (cost 3-4) — resist shred (canon T2 Spirit) -----
  { id: 'bullet_resist_shredder', name: 'Bullet Resist Shredder', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_resist_shredder_proc'], text: "Bearer's attacks apply Bullet Resist −1 for 1 turn." },

  // Spirit Resist is narrower than Bullet Resist (spirit damage is rare), so it
  // sits a tier below its bullet counterpart — same magnitude, lower cost.
  { id: 'spirit_resilience', name: 'Spirit Resilience', type: 'equipment', rarity: 2, tier: 2, cost: 4, abilities: ['eff_spirit_resist'], text: 'Spirit Resist 3.' },

  // ----- T3 (cost 5-6) — passive resists (canon T3 Vitality) -----
  { id: 'bullet_resilience', name: 'Bullet Resilience', type: 'equipment', rarity: 3, tier: 3, cost: 6, abilities: ['eff_bullet_resist'], text: 'Bullet Resist 3.' },

  // ----- T4 (cost 7+) — premium items (canon T4) -----
  { id: 'healing_tempo',  name: 'Healing Tempo',  type: 'equipment', rarity: 4, tier: 4, cost: 7, bonus: { atk: 2 }, abilities: ['eff_healing_tempo'], text: '+2 Bullet Power. Healing Boost 4.' },
  { id: 'boundless_spirit', name: 'Boundless Spirit', type: 'equipment', rarity: 4, tier: 4, cost: 8, bonus: { spirit: 5, hp: 3 }, text: '+5 Spirit Power. +3 HP.' },
  { id: 'glass_cannon',   name: 'Glass Cannon',   type: 'equipment', rarity: 4, tier: 4, cost: 8, bonus: { atk: 6, hp: -1 }, text: '+6 Bullet Power. −1 max HP.' },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, EquipmentCard>;
