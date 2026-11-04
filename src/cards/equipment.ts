import type { EquipmentCard } from '@/engine/types';

/**
 * Equipment = passive items. Every equipment card is a canon Deadlock PASSIVE
 * item, and every passive item that becomes a card is equipment — see
 * docs/card-design.md. Once attached, they grant an ongoing effect
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
  { id: 'mystic_burst',         name: 'Mystic Burst',         type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_mystic_burst_proc'],        text: 'When the bearer uses a skill, deal 1 spirit damage to the enemy active.' },

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


  // ----- Cooldown family → card draw (Improved / Superior / Transcendent Cooldown) -----
  // Cooldown reduction = take more actions = more options. Translated as pure
  // card advantage: each time the bearer uses a skill, draw a card, until the
  // item's charges run out and it breaks. No stats — the draw IS the payoff,
  // and the equipment slot it occupies is the cost. Tiers escalate the charge
  // count (2 → 3 → 4). The T4 piece lives in the premium block below.
  // improved_cooldown keeps the item's old id so saved decks still load; the
  // item is Compress Cooldown now.
  { id: 'improved_cooldown', name: 'Compress Cooldown', type: 'equipment', rarity: 2, tier: 2, cost: 3, charges: 2, abilities: ['eff_cooldown_draw'], text: "When the bearer uses a skill, draw a card. 2 charges, then it breaks." },
  { id: 'superior_cooldown', name: 'Superior Cooldown', type: 'equipment', rarity: 3, tier: 3, cost: 5, charges: 4, abilities: ['eff_cooldown_draw'], text: "When the bearer uses a skill, draw a card. 4 charges, then it breaks." },

  // ----- Spirit burst line (canon Mystic Burst T1 → Tankbuster T3) -----
  // Mystic Burst (T1 block above) pings the enemy active on every skill. Tankbuster
  // (once Improved Burst — the id keeps the old name) pays off big hits instead:
  // 3+ damage from the bearer's skill / spell / ult adds 2 pure, past any resist.
  { id: 'improved_burst', name: 'Tankbuster', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_improved_burst_proc'], text: "When the bearer's skill / spell / ult deals 2 or more damage to an enemy, it takes 2 more pure damage." },

  // ----- Lifesteal family (canon Bullet/Spirit Lifesteal → Leech) -----
  // T2 escalations of the T1 heal-on-damage procs (Restorative Shot heals on
  // attack; Mystic Regeneration heals on skill damage) — both up to heal 2.
  { id: 'bullet_lifesteal', name: 'Bullet Lifesteal', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_lifesteal'], text: 'After bearer attacks: heal 2.' },
  { id: 'spirit_lifesteal', name: 'Spirit Lifesteal', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_spirit_lifesteal'], text: "After bearer's skill / spell / ult damages an enemy: heal 2." },

  // ----- Cast-payoff items (functionality tied to skill / ult activation) -----
  // Surge of Power: after a skill, +2 Bullet Power through the bearer's next turn.
  { id: 'surge_of_power', name: 'Surge of Power', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_surge_of_power'], text: 'After the bearer uses a skill: +2 Bullet Power until the end of your next turn.' },
  // Burst Fire (canon T3 Weapon): fires a burst of extra shots — grants Extra
  // Attack 1 each turn (stacks with other Extra Attack sources).
  { id: 'burst_fire', name: 'Burst Fire', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_burst_fire'], text: 'The bearer gains Extra Attack 1 each turn. (Stacks.)' },

  // ----- T2 tech (canon Suppressor T2 Spirit, Reactive Barrier T2 Vitality) -----
  { id: 'suppressor',       name: 'Suppressor',       type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_suppressor'],       text: "When the bearer's skill / spell / ult damages an enemy: Bullet Power −1 for 2 turns." },
  { id: 'reactive_barrier', name: 'Reactive Barrier', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_reactive_barrier'], text: 'When the bearer is Stunned / Silenced / Disarmed / Slept: gain Shield 3.' },

  // ----- Passive items that were spells, and new passives (docs/card-design.md) -----
  { id: 'healbane',      name: 'Healbane',      type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_healbane'], text: "When the bearer's skill / spell / ult damages an enemy, it cannot be healed for 2 turns." },
  { id: 'active_reload', name: 'Active Reload', type: 'equipment', rarity: 2, tier: 2, cost: 3, bonus: { atk: 1 }, abilities: ['eff_active_reload'], text: '+1 Bullet Power. After bearer attacks: heal 1.' },
  { id: 'long_range',    name: 'Long Range',    type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_long_range'], text: "The bearer's attacks can target any enemy hero." },
  { id: 'fortitude',     name: 'Fortitude',     type: 'equipment', rarity: 3, tier: 3, cost: 5, bonus: { hp: 2 }, abilities: ['eff_fortitude'], text: '+2 HP. At the start of your turn: heal 2.' },

  // ----- T3 weapon offense (canon Toxic / Tesla Bullets, both T3 Weapon) -----
  { id: 'toxic_bullets', name: 'Toxic Bullets', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_toxic_bullets'], text: "Bearer's attacks apply Bleed 1 (stacks, max 3) for 2 turns." },
  { id: 'tesla_bullets', name: 'Tesla Bullets', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_tesla_bullets'], text: "After bearer attacks: chain 1 bullet damage to an enemy bench hero." },

  // ----- T3 (cost 5-6) — passive resists (canon T3 Vitality) -----
  // In Deadlock both add more resist below 50% health; here, 2 more off each hit.
  { id: 'bullet_resilience', name: 'Bullet Resilience', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_bullet_resist'], text: 'Bullet Resist 2. While below half HP, take 2 less bullet damage.' },
  { id: 'spirit_resilience', name: 'Spirit Resilience', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_spirit_resist'], text: 'Spirit Resist 2. While below half HP, take 2 less spirit damage.' },

  // ----- T3 premium (offense / scaling / tier-up resists) -----
  { id: 'berserker',          name: 'Berserker',          type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_berserker'],          text: 'When the bearer takes bullet damage: gain +1 Bullet Power (max +4). Lost on death.' },
  { id: 'superior_duration',  name: 'Superior Duration',  type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_superior_duration'],   text: "The bearer's own buffs last 1 turn longer." },

  // ----- T4 (cost 7+) — premium items (canon T4) -----
  { id: 'transcendent_cooldown', name: 'Transcendent Cooldown', type: 'equipment', rarity: 4, tier: 4, cost: 7, charges: 6, abilities: ['eff_cooldown_draw'], text: "When the bearer uses a skill, draw a card. 6 charges, then it breaks." },
  // Crippling Headshot (canon T4 Weapon): +1 Bullet Power so it pulls its weight
  // at 7 souls (it trailed the other T4 weapons in the sims).
  { id: 'crippling_headshot', name: 'Crippling Headshot', type: 'equipment', rarity: 4, tier: 4, cost: 7, bonus: { atk: 1 }, abilities: ['eff_crippling_headshot'], text: "+1 Bullet Power. Bearer's attacks apply Bullet Resist −2 and Spirit Resist −2 for 2 turns." },
  // Leech = canon fusion of Bullet Lifesteal + Spirit Lifesteal; lifesteals off
  // BOTH bullet attacks and skill damage by running both T2 abilities.
  { id: 'leech', name: 'Leech', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_bullet_lifesteal', 'eff_spirit_lifesteal'], text: "After bearer attacks: heal 2. After bearer's skill / spell / ult damages an enemy: heal 2." },
  // Diviner's Kevlar (T4): shield payoff on ultimate cast.
  { id: 'diviners_kevlar', name: "Diviner's Kevlar", type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_diviners_kevlar'], text: 'After the bearer casts their ultimate: gain Shield 6 and +2 Spirit Power for 2 turns.' },
  // Mystic Reverb (T4): delayed echo — half the skill's damage hits the target again next turn.
  { id: 'mystic_reverb', name: 'Mystic Reverb', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_mystic_reverb'], text: "When the bearer's skill damages an enemy: at that enemy's next turn, it takes spirit damage equal to half the damage dealt." },
  // Escalating Exposure (T4): skill damage stacks Spirit Resist − on the target.
  { id: 'escalating_exposure', name: 'Escalating Exposure', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_escalating_exposure'], text: "When the bearer's skill / spell / ult damages an enemy: apply Spirit Resist −1 (stacks, max 3) for 2 turns." },
  // Frenzy (T4): below half HP, +3 Bullet Power (combat) + heal 2 on attack.
  { id: 'frenzy', name: 'Frenzy', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_frenzy'], text: 'While the bearer is below half HP: +3 Bullet Power, and heal 2 after attacking.' },
  // Inhibitor (T4): attacks suppress both offense types.
  { id: 'inhibitor', name: 'Inhibitor', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_inhibitor'], text: "Bearer's attacks apply Bullet Power −1 and Spirit Power −1 for 2 turns." },
  // Siphon Bullets (T4): attacks temporarily steal 1 max HP (reverts after 2 turns).
  { id: 'siphon_bullets', name: 'Siphon Bullets', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_siphon_bullets'], text: "After bearer attacks: steal 1 max HP from the target for 2 turns." },
  // Ricochet (canon T4 Weapon): bullets ricochet to nearby enemies — the keyword,
  // Ricochet 2 while worn. Every swing that lands bounces to all OTHER enemy
  // heroes with its on-hit debuffs, so it scales with Extra Attack and with the
  // bearer's debuff gear.
  { id: 'ricochet', name: 'Ricochet', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_ricochet'], text: "Ricochet 2: after the bearer's attack lands, every other enemy hero takes 2 bullet damage and the attack's on-hit debuffs." },
  { id: 'healing_tempo',  name: 'Healing Tempo',  type: 'equipment', rarity: 4, tier: 4, cost: 7, bonus: { atk: 2 }, abilities: ['eff_healing_tempo'], text: '+2 Bullet Power. Healing Boost 4.' },
  { id: 'boundless_spirit', name: 'Boundless Spirit', type: 'equipment', rarity: 4, tier: 4, cost: 8, bonus: { spirit: 5, hp: 3 }, text: '+5 Spirit Power. +3 HP.' },
  { id: 'glass_cannon',   name: 'Glass Cannon',   type: 'equipment', rarity: 4, tier: 4, cost: 8, bonus: { atk: 6, hp: -1 }, text: '+6 Bullet Power. −1 max HP.' },

  // ----- More canon passive items (docs/card-design.md, added 2026-10-30) -----
  { id: 'headshot_booster',     name: 'Headshot Booster',     type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_headshot_booster'],     text: "Bearer's attacks deal +2 to an enemy at full HP." },
  { id: 'spirit_strike',        name: 'Spirit Strike',        type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_spirit_strike'],        text: "Bearer's attacks apply Spirit Resist −1 for 2 turns." },
  { id: 'mystic_vulnerability', name: 'Mystic Vulnerability', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_mystic_vulnerability'], text: "When the bearer's skill / spell / ult damages an enemy: Spirit Resist −1 for 2 turns." },
  { id: 'mystic_slow',          name: 'Mystic Slow',          type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_mystic_slow'],          text: "When the bearer's skill / spell / ult damages an enemy: it is Rooted for 1 turn." },
  { id: 'slowing_bullets',      name: 'Slowing Bullets',      type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_slowing_bullets'],      text: "Bearer's attacks Root the target for 1 turn." },
  { id: 'debuff_reducer',       name: 'Debuff Reducer',       type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_debuff_reducer'],       text: 'Debuffs on the bearer last 1 turn less (never under 1).' },
  { id: 'spirit_snatch',        name: 'Spirit Snatch',        type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_spirit_snatch'],        text: "When the bearer's skill / spell / ult damages an enemy: it gets Spirit Power −1 and the bearer +1 Spirit Power, both for 2 turns." },
  { id: 'spiritual_overflow',   name: 'Spiritual Overflow',   type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_spiritual_overflow'],   text: 'After bearer attacks: +1 Spirit Power for 2 turns (up to +3) and heal 1.' },

  // ----- Mobility (docs/card-design.md, added 2026-11-03) -----
  // A Retreat is 1 soul (RETREAT_COST), one a turn, before the attack; these make it cheap.
  { id: 'sprint_boots',   name: 'Sprint Boots',   type: 'equipment', rarity: 1, tier: 1, cost: 2, abilities: ['eff_sprint_boots'],   text: "Bearer's Retreat costs 1 less." },
  { id: 'enduring_speed', name: 'Enduring Speed', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_enduring_speed'], text: "Bearer's Retreat costs 1 less, and it cannot be Rooted." },
  { id: 'kinetic_dash',   name: 'Kinetic Dash',   type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_kinetic_dash'],   text: 'When the bearer steps into the Active slot by a Retreat or a swap: +1 Bullet Power this turn.' },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, EquipmentCard>;
