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

  // ----- Cooldown family → card draw (Improved / Superior / Transcendent Cooldown) -----
  // Cooldown reduction = take more actions = more options. Translated as pure
  // card advantage: each time the bearer uses a skill, draw a card, until the
  // item's charges run out and it breaks. No stats — the draw IS the payoff,
  // and the equipment slot it occupies is the cost. Tiers escalate the charge
  // count (2 → 3 → 4). The T4 piece lives in the premium block below.
  { id: 'improved_cooldown', name: 'Improved Cooldown', type: 'equipment', rarity: 2, tier: 2, cost: 3, charges: 2, abilities: ['eff_cooldown_draw'], text: "When the bearer uses a skill, draw a card. 2 charges, then it breaks." },
  { id: 'superior_cooldown', name: 'Superior Cooldown', type: 'equipment', rarity: 3, tier: 3, cost: 5, charges: 3, abilities: ['eff_cooldown_draw'], text: "When the bearer uses a skill, draw a card. 3 charges, then it breaks." },

  // ----- Mystic Burst family → spirit burst on skill use (canon Mystic Burst) -----
  // The cast-payoff partner to the cooldown line: every skill the bearer uses
  // pings the enemy active with burst spirit damage. Flat magnitude (no Spirit
  // scaling) by tier: 2 / 3. No stats — the burst is the payoff, the slot the cost.
  { id: 'mystic_burst',   name: 'Mystic Burst',   type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_mystic_burst_proc'],   text: 'When the bearer uses a skill, deal 1 spirit damage to the enemy active.' },
  { id: 'improved_burst', name: 'Improved Burst', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_improved_burst_proc'], text: 'When the bearer uses a skill, deal 2 spirit damage to the enemy active.' },

  // ----- Lifesteal family (canon Bullet/Spirit Lifesteal → Leech) -----
  // T2 escalations of the T1 heal-on-damage procs (Restorative Shot heals on
  // attack; Mystic Regeneration heals on skill damage) — both up to heal 2.
  { id: 'bullet_lifesteal', name: 'Bullet Lifesteal', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_bullet_lifesteal'], text: 'After bearer attacks: heal 2.' },
  { id: 'spirit_lifesteal', name: 'Spirit Lifesteal', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_spirit_lifesteal'], text: "After bearer's skill / spell / ult damages an enemy: heal 2." },

  // ----- Cast-payoff items (functionality tied to skill / ult activation) -----
  // Quicksilver Reload (canon "casting reloads your weapon"): after a skill,
  // the bearer gets a bonus half-power basic attack this turn.
  { id: 'quicksilver_reload', name: 'Quicksilver Reload', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_quicksilver_reload'], text: 'After the bearer uses a skill, they make a bonus attack at half Bullet Power this turn.' },
  // Surge of Power: after a skill, +2 Bullet Power for the turn.
  { id: 'surge_of_power', name: 'Surge of Power', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_surge_of_power'], text: 'After the bearer uses a skill: +2 Bullet Power this turn.' },

  // ----- T2 tech (canon Suppressor T2 Spirit, Reactive Barrier T2 Vitality) -----
  { id: 'suppressor',       name: 'Suppressor',       type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_suppressor'],       text: "When the bearer's skill / spell / ult damages an enemy: Bullet Power −1 for 2 turns." },
  { id: 'reactive_barrier', name: 'Reactive Barrier', type: 'equipment', rarity: 2, tier: 2, cost: 3, abilities: ['eff_reactive_barrier'], text: 'When the bearer is Stunned / Silenced / Disarmed / Slept: gain Shield 3.' },

  // ----- T3 weapon offense (canon Toxic / Tesla Bullets, both T3 Weapon) -----
  { id: 'toxic_bullets', name: 'Toxic Bullets', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_toxic_bullets'], text: "Bearer's attacks apply Bleed 1 (stacks, max 3) for 2 turns." },
  { id: 'tesla_bullets', name: 'Tesla Bullets', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_tesla_bullets'], text: "After bearer attacks: chain 1 bullet damage to an enemy bench hero." },

  // ----- T3 (cost 5-6) — passive resists (canon T3 Vitality) -----
  { id: 'bullet_resilience', name: 'Bullet Resilience', type: 'equipment', rarity: 3, tier: 3, cost: 6, abilities: ['eff_bullet_resist'], text: 'Bullet Resist 3.' },

  // ----- T3 premium (offense / scaling / tier-up resists) -----
  { id: 'crippling_headshot', name: 'Crippling Headshot', type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_crippling_headshot'], text: "Bearer's attacks apply Bullet Resist −1 and Spirit Resist −1 for 2 turns." },
  { id: 'berserker',          name: 'Berserker',          type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: ['eff_berserker'],          text: 'When the bearer takes bullet damage: gain +1 Bullet Power (max +4). Lost on death.' },
  { id: 'colossus',           name: 'Colossus',           type: 'equipment', rarity: 3, tier: 3, cost: 6, bonus: { hp: 5 }, abilities: ['eff_colossus'], text: '+5 HP. Bullet Resist 2.' },
  { id: 'superior_duration',  name: 'Superior Duration',  type: 'equipment', rarity: 3, tier: 3, cost: 5, abilities: [],                          text: "The bearer's own buffs last 1 turn longer." },
  // Improved Armor moved to T4 (BR/SR 5) so it doesn't strictly obsolete the
  // T3 Bullet Resilience (BR3 @6); now a clean premium resist tier-up.
  { id: 'improved_bullet_armor', name: 'Improved Bullet Armor', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_improved_bullet_armor'], text: 'Bullet Resist 5.' },
  { id: 'improved_spirit_armor', name: 'Improved Spirit Armor', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_improved_spirit_armor'], text: 'Spirit Resist 5.' },

  // ----- T4 (cost 7+) — premium items (canon T4) -----
  { id: 'transcendent_cooldown', name: 'Transcendent Cooldown', type: 'equipment', rarity: 4, tier: 4, cost: 7, charges: 4, abilities: ['eff_cooldown_draw'], text: "When the bearer uses a skill, draw a card. 4 charges, then it breaks." },
  // Leech = canon fusion of Bullet Lifesteal + Spirit Lifesteal; lifesteals off
  // BOTH bullet attacks and skill damage by running both T2 abilities.
  { id: 'leech', name: 'Leech', type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_bullet_lifesteal', 'eff_spirit_lifesteal'], text: "After bearer attacks: heal 2. After bearer's skill / spell / ult damages an enemy: heal 2." },
  // Diviner's Kevlar (T4): shield payoff on ultimate cast.
  { id: 'diviners_kevlar', name: "Diviner's Kevlar", type: 'equipment', rarity: 4, tier: 4, cost: 7, abilities: ['eff_diviners_kevlar'], text: 'After the bearer casts their ultimate: gain Shield 4.' },
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
  { id: 'healing_tempo',  name: 'Healing Tempo',  type: 'equipment', rarity: 4, tier: 4, cost: 7, bonus: { atk: 2 }, abilities: ['eff_healing_tempo'], text: '+2 Bullet Power. Healing Boost 4.' },
  { id: 'boundless_spirit', name: 'Boundless Spirit', type: 'equipment', rarity: 4, tier: 4, cost: 8, bonus: { spirit: 5, hp: 3 }, text: '+5 Spirit Power. +3 HP.' },
  { id: 'glass_cannon',   name: 'Glass Cannon',   type: 'equipment', rarity: 4, tier: 4, cost: 8, bonus: { atk: 6, hp: -1 }, text: '+6 Bullet Power. −1 max HP.' },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, EquipmentCard>;
