import type { SpellCard } from '@/engine/types';

/**
 * Spells = ACTIVE Deadlock items (cards that cast once, resolve, and discard).
 *
 * Tier + cost map to canon Deadlock pricing (verified against the
 * deadlock-api.com `item_tier` field):
 *   T1 (1 soul · 800 in canon) — small reactive plays
 *   T2 (2 souls · 1600 in canon) — staple skirmish tools
 *   T3 (3 souls · 3200 in canon) — heavy disable / tempo
 *   T4 (5 souls · 6400 in canon) — finishers + mythic
 *
 * All canon costs verified against `is_active_item=true` + `item_tier`.
 * `soul_rebirth` is a TCG original (no canon counterpart) — flagged in `text`.
 *
 * Text formatting conventions (auto-bolded by `RuleText`):
 *   - Status keywords (Stun, Silence, Disarm, Bleed, Vulnerable, Shield, …)
 *   - Timing markers (Mythic) + scaling tag ("(+ caster Spirit)")
 *   - Durations always read "for N turns" (singular OK at N=1 for consistency)
 *   - Damage uses "dmg" not "damage"
 *
 * For PASSIVE Deadlock items (stat sticks / on-trigger procs), see `equipment.ts`.
 */
export const SPELLS: SpellCard[] = [
  // ----- Tier 1 (1 soul) — small reactive plays -----
  { id: 'healing_rite',        name: 'Healing Rite',        type: 'spell', rarity: 1, cost: 1, abilities: ['eff_healing_rite'],        text: 'Heal an ally for 3 (+ caster Spirit).' },
  { id: 'rusted_barrel',       name: 'Rusted Barrel',       type: 'spell', rarity: 1, cost: 1, abilities: ['eff_rusted_barrel'],       text: 'Grant ally Active +2 Spirit Power for 1 turn.' },
  { id: 'golden_goose_egg',    name: 'Golden Goose Egg',    type: 'spell', rarity: 1, cost: 1, abilities: ['eff_golden_goose'],        text: 'Gain 2 souls this turn (capped at 7).' },

  // ----- Tier 2 (2 souls) — staple skirmish tools -----
  { id: 'cold_front',          name: 'Cold Front',          type: 'spell', rarity: 2, cost: 2, abilities: ['eff_cold_front'],          text: 'Stun enemy Active for 2 turns.' },
  { id: 'return_fire',         name: 'Return Fire',         type: 'spell', rarity: 2, cost: 2, abilities: ['eff_return_fire'],         text: 'Grant ally Active Bullet Resist 3 (+ caster Spirit) for 1 turn.' },
  { id: 'slowing_hex',         name: 'Slowing Hex',         type: 'spell', rarity: 2, cost: 2, abilities: ['eff_slowing_hex'],         text: 'Disarm and Vulnerable on an enemy for 2 turns.' },

  // ----- Tier 3 (3-4 souls) — control + tempo tools -----
  { id: 'decay',               name: 'Decay',               type: 'spell', rarity: 3, cost: 3, abilities: ['eff_decay'],               text: 'Apply Bleed 3 (+ caster Spirit) to enemy Active for 3 turns.' },
  { id: 'metal_skin',          name: 'Metal Skin',          type: 'spell', rarity: 3, cost: 4, abilities: ['eff_cast_metal_skin'],     text: 'Grant ally Active Bullet Resist 5 (+ caster Spirit) for 2 turns.' },
  { id: 'knockdown',           name: 'Knockdown',           type: 'spell', rarity: 3, cost: 4, abilities: ['eff_knockdown'],           text: 'Stun enemy Active for 2 turns. Disarm for 3 turns.' },
  { id: 'disarming_hex',       name: 'Disarming Hex',       type: 'spell', rarity: 3, cost: 4, abilities: ['eff_disarming_hex'],       text: 'Disarm an enemy for 3 turns.' },

  // ----- Mythic (T4) · 5 souls — late-game finishers -----
  { id: 'ethereal_shift',      name: 'Ethereal Shift',      type: 'spell', rarity: 4, cost: 5, abilities: ['eff_ethereal_shift'],      text: 'Mythic. Grant ally Active Invincibility for 2 turns.' },
  { id: 'phantom_strike',      name: 'Phantom Strike',      type: 'spell', rarity: 4, cost: 5, abilities: ['eff_phantom_strike'],      text: 'Mythic. 6 dmg (+ caster Spirit) to any enemy.' },
  { id: 'echo_shard',          name: 'Echo Shard',          type: 'spell', rarity: 4, cost: 5, abilities: ['eff_echo_shard'],          text: 'Mythic. Cast another skill this turn.' },
  { id: 'silence_glyph',       name: 'Silence Glyph',       type: 'spell', rarity: 4, cost: 5, abilities: ['eff_silence_glyph'],       text: 'Mythic. Silence enemy Active and all Bench heroes for 2 turns.' },
  { id: 'curse',               name: 'Curse',               type: 'spell', rarity: 4, cost: 5, abilities: ['eff_curse'],               text: 'Mythic. Silence, Disarm, and Vulnerable on enemy Active for 2 turns.' },
  { id: 'divine_barrier',      name: 'Divine Barrier',      type: 'spell', rarity: 4, cost: 5, abilities: ['eff_cast_divine_barrier'], text: 'Mythic. Shield 5 (+ caster Spirit) on ally Active.' },
  { id: 'soul_rebirth',        name: 'Soul Rebirth',        type: 'spell', rarity: 4, cost: 5, abilities: ['eff_soul_rebirth'],        text: 'Mythic. Respawn one of your fallen heroes immediately.' },
];

export const SPELLS_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<string, SpellCard>;
