import type { SpellCard } from '@/engine/types';

/**
 * Spells = active one-shot cards (resolve and discard). Every spell is a canon
 * Deadlock ACTIVE item, and every active item that becomes a card is a spell —
 * see docs/card-design.md. V1 minimal set: every
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
 *   - A number the effect adds your Active's Spirit Power to is marked
 *     `{sp:4}` and printed purple (card/scaling.ts); every other number is flat.
 */
export const SPELLS: SpellCard[] = [
  // ----- T1 (cost 1-2) — early reactive plays -----
  { id: 'healing_rite',  name: 'Healing Rite',  type: 'spell', rarity: 1, cost: 1, abilities: ['eff_healing_rite'],  text: 'Heal an ally for 2.' },
  { id: 'rusted_barrel', name: 'Rusted Barrel', type: 'spell', rarity: 1, cost: 2, abilities: ['eff_rusted_barrel'], text: 'Apply Bullet Power −2 on enemy Active for 2 turns.' },

  // ----- T2 (cost 3-4) — control + tempo -----
  { id: 'cold_front',     name: 'Cold Front',     type: 'spell', rarity: 2, cost: 4, abilities: ['eff_cold_front'],     text: 'Deal {sp:4} spirit damage to enemy Active.' },
  { id: 'slowing_hex',    name: 'Slowing Hex',    type: 'spell', rarity: 2, cost: 3, abilities: ['eff_slowing_hex'],    text: 'Silence any enemy for 1 turn.' },
  { id: 'spirit_sap',     name: 'Spirit Sap',     type: 'spell', rarity: 2, cost: 3, abilities: ['eff_spirit_sap'],     text: 'Apply Spirit Resist −2 to any enemy for 2 turns.' },

  // ----- T3 (cost 5-6) — premium finishers (canon T3 Spirit) -----
  { id: 'decay',          name: 'Decay',          type: 'spell', rarity: 3, cost: 5, abilities: ['eff_decay'],          text: 'Apply Bleed 3 to enemy Active for 2 turns.' },
  { id: 'disarming_hex',  name: 'Disarming Hex',  type: 'spell', rarity: 3, cost: 5, abilities: ['eff_disarming_hex'],  text: 'Disarm any enemy for 2 turns.' },
  { id: 'knockdown',      name: 'Knockdown',      type: 'spell', rarity: 3, cost: 5, abilities: ['eff_knockdown'],      text: 'Stun enemy Active for 1 turn.' },
  { id: 'metal_skin',     name: 'Metal Skin',     type: 'spell', rarity: 3, cost: 6, abilities: ['eff_cast_metal_skin'], text: 'Grant ally Bullet Resist 5 for 2 turns.' },

  // ----- Control pack (canon active items → spells) -----
  // Three ids keep an item's old name so saved decks still load: debuff_remover
  // is Dispel Magic, silence_glyph is Silence Wave, curse is Cursed Relic.
  { id: 'debuff_remover', name: 'Dispel Magic',   type: 'spell', rarity: 3, cost: 5, abilities: ['eff_debuff_remover'],   text: "Cleanse an ally's debuffs and grant Shield 2. If any were removed, heal it 3." },
  { id: 'silence_glyph',  name: 'Silence Wave',   type: 'spell', rarity: 3, cost: 5, abilities: ['eff_silence_glyph'],    text: 'Deal {sp:2} spirit damage to enemy Active and Silence it for 2 turns.' },
  { id: 'echo_shard',     name: 'Echo Shard',     type: 'spell', rarity: 3, cost: 5, abilities: ['eff_echo_shard'],       text: 'Your Active hero uses their skill again this turn.' },
  { id: 'unstoppable',    name: 'Unstoppable',    type: 'spell', rarity: 3, cost: 5, abilities: ['eff_unstoppable_cast'], text: 'Your Active hero gains Unstoppable for 1 turn.' },
  { id: 'curse',          name: 'Cursed Relic',   type: 'spell', rarity: 3, cost: 5, abilities: ['eff_curse'],            text: 'Silence and Disarm one enemy hero for 3 turns: no skill, no attack.' },

  // ----- Movement, protection and draw (canon active items → spells) -----
  // T4 actives sit at the top of the spell band (5–6), per docs/card-design.md.
  { id: 'guardian_ward',  name: 'Guardian Ward',  type: 'spell', rarity: 2, cost: 3, abilities: ['eff_guardian_ward'],  text: 'Grant an ally Shield 3.' },
  // Warp Stone sits at the top of its band (6): a free swap plus resist played
  // above its weight at 5 in the sims.
  { id: 'warp_stone',     name: 'Warp Stone',     type: 'spell', rarity: 3, cost: 6, abilities: ['eff_warp_stone'],     text: 'A bench ally swaps into your Active slot and gains Bullet Resist 3 for 2 turns.' },
  { id: 'divine_barrier', name: 'Divine Barrier', type: 'spell', rarity: 3, cost: 5, abilities: ['eff_divine_barrier'], text: "Cleanse an ally's debuffs except Stun and grant it Shield 4." },
  { id: 'ethereal_shift', name: 'Ethereal Shift', type: 'spell', rarity: 3, cost: 5, abilities: ['eff_ethereal_shift'], text: 'An ally gains Dome for 1 turn and +1 Spirit Power for 2 turns.' },
  { id: 'phantom_strike', name: 'Phantom Strike', type: 'spell', rarity: 3, cost: 5, abilities: ['eff_phantom_strike'], text: 'Drag an enemy bench hero into their Active slot, deal {sp:2} spirit damage to it and Disarm it for 1 turn.' },
  { id: 'vortex_web',     name: 'Vortex Web',     type: 'spell', rarity: 3, cost: 6, abilities: ['eff_vortex_web'],     text: 'Deal {sp:2} spirit damage to every enemy. They are Rooted for 2 turns.' },
  { id: 'refresher',      name: 'Refresher',      type: 'spell', rarity: 3, cost: 6, abilities: ['eff_refresher'],      text: 'Draw 2 cards.' },
  { id: 'colossus',       name: 'Colossus',       type: 'spell', rarity: 3, cost: 6, abilities: ['eff_colossus_cast'],  text: 'Your Active gains Bullet Resist 4 and Spirit Resist 4 for 2 turns. The enemy Active is Rooted for 1 turn.' },

  // ----- More canon active items (docs/card-design.md, added 2026-10-30) -----
  // A brown `{bp:0}` is your Active's Bullet Power itself (card/scaling.ts).
  // Blood Tribute is a T3 item at 2 souls: the rest of its price is paid in HP.
  { id: 'golden_goose_egg', name: 'Golden Goose Egg', type: 'spell', rarity: 1, cost: 1, abilities: ['eff_golden_goose_egg'], text: 'Gain 2 souls. Your Active gains +1 max HP.' },
  { id: 'grit',             name: 'Grit',             type: 'spell', rarity: 1, cost: 1, abilities: ['eff_grit'],             text: 'Your Active gains Shield 2.' },
  { id: 'return_fire',      name: 'Return Fire',      type: 'spell', rarity: 2, cost: 3, abilities: ['eff_return_fire'],      text: 'Your Active gains Return Fire 2 for 2 turns: an enemy attack that hits it costs the attacker 2 bullet damage.' },
  { id: 'fleetfoot',        name: 'Fleetfoot',        type: 'spell', rarity: 2, cost: 3, abilities: ['eff_fleetfoot'],        text: 'Your Active gains Extra Attack 1 this turn and is no longer Rooted.' },
  { id: 'split_shot',       name: 'Split Shot',       type: 'spell', rarity: 2, cost: 3, abilities: ['eff_split_shot'],       text: "Your Active's shot splits: deal {bp:1/2} bullet damage to every enemy bench hero." },
  { id: 'blood_tribute',    name: 'Blood Tribute',    type: 'spell', rarity: 3, cost: 2, abilities: ['eff_blood_tribute'],    text: 'Your Active pays 3 HP (never below 1) and gains Extra Attack 1 and +1 Bullet Power this turn.' },
  { id: 'healing_nova',     name: 'Healing Nova',     type: 'spell', rarity: 3, cost: 5, abilities: ['eff_healing_nova'],     text: 'Heal all allies 3.' },
  { id: 'rescue_beam',      name: 'Rescue Beam',      type: 'spell', rarity: 3, cost: 5, abilities: ['eff_rescue_beam'],      text: 'A bench ally steps into your Active slot; the hero it rescues heals 4 on the bench.' },
  { id: 'fury_trance',      name: 'Fury Trance',      type: 'spell', rarity: 3, cost: 4, abilities: ['eff_fury_trance'],      text: 'Your Active gains Extra Attack 1 this turn and Spirit Resist 3 for 2 turns, but is Silenced for 2 turns.' },
  { id: 'alchemical_fire',  name: 'Alchemical Fire',  type: 'spell', rarity: 3, cost: 6, abilities: ['eff_alchemical_fire'],  text: 'Deal {sp:1} spirit damage to every enemy and apply Bullet Resist −2 to them for 2 turns.' },
  { id: 'heroic_aura',      name: 'Heroic Aura',      type: 'spell', rarity: 3, cost: 5, abilities: ['eff_heroic_aura'],      text: 'All allies gain +1 Bullet Power and Bullet Resist 1 for 2 turns.' },
  { id: 'shadow_weave',     name: 'Shadow Weave',     type: 'spell', rarity: 3, cost: 5, abilities: ['eff_shadow_weave'],     text: 'Your Active gains Dome for 1 turn and +2 Bullet Power for 2 turns.' },
  { id: 'infuser',          name: 'Infuser',          type: 'spell', rarity: 3, cost: 5, abilities: ['eff_infuser'],          text: 'Your Active gains +3 Spirit Power for 2 turns and heals 3.' },
  { id: 'arctic_blast',     name: 'Arctic Blast',     type: 'spell', rarity: 3, cost: 6, abilities: ['eff_arctic_blast'],     text: 'Deal {sp:2} spirit damage to every enemy. Stun the enemy Active for 1 turn.' },
];

export const SPELLS_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<string, SpellCard>;
