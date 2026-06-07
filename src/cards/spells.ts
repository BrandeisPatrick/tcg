import type { SpellCard } from '@/engine/types';

/**
 * Spells = active one-shot cards (resolve and discard). V1 minimal set: every
 * spell maps to a single basic effect — heal, weaken, burst damage, bleed,
 * disarm, knockdown, or bullet brace.
 *
 * Cost model (tier-banded, 1–10 economy):
 *   T1 — 1-2 souls  (rarity 1)
 *   T2 — 3-4 souls  (rarity 2)
 *   T3 — 5-6 souls  (rarity 3)
 *   Spells top out at the T3 band (no rarity-4 spells). Cost is picked
 *   within the band by relative power, not a fixed formula.
 *
 * Spirit Power scales ONLY spirit damage. It does NOT scale heals or
 * Bullet Resist — those are flat magnitudes.
 *
 * Text formatting conventions (auto-bolded by `RuleText`):
 *   - Status keywords (Weaken, Stun, Disarm, Bleed, Bullet Resist, …)
 *   - Damage-type labels ("spirit damage")
 *   - Durations always read "for N turns"
 */
export const SPELLS: SpellCard[] = [
  // ----- T1 (cost 1-2) — early reactive plays -----
  { id: 'healing_rite',  name: 'Healing Rite',  type: 'spell', rarity: 1, cost: 1, abilities: ['eff_healing_rite'],  text: 'Heal an ally for 2.' },
  { id: 'rusted_barrel', name: 'Rusted Barrel', type: 'spell', rarity: 1, cost: 2, abilities: ['eff_rusted_barrel'], text: 'Apply Bullet Power −2 on enemy Active for 2 turns.' },

  // ----- T2 (cost 3-4) — control + tempo -----
  { id: 'cold_front',     name: 'Cold Front',     type: 'spell', rarity: 2, cost: 4, abilities: ['eff_cold_front'],     text: 'Deal 4 spirit damage to enemy Active.' },
  { id: 'slowing_hex',    name: 'Slowing Hex',    type: 'spell', rarity: 2, cost: 3, abilities: ['eff_slowing_hex'],    text: 'Silence any enemy for 1 turn.' },
  { id: 'healbane',       name: 'Healbane',       type: 'spell', rarity: 2, cost: 3, abilities: ['eff_healbane'],       text: 'Block healing on any enemy for 2 turns.' },
  { id: 'spirit_sap',     name: 'Spirit Sap',     type: 'spell', rarity: 2, cost: 3, abilities: ['eff_spirit_sap'],     text: 'Apply Spirit Resist −2 to any enemy for 2 turns.' },

  // ----- T3 (cost 5-6) — premium finishers (canon T3 Spirit) -----
  { id: 'decay',          name: 'Decay',          type: 'spell', rarity: 3, cost: 5, abilities: ['eff_decay'],          text: 'Apply Bleed 3 to enemy Active for 2 turns.' },
  { id: 'disarming_hex',  name: 'Disarming Hex',  type: 'spell', rarity: 3, cost: 5, abilities: ['eff_disarming_hex'],  text: 'Disarm any enemy for 2 turns.' },
  { id: 'knockdown',      name: 'Knockdown',      type: 'spell', rarity: 3, cost: 6, abilities: ['eff_knockdown'],      text: 'Stun enemy Active for 1 turn.' },
  { id: 'metal_skin',     name: 'Metal Skin',     type: 'spell', rarity: 3, cost: 6, abilities: ['eff_cast_metal_skin'], text: 'Grant ally Bullet Resist 5 for 2 turns.' },

  // ----- Control pack (canon active items → spells) -----
  { id: 'debuff_remover', name: 'Debuff Remover', type: 'spell', rarity: 1, cost: 2, abilities: ['eff_debuff_remover'],   text: "Cleanse an ally's debuffs. Grant Shield 2." },
  { id: 'silence_glyph',  name: 'Silence Glyph',  type: 'spell', rarity: 2, cost: 3, abilities: ['eff_silence_glyph'],    text: 'Deal 2 spirit damage to enemy Active and Silence it for 2 turns.' },
  { id: 'echo_shard',     name: 'Echo Shard',     type: 'spell', rarity: 2, cost: 4, abilities: ['eff_echo_shard'],       text: 'Your Active hero uses their skill again this turn.' },
  { id: 'unstoppable',    name: 'Unstoppable',    type: 'spell', rarity: 3, cost: 5, abilities: ['eff_unstoppable_cast'], text: 'Your Active hero gains Unstoppable for 1 turn.' },
  { id: 'curse',          name: 'Curse',          type: 'spell', rarity: 3, cost: 5, abilities: ['eff_curse'],            text: 'Silence and Disarm the enemy Active for 3 turns.' },
];

export const SPELLS_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<string, SpellCard>;
