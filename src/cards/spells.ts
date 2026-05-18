import type { SpellCard } from '@/engine/types';

/**
 * Spells = ACTIVE Deadlock items (cards that cast once, resolve, and discard).
 * Every spell here is verified against the Deadlock catalogue and is_active_item=true,
 * except `soul_rebirth` which is a TCG original (no canon counterpart).
 *
 * For PASSIVE Deadlock items (stat sticks / on-trigger procs), see `equipment.ts`.
 */
export const SPELLS: SpellCard[] = [
  // ----- Tier 1 (1 soul) — small reactive plays -----
  { id: 'healing_rite',        name: 'Healing Rite',        type: 'spell', rarity: 1, cost: 1, abilities: ['eff_healing_rite'],        text: 'Heal an ally for 3.' },

  // ----- Tier 2 (2 souls) — staple skirmish tools -----
  { id: 'cold_front',          name: 'Cold Front',          type: 'spell', rarity: 2, cost: 2, abilities: ['eff_cold_front'],          text: 'Stun enemy Active for 2.' },
  { id: 'decay',               name: 'Decay',               type: 'spell', rarity: 2, cost: 2, abilities: ['eff_decay'],               text: 'Apply Bleed 2 to enemy Active.' },
  { id: 'ethereal_shift',      name: 'Ethereal Shift',      type: 'spell', rarity: 2, cost: 2, abilities: ['eff_ethereal_shift'],      text: 'Ally Active gains Invincibility 1.' },
  { id: 'phantom_strike',      name: 'Phantom Strike',      type: 'spell', rarity: 2, cost: 2, abilities: ['eff_phantom_strike'],      text: '3 dmg to any enemy.' },
  { id: 'return_fire',         name: 'Return Fire',         type: 'spell', rarity: 2, cost: 2, abilities: ['eff_return_fire'],         text: 'Ally Active deals attack dmg back when hit (1 turn).' },

  // ----- Tier 3 (3 souls) — control + tempo tools -----
  { id: 'echo_shard',          name: 'Echo Shard',          type: 'spell', rarity: 3, cost: 3, abilities: ['eff_echo_shard'],          text: 'Refresh your skill use this turn. (Cast another skill if you already used one.)' },
  { id: 'knockdown',           name: 'Knockdown',           type: 'spell', rarity: 2, cost: 3, abilities: ['eff_knockdown'],           text: 'Stun enemy Active for 1 and Disarm 2.' },
  { id: 'silence_glyph',       name: 'Silence Glyph',       type: 'spell', rarity: 2, cost: 3, abilities: ['eff_silence_glyph'],       text: 'Silence enemy Active and all Bench for 1.' },
  { id: 'disarming_hex',       name: 'Disarming Hex',       type: 'spell', rarity: 3, cost: 3, abilities: ['eff_disarming_hex'],       text: 'Disarm an enemy for 2 turns.' },
  { id: 'metal_skin',          name: 'Metal Skin',          type: 'spell', rarity: 3, cost: 3, abilities: ['eff_cast_metal_skin'],     text: 'Ally Active gains Bullet Resist 3 for 2 turns.' },

  // ----- Tier 3+ (4 souls) — heavy disables -----
  { id: 'slowing_hex',         name: 'Slowing Hex',         type: 'spell', rarity: 3, cost: 4, abilities: ['eff_slowing_hex'],         text: 'Disarm + Vulnerable on an enemy for 3 turns.' },

  // ----- Mythic spells (T4 — late-game finishers) -----
  { id: 'curse',               name: 'Curse',               type: 'spell', rarity: 4, cost: 5, abilities: ['eff_curse'],               text: 'Mythic. Silence + Disarm + Vulnerable on enemy Active for 2 turns.' },
  { id: 'divine_barrier',      name: 'Divine Barrier',      type: 'spell', rarity: 4, cost: 5, abilities: ['eff_cast_divine_barrier'], text: 'Mythic. Shield 5 on ally Active.' },
  { id: 'soul_rebirth',        name: 'Soul Rebirth',        type: 'spell', rarity: 4, cost: 5, abilities: ['eff_soul_rebirth'],        text: 'Mythic. Instantly respawn one of your fallen heroes to the bench. (TCG original.)' },
];

export const SPELLS_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<string, SpellCard>;
