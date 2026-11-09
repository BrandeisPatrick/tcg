import type { SpellCard } from '@/engine/types';

/**
 * Spells = ACTIVE items. Every spell is a canon Deadlock active item, and
 * every active item that becomes a card is a spell — see docs/card-design.md.
 * A hero is dealt one from the deck and wears it like any item; it is used from
 * the bearer's sheet as that hero's one ability of the turn, then cools down (2
 * own turns for tiers 1–2, 3 for tiers 3 and up, unless the card names its own). Hard crowd control (`hardCC`: a stun,
 * a silence, a disarm, a root, a curse on an enemy) has 2 uses a match instead.
 *
 * Slot (shop tab) and tier are Deadlock's, read off the shop list of the
 * deadlock-api (`api.deadlock-api.com/v1/assets/items/by-type/upgrade`,
 * 2026-11-05; the same as deadlock.wiki/Items); `upgradesFrom` is the component
 * Deadlock builds the item from, where both are in this catalogue (the API's
 * `component_items`). The price is the tier's (`PRICE`, engine/constants.ts).
 *
 * Effects keep their wording: "your Active" is the player's Active, whoever
 * wears the item. The item's bearer is the caster — its gear reacts to the
 * damage, and the FX leave from it.
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
  // ----- Tier 1 -----
  { id: 'healing_rite',     name: 'Healing Rite',     type: 'spell', rarity: 1, slot: 'vitality', tier: 1, abilities: ['eff_healing_rite'],     text: 'Heal an ally for 2.' },
  { id: 'rusted_barrel',    name: 'Rusted Barrel',    type: 'spell', rarity: 1, slot: 'spirit',   tier: 1, abilities: ['eff_rusted_barrel'],    text: 'Apply Bullet Power −2 on enemy Active for 2 turns.' },
  { id: 'golden_goose_egg', name: 'Golden Goose Egg', type: 'spell', rarity: 1, slot: 'spirit',   tier: 1, abilities: ['eff_golden_goose_egg'], text: 'Gain 2 souls. Your Active gains +1 max HP.' },
  { id: 'grit',             name: 'Grit',             type: 'spell', rarity: 1, slot: 'vitality', tier: 1, abilities: ['eff_grit'],             text: 'Your Active gains Shield 2.' },

  // ----- Tier 2 -----
  { id: 'cold_front',     name: 'Cold Front',     type: 'spell', rarity: 2, slot: 'spirit',   tier: 2, abilities: ['eff_cold_front'],     text: 'Deal {sp:2} spirit damage to enemy Active.' },
  { id: 'slowing_hex',    name: 'Slowing Hex',    type: 'spell', rarity: 2, slot: 'spirit',   tier: 2, hardCC: true, abilities: ['eff_slowing_hex'], text: 'Silence any enemy for 1 turn.' },
  { id: 'spirit_sap',     name: 'Spirit Sap',     type: 'spell', rarity: 2, slot: 'spirit',   tier: 2, abilities: ['eff_spirit_sap'],     text: 'Apply Spirit Resist −2 to any enemy for 2 turns.' },
  { id: 'guardian_ward',  name: 'Guardian Ward',  type: 'spell', rarity: 2, slot: 'vitality', tier: 2, upgradesFrom: 'grit', abilities: ['eff_guardian_ward'], text: 'Grant an ally Shield 3.' },
  { id: 'return_fire',    name: 'Return Fire',    type: 'spell', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_return_fire'],    text: 'Your Active gains Return Fire 2 for 2 turns: an enemy attack that hits it costs the attacker 2 bullet damage.' },
  { id: 'fleetfoot',      name: 'Fleetfoot',      type: 'spell', rarity: 2, slot: 'weapon',   tier: 2, abilities: ['eff_fleetfoot'],      text: 'Your Active gains Extra Attack 1 this turn, and its Retreat this turn is free.' },
  { id: 'split_shot',     name: 'Split Shot',     type: 'spell', rarity: 2, slot: 'weapon',   tier: 2, abilities: ['eff_split_shot'],     text: 'Your Active gains Ricochet 1 this turn.' },
  { id: 'restorative_locket', name: 'Restorative Locket', type: 'spell', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_restorative_locket'], text: 'Heal an ally 1, plus 1 per enemy hero with an ability on cooldown. Its Retreat this turn is free.' },
  // The draw engine (docs/deck-plan.md): Deadlock's three Cooldown items — a
  // passive there — are actives here by Patrick's call, each a draw and a
  // discard from anywhere in the hand. Each step doubles the price and the
  // cards kept (+1, +2, +4), so a soul buys the same at every tier. Each waits
  // 2 own turns after use at every tier. improved_cooldown keeps the item's old
  // id so saved builds and decks still load: it is Compress Cooldown.
  { id: 'improved_cooldown', name: 'Compress Cooldown', type: 'spell', rarity: 2, slot: 'spirit', tier: 2, cooldown: 2, abilities: ['eff_compress_cooldown'], text: 'Draw 2 cards, then discard 1 card from your hand.' },

  // ----- Tier 3 -----
  { id: 'decay',           name: 'Decay',           type: 'spell', rarity: 3, slot: 'spirit',   tier: 3, abilities: ['eff_decay'],           text: 'Apply Bleed 3 to enemy Active for 2 turns.' },
  { id: 'disarming_hex',   name: 'Disarming Hex',   type: 'spell', rarity: 3, slot: 'spirit',   tier: 3, upgradesFrom: 'rusted_barrel', hardCC: true, abilities: ['eff_disarming_hex'], text: 'Disarm any enemy for 2 turns.' },
  { id: 'knockdown',       name: 'Knockdown',       type: 'spell', rarity: 3, slot: 'spirit',   tier: 3, hardCC: true, abilities: ['eff_knockdown'], text: 'Stun enemy Active for 1 turn.' },
  { id: 'metal_skin',      name: 'Metal Skin',      type: 'spell', rarity: 3, slot: 'vitality', tier: 3, abilities: ['eff_cast_metal_skin'], text: 'Grant ally Bullet Resist 5 for 2 turns.' },
  // Three ids keep an item's old name so saved builds still load: debuff_remover
  // is Dispel Magic, silence_glyph is Silence Wave, curse is Cursed Relic.
  { id: 'debuff_remover',  name: 'Dispel Magic',    type: 'spell', rarity: 3, slot: 'vitality', tier: 3, abilities: ['eff_debuff_remover'],  text: "Cleanse an ally's debuffs and grant Shield 4. If any were removed, heal it 4." },
  { id: 'silence_glyph',   name: 'Silence Wave',    type: 'spell', rarity: 3, slot: 'spirit',   tier: 3, hardCC: true, abilities: ['eff_silence_glyph'], text: 'Deal {sp:2} spirit damage to enemy Active and Silence it for 2 turns.' },
  { id: 'warp_stone',      name: 'Warp Stone',      type: 'spell', rarity: 3, slot: 'vitality', tier: 3, abilities: ['eff_warp_stone'],      text: 'A bench ally swaps into your Active slot and gains Bullet Resist 3 for 2 turns.' },
  // Blood Tribute's price is paid in blood as well: 3 HP off your Active.
  { id: 'blood_tribute',   name: 'Blood Tribute',   type: 'spell', rarity: 3, slot: 'weapon',   tier: 3, abilities: ['eff_blood_tribute'],   text: 'Your Active pays 3 HP (never below 1) and gains Extra Attack 1 and +1 Bullet Power this turn.' },
  { id: 'healing_nova',    name: 'Healing Nova',    type: 'spell', rarity: 3, slot: 'vitality', tier: 3, upgradesFrom: 'healing_rite', abilities: ['eff_healing_nova'], text: 'Heal all allies 5.' },
  { id: 'rescue_beam',     name: 'Rescue Beam',     type: 'spell', rarity: 3, slot: 'vitality', tier: 3, upgradesFrom: 'healing_rite', abilities: ['eff_rescue_beam'], text: 'A bench ally steps into your Active slot; the hero it rescues heals 4 on the bench.' },
  // Fury Trance silences your own Active, not an enemy: a cooldown, not charges.
  { id: 'fury_trance',     name: 'Fury Trance',     type: 'spell', rarity: 3, slot: 'vitality', tier: 3, upgradesFrom: 'bullet_lifesteal', abilities: ['eff_fury_trance'], text: 'Your Active gains Extra Attack 1 this turn and Spirit Resist 3 for 2 turns, but is Silenced for 2 turns.' },
  { id: 'alchemical_fire', name: 'Alchemical Fire', type: 'spell', rarity: 3, slot: 'weapon',   tier: 3, abilities: ['eff_alchemical_fire'], text: 'Deal {sp:1} spirit damage to every enemy and apply Bullet Resist −2 to them for 2 turns.' },
  { id: 'heroic_aura',     name: 'Heroic Aura',     type: 'spell', rarity: 3, slot: 'weapon',   tier: 3, abilities: ['eff_heroic_aura'],     text: 'All allies gain +2 Bullet Power and Bullet Resist 1 for 2 turns.' },
  { id: 'shadow_weave',    name: 'Shadow Weave',    type: 'spell', rarity: 3, slot: 'weapon',   tier: 3, upgradesFrom: 'sprint_boots', abilities: ['eff_shadow_weave'], text: 'Your Active gains Dome for 1 turn and +2 Bullet Power for 2 turns.' },
  { id: 'majestic_leap',   name: 'Majestic Leap',   type: 'spell', rarity: 3, slot: 'vitality', tier: 3, abilities: ['eff_majestic_leap'],   text: 'Your Active retreats free; the bench ally you pick steps in.' },
  { id: 'superior_cooldown', name: 'Superior Cooldown', type: 'spell', rarity: 3, slot: 'spirit', tier: 3, upgradesFrom: 'improved_cooldown', cooldown: 2, abilities: ['eff_superior_cooldown'], text: 'Draw 4 cards, then discard 2 cards from your hand.' },

  // ----- Tier 4 -----
  { id: 'echo_shard',     name: 'Echo Shard',     type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, abilities: ['eff_echo_shard'],       text: 'Your Active hero uses their skill again this turn.' },
  { id: 'unstoppable',    name: 'Unstoppable',    type: 'spell', rarity: 3, slot: 'vitality', tier: 4, upgradesFrom: 'debuff_reducer', abilities: ['eff_unstoppable_cast'], text: 'Your Active hero gains Unstoppable for 1 turn.' },
  { id: 'curse',          name: 'Cursed Relic',   type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, hardCC: true, abilities: ['eff_curse'], text: 'Silence and Disarm one enemy hero for 3 turns: no skill, no attack.' },
  { id: 'divine_barrier', name: 'Divine Barrier', type: 'spell', rarity: 3, slot: 'vitality', tier: 4, upgradesFrom: 'guardian_ward', abilities: ['eff_divine_barrier'], text: "Cleanse an ally's debuffs except Stun and grant it Shield 4." },
  { id: 'ethereal_shift', name: 'Ethereal Shift', type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, abilities: ['eff_ethereal_shift'],   text: 'An ally gains Dome for 1 turn and +1 Spirit Power for 2 turns.' },
  { id: 'phantom_strike', name: 'Phantom Strike', type: 'spell', rarity: 3, slot: 'vitality', tier: 4, hardCC: true, abilities: ['eff_phantom_strike'], text: 'Drag an enemy bench hero into their Active slot, deal {sp:2} spirit damage to it and Disarm it for 1 turn.' },
  { id: 'vortex_web',     name: 'Vortex Web',     type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, upgradesFrom: 'slowing_hex', hardCC: true, abilities: ['eff_vortex_web'], text: 'Deal {sp:2} spirit damage to every enemy. They are Rooted for 2 turns.' },
  { id: 'refresher',      name: 'Refresher',      type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, abilities: ['eff_refresher'],        text: "Your Active's skills, ultimate and active items come off cooldown." },
  { id: 'colossus',       name: 'Colossus',       type: 'spell', rarity: 3, slot: 'vitality', tier: 4, upgradesFrom: 'extra_health', hardCC: true, abilities: ['eff_colossus_cast'], text: 'Your Active gains Bullet Resist 4 and Spirit Resist 4 for 2 turns. The enemy Active is Rooted for 1 turn.' },
  { id: 'infuser',        name: 'Infuser',        type: 'spell', rarity: 3, slot: 'vitality', tier: 4, upgradesFrom: 'spirit_lifesteal', abilities: ['eff_infuser'], text: 'Your Active gains +3 Spirit Power for 2 turns and heals 3.' },
  { id: 'arctic_blast',   name: 'Arctic Blast',   type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, upgradesFrom: 'cold_front', hardCC: true, abilities: ['eff_arctic_blast'], text: 'Deal {sp:2} spirit damage to every enemy. Stun the enemy Active for 1 turn.' },
  // ----- Added 2026-11-05: the full shop (docs/card-design.md) -----
  { id: 'capacitor',      name: 'Capacitor',      type: 'spell', rarity: 3, slot: 'weapon',   tier: 4, upgradesFrom: 'tesla_bullets', hardCC: true, abilities: ['eff_capacitor'], text: 'Deal {sp:2} spirit damage to the enemy Active and 2 to each enemy bench hero. Root them all for 1 turn.' },
  { id: 'vampiric_burst', name: 'Vampiric Burst', type: 'spell', rarity: 3, slot: 'vitality', tier: 4, upgradesFrom: 'bullet_lifesteal', abilities: ['eff_vampiric_burst'], text: 'Your Active heals 4, gains Extra Attack 2 this turn and +3 Bullet Power for 2 turns.' },
  { id: 'focus_lens',     name: 'Focus Lens',     type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, upgradesFrom: 'spirit_sap', hardCC: true, abilities: ['eff_focus_lens'], text: 'Silence any enemy for 2 turns. It gets Spirit Resist −2 for 2 turns and a Reverb of 2.' },
  { id: 'transcendent_cooldown', name: 'Transcendent Cooldown', type: 'spell', rarity: 4, slot: 'spirit', tier: 4, upgradesFrom: 'superior_cooldown', cooldown: 2, abilities: ['eff_transcendent_cooldown'], text: 'Draw 8 cards, then discard 4 cards from your hand.' },
  { id: 'scourge',        name: 'Scourge',        type: 'spell', rarity: 3, slot: 'spirit',   tier: 4, abilities: ['eff_scourge'], text: 'An ally is cleansed of its debuffs and gains Spirit Resist 3 for 2 turns. Every enemy takes {sp:2} spirit damage.' },

  // ----- Tier 5 (added 2026-11-05: Deadlock's 9,999-soul items, docs/card-design.md) -----
  // Nullification Burst and Mystical Piano root or stun the whole enemy side:
  // hard crowd control, two charges a match. Prism Blast cools down 3 own turns.
  { id: 'nullification_burst', name: 'Nullification Burst', type: 'spell', rarity: 4, slot: 'vitality', tier: 5, hardCC: true, abilities: ['eff_nullification_burst'], text: 'Every enemy hero loses its buffs and takes {sp:1} spirit damage. They cannot be healed and are Rooted for 2 turns.' },
  { id: 'mystical_piano',      name: 'Mystical Piano',      type: 'spell', rarity: 4, slot: 'spirit',   tier: 5, hardCC: true, abilities: ['eff_mystical_piano'], text: 'Stun every enemy hero for 2 turns and Root them for 2 turns.' },
  { id: 'prism_blast',         name: 'Prism Blast',         type: 'spell', rarity: 4, slot: 'spirit',   tier: 5, abilities: ['eff_prism_blast'], text: 'Your Active gains Unstoppable for 1 turn. Every enemy takes {sp:7} spirit damage.' },
];

export const SPELLS_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<string, SpellCard>;
