import type { EquipmentCard } from '@/engine/types';

/**
 * Equipment = passive items. Once attached, they grant an ongoing effect
 * (stat boost, on-trigger proc). V1 minimal set: 11 cards mapping to the
 * basic effects (ATK, HP, Spirit Power, card draw, bullet/spirit lifesteal,
 * bullet/spirit shield, bullet/spirit armor).
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
  { id: 'close_quarters',    name: 'Close Quarters',    type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { atk: 1 },    text: '+1 ATK.' },
  { id: 'extended_magazine', name: 'Extended Magazine', type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { atk: 2 },    text: '+2 ATK.' },
  { id: 'extra_health',      name: 'Extra Health',      type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { hp: 2 },     text: '+2 HP.' },
  { id: 'extra_spirit',      name: 'Extra Spirit',      type: 'equipment', rarity: 1, tier: 1, cost: 2, bonus: { spirit: 1 }, text: '+1 Spirit Power.' },
  { id: 'extra_stamina',     name: 'Extra Stamina',     type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_extra_stamina'], text: 'On attach: draw 2 cards.' },
  { id: 'bullet_lifesteal',  name: 'Bullet Lifesteal',  type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_bullet_lifesteal_proc'], text: 'After bearer attacks: heal 1.' },
  { id: 'spirit_lifesteal',  name: 'Spirit Lifesteal',  type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_spirit_lifesteal_proc'], text: "After bearer's skill / spell / ult damages an enemy: heal 1." },

  // ----- T2 (cost 3) — passive resists -----
  { id: 'bullet_armor', name: 'Bullet Armor', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_armor'], text: 'Bullet Resist 2.' },
  { id: 'spirit_armor', name: 'Spirit Armor', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_spirit_armor'], text: 'Spirit Resist 2.' },

  // ----- T2 (cost 4) — reactive shields -----
  { id: 'bullet_shield', name: 'Bullet Shield', type: 'equipment', rarity: 2, tier: 2, cost: 4, abilities: ['eff_bullet_shield_proc'], text: 'When bearer takes bullet damage: gain Shield 2.' },
  { id: 'spirit_shield', name: 'Spirit Shield', type: 'equipment', rarity: 2, tier: 2, cost: 4, abilities: ['eff_spirit_shield_proc'], text: 'When bearer takes spirit damage: gain Shield 2.' },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, EquipmentCard>;
