import type { SpellCard } from '@/engine/types';

/**
 * Spells = active one-shot cards (resolve and discard). V1 minimal set: every
 * spell maps to a single basic effect — heal, weaken, stun, resist, bleed,
 * disarm+vulnerable, knockdown, or shielded brace.
 *
 * Cost model (V1 locked):
 *   T1 — 1-2 souls  (rarity 1)
 *   T2 — 3-4 souls  (rarity 2)
 *   1 cost ≈ 1 damage / 2 HP / 1.5 debuff-turns on average.
 *
 * Text formatting conventions (auto-bolded by `RuleText`):
 *   - Status keywords (Weaken, Stun, Disarm, Bleed, Vulnerable, Bullet Resist, …)
 *   - Scaling tag "(+ caster Spirit)"
 *   - Durations always read "for N turns"
 */
export const SPELLS: SpellCard[] = [
  // ----- T1 (cost 1) — early reactive plays -----
  { id: 'healing_rite',  name: 'Healing Rite',  type: 'spell', rarity: 1, cost: 1, abilities: ['eff_healing_rite'],  text: 'Heal an ally for 2 (+ caster Spirit).' },
  { id: 'rusted_barrel', name: 'Rusted Barrel', type: 'spell', rarity: 1, cost: 1, abilities: ['eff_rusted_barrel'], text: 'Apply Weaken 2 on enemy Active for 2 turns.' },

  // ----- T1 (cost 2) — staple skirmish tools -----
  { id: 'cold_front',  name: 'Cold Front',  type: 'spell', rarity: 1, cost: 2, abilities: ['eff_cold_front'],  text: 'Stun enemy Active for 1 turn.' },
  { id: 'return_fire', name: 'Return Fire', type: 'spell', rarity: 1, cost: 2, abilities: ['eff_return_fire'], text: 'Grant ally Bullet Resist 3 (+ caster Spirit) for 1 turn.' },

  // ----- T2 (cost 3) — control + tempo -----
  { id: 'decay',       name: 'Decay',       type: 'spell', rarity: 2, cost: 3, abilities: ['eff_decay'],       text: 'Apply Bleed 2 to enemy Active for 2 turns.' },
  { id: 'slowing_hex', name: 'Slowing Hex', type: 'spell', rarity: 2, cost: 3, abilities: ['eff_slowing_hex'], text: 'Disarm + Vulnerable 2 on any enemy for 1 turn.' },

  // ----- T2 (cost 4) — finishers -----
  { id: 'knockdown',  name: 'Knockdown',  type: 'spell', rarity: 2, cost: 4, abilities: ['eff_knockdown'],         text: 'Stun enemy Active for 1 turn. Disarm for 2 turns.' },
  { id: 'metal_skin', name: 'Metal Skin', type: 'spell', rarity: 2, cost: 4, abilities: ['eff_cast_metal_skin'],  text: 'Grant ally Bullet Resist 5 (+ caster Spirit) for 1 turn.' },
];

export const SPELLS_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<string, SpellCard>;
