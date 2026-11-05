import type { EquipmentCard } from '@/engine/types';

/**
 * Equipment = PASSIVE items. Every equipment card is a canon Deadlock passive
 * item, and every passive item that becomes a card is equipment — see
 * docs/card-design.md. A hero buys one in the shop and it stays on through
 * death: its stat `bonus` sits on the hero's modifiers while worn, and its
 * abilities are triggers (procs) and pure hooks read off what the hero wears.
 *
 * Slot (shop tab) and tier are Deadlock's, read off the shop list of the
 * deadlock-api (`api.deadlock-api.com/v1/assets/items/by-type/upgrade`,
 * 2026-11-05; the same as deadlock.wiki/Items); `upgradesFrom` is the component
 * Deadlock builds the item from, where both are in this catalogue (the API's
 * `component_items`). The price is the tier's (`PRICE`, engine/constants.ts).
 *
 * Text formatting conventions: status keywords (Bullet Resist, Spirit Power,
 * Shield, …) auto-bold via `RuleText`.
 */
export const EQUIPMENT: EquipmentCard[] = [
  // ----- T1 — stat sticks + lifesteal -----
  { id: 'extended_magazine',    name: 'Extended Magazine',    type: 'equipment', rarity: 1, slot: 'weapon', tier: 1, bonus: { atk: 1 },    text: '+1 Bullet Power.' },
  { id: 'extra_spirit',         name: 'Extra Spirit',         type: 'equipment', rarity: 1, slot: 'spirit', tier: 1, bonus: { spirit: 1 }, text: '+1 Spirit Power.' },
  { id: 'extra_regen',          name: 'Extra Regen',          type: 'equipment', rarity: 1, slot: 'vitality', tier: 1, abilities: ['eff_extra_regen_proc'], text: 'At the start of your turn: heal 1.' },
  { id: 'extra_health',         name: 'Extra Health',         type: 'equipment', rarity: 1, slot: 'vitality', tier: 1, bonus: { hp: 2 },     text: '+2 HP.' },
  { id: 'restorative_shot',     name: 'Restorative Shot',     type: 'equipment', rarity: 1, slot: 'weapon', tier: 1, abilities: ['eff_restorative_shot_proc'],     text: 'After bearer attacks: heal 1.' },
  { id: 'mystic_regeneration',  name: 'Mystic Regeneration',  type: 'equipment', rarity: 1, slot: 'spirit', tier: 1, abilities: ['eff_mystic_regeneration_proc'], text: "After bearer's skill / spell / ult damages an enemy: heal 1." },
  { id: 'mystic_burst',         name: 'Mystic Burst',         type: 'equipment', rarity: 1, slot: 'spirit', tier: 1, abilities: ['eff_mystic_burst_proc'],        text: 'When the bearer uses a skill, deal 1 spirit damage to the enemy active.' },

  // ----- T2 — stat upgrades (canon T2 Weapon / Spirit) -----
  { id: 'titanic_magazine',  name: 'Titanic Magazine',  type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, upgradesFrom: 'extended_magazine', bonus: { atk: 2 },    text: '+2 Bullet Power.' },
  { id: 'improved_spirit',   name: 'Improved Spirit',   type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, upgradesFrom: 'extra_spirit', bonus: { spirit: 2 }, text: '+2 Spirit Power.' },

  // ----- T2 — healing boost (canon T2 Vitality) -----
  { id: 'healing_booster', name: 'Healing Booster', type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_healing_booster'], text: 'Healing Boost 2.' },

  // ----- T2 — reactive shields (canon T2 Vitality) -----
  { id: 'weapon_shielding', name: 'Weapon Shielding', type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, upgradesFrom: 'grit', abilities: ['eff_bullet_shield_proc'], text: 'When bearer takes bullet damage: gain Shield 2.' },
  { id: 'spirit_shielding', name: 'Spirit Shielding', type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, upgradesFrom: 'grit', abilities: ['eff_spirit_shield_proc'], text: 'When bearer takes spirit damage: gain Shield 2.' },

  // ----- T2 — resist shred (canon T2 Spirit) -----
  { id: 'bullet_resist_shredder', name: 'Bullet Resist Shredder', type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, abilities: ['eff_bullet_resist_shredder_proc'], text: "Bearer's attacks apply Bullet Resist −1 for 2 turns." },


  // ----- Cooldown family (Compress → Superior → Transcendent Cooldown) -----
  // Canon cooldown reduction: the bearer's ultimate (and, from Superior up,
  // its active items) waits fewer own turns after use, never under 1 (the
  // `cooldownCut` hook). Skills already come back every turn or two. The T4
  // piece lives in the premium block below. improved_cooldown keeps the item's
  // old id so saved builds still load; the item is Compress Cooldown now.
  { id: 'improved_cooldown', name: 'Compress Cooldown', type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, abilities: ['eff_compress_cooldown'], text: "The bearer's ultimate cools down 1 turn faster." },
  { id: 'superior_cooldown', name: 'Superior Cooldown', type: 'equipment', rarity: 3, slot: 'spirit', tier: 3, upgradesFrom: 'improved_cooldown', abilities: ['eff_superior_cooldown'], text: "The bearer's ultimate and active items cool down 1 turn faster." },

  // ----- Spirit burst line (canon Mystic Burst T1 → Tankbuster T3) -----
  // Mystic Burst (T1 block above) pings the enemy active on every skill. Tankbuster
  // (once Improved Burst — the id keeps the old name) pays off big hits instead:
  // 3+ damage from the bearer's skill / spell / ult adds 2 pure, past any resist.
  { id: 'improved_burst', name: 'Tankbuster', type: 'equipment', rarity: 3, slot: 'spirit', tier: 3, upgradesFrom: 'mystic_burst', abilities: ['eff_improved_burst_proc'], text: "When the bearer's skill / spell / ult deals 2 or more damage to an enemy, it takes 2 more pure damage." },

  // ----- Lifesteal family (canon Bullet/Spirit Lifesteal → Leech) -----
  // T2 escalations of the T1 heal-on-damage procs (Restorative Shot heals on
  // attack; Mystic Regeneration heals on skill damage) — both up to heal 2.
  { id: 'bullet_lifesteal', name: 'Bullet Lifesteal', type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_bullet_lifesteal'], text: 'After bearer attacks: heal 2.' },
  { id: 'spirit_lifesteal', name: 'Spirit Lifesteal', type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_spirit_lifesteal'], text: "After bearer's skill / spell / ult damages an enemy: heal 2." },

  // ----- Cast-payoff items (functionality tied to skill / ult activation) -----
  // Surge of Power: after a skill, +2 Bullet Power through the bearer's next turn.
  { id: 'surge_of_power', name: 'Surge of Power', type: 'equipment', rarity: 3, slot: 'spirit', tier: 3, upgradesFrom: 'extra_spirit', abilities: ['eff_surge_of_power'], text: 'After the bearer uses a skill: +2 Bullet Power until the end of your next turn.' },
  // Burst Fire (canon T3 Weapon): fires a burst of extra shots — grants Extra
  // Attack 1 each turn (stacks with other Extra Attack sources).
  { id: 'burst_fire', name: 'Burst Fire', type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, abilities: ['eff_burst_fire'], text: 'The bearer gains Extra Attack 1 each turn. (Stacks.)' },

  // ----- T2 tech (canon Suppressor T2 Spirit, Reactive Barrier T2 Vitality) -----
  { id: 'suppressor',       name: 'Suppressor',       type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, bonus: { spirit: 1 }, abilities: ['eff_suppressor'],       text: "+1 Spirit Power. When the bearer's skill / spell / ult damages an enemy: Bullet Power −1 for 2 turns." },
  { id: 'reactive_barrier', name: 'Reactive Barrier', type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, upgradesFrom: 'grit', abilities: ['eff_reactive_barrier'], text: 'When the bearer is Stunned / Silenced / Disarmed / Slept: gain Shield 4.' },

  // ----- Passive items that were spells, and new passives (docs/card-design.md) -----
  { id: 'healbane',      name: 'Healbane',      type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_healbane'], text: "When the bearer's skill / spell / ult damages an enemy, it cannot be healed for 2 turns." },
  { id: 'active_reload', name: 'Active Reload', type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, bonus: { atk: 1 }, abilities: ['eff_active_reload'], text: '+1 Bullet Power. After bearer attacks: heal 1.' },
  { id: 'long_range',    name: 'Long Range',    type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_long_range'], text: "The bearer's attacks can target any enemy hero." },
  { id: 'fortitude',     name: 'Fortitude',     type: 'equipment', rarity: 3, slot: 'vitality', tier: 3, upgradesFrom: 'extra_health', bonus: { hp: 2 }, abilities: ['eff_fortitude'], text: '+2 HP. At the start of your turn: heal 2.' },

  // ----- T3 weapon offense (canon Toxic / Tesla Bullets, both T3 Weapon) -----
  { id: 'toxic_bullets', name: 'Toxic Bullets', type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, abilities: ['eff_toxic_bullets'], text: "Bearer's attacks apply Bleed 2 (stacks, max 3) for 2 turns." },
  { id: 'tesla_bullets', name: 'Tesla Bullets', type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, abilities: ['eff_tesla_bullets'], text: "After bearer attacks: chain 2 bullet damage to an enemy bench hero." },

  // ----- T3 — passive resists (canon T3 Vitality) -----
  // In Deadlock both add more resist below 50% health; here, 2 more off each hit.
  { id: 'bullet_resilience', name: 'Bullet Resilience', type: 'equipment', rarity: 3, slot: 'vitality', tier: 3, abilities: ['eff_bullet_resist'], text: 'Bullet Resist 2. While below half HP, take 2 less bullet damage.' },
  { id: 'spirit_resilience', name: 'Spirit Resilience', type: 'equipment', rarity: 3, slot: 'vitality', tier: 3, abilities: ['eff_spirit_resist'], text: 'Spirit Resist 2. While below half HP, take 2 less spirit damage.' },

  // ----- T3 premium (offense / scaling / tier-up resists) -----
  { id: 'berserker',          name: 'Berserker',          type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, abilities: ['eff_berserker'],          text: 'When the bearer takes bullet damage: gain +2 Bullet Power (max +4). Lost on death.' },
  { id: 'superior_duration',  name: 'Superior Duration',  type: 'equipment', rarity: 3, slot: 'spirit', tier: 3, upgradesFrom: 'duration_extender', abilities: ['eff_superior_duration'],   text: "The bearer's own buffs last 2 turns longer." },

  // ----- T4 — premium items (canon T4) -----
  { id: 'transcendent_cooldown', name: 'Transcendent Cooldown', type: 'equipment', rarity: 4, slot: 'spirit', tier: 4, upgradesFrom: 'superior_cooldown', abilities: ['eff_transcendent_cooldown'], text: "The bearer's ultimate cools down 2 turns faster, and its active items 1 turn faster." },
  // Crippling Headshot (canon T4 Weapon, built from Weakening Headshot): +2
  // Bullet Power so it reaches its tier (docs/card-design.md, 2026-11-05).
  { id: 'crippling_headshot', name: 'Crippling Headshot', type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, upgradesFrom: 'weakening_headshot', bonus: { atk: 2 }, abilities: ['eff_crippling_headshot'], text: "+2 Bullet Power. Bearer's attacks apply Bullet Resist −2 and Spirit Resist −2 for 2 turns." },
  // Leech = canon fusion of Bullet Lifesteal + Spirit Lifesteal; lifesteals off
  // BOTH bullet attacks and skill damage by running both T2 abilities. Deadlock
  // builds it from both; an item names one component here: Bullet Lifesteal.
  // +3 HP: its canon health.
  { id: 'leech', name: 'Leech', type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, upgradesFrom: 'bullet_lifesteal', bonus: { hp: 3 }, abilities: ['eff_bullet_lifesteal', 'eff_spirit_lifesteal'], text: "+3 HP. After bearer attacks: heal 2. After bearer's skill / spell / ult damages an enemy: heal 2." },
  // Diviner's Kevlar (T4): shield payoff on ultimate cast.
  { id: 'diviners_kevlar', name: "Diviner's Kevlar", type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, abilities: ['eff_diviners_kevlar'], text: 'After the bearer casts their ultimate: gain Shield 6 and +2 Spirit Power for 2 turns.' },
  // Mystic Reverb (T4): delayed echo — half the skill's damage hits the target again next turn.
  { id: 'mystic_reverb', name: 'Mystic Reverb', type: 'equipment', rarity: 4, slot: 'spirit', tier: 4, abilities: ['eff_mystic_reverb'], text: "When the bearer's skill damages an enemy: at that enemy's next turn, it takes spirit damage equal to half the damage dealt." },
  // Escalating Exposure (T4): skill damage stacks Spirit Resist − on the target.
  { id: 'escalating_exposure', name: 'Escalating Exposure', type: 'equipment', rarity: 4, slot: 'spirit', tier: 4, upgradesFrom: 'mystic_vulnerability', abilities: ['eff_escalating_exposure'], text: "When the bearer's skill / spell / ult damages an enemy: apply Spirit Resist −1 (stacks, max 3) for 2 turns." },
  // Frenzy (T4): +3 HP (its canon health), and below half HP +3 Bullet Power
  // (combat) + heal 2 on attack.
  { id: 'frenzy', name: 'Frenzy', type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, bonus: { hp: 3 }, abilities: ['eff_frenzy'], text: '+3 HP. While the bearer is below half HP: +3 Bullet Power, and heal 2 after attacking.' },
  // Inhibitor (canon T4 Vitality): +4 HP (its canon health), and attacks
  // suppress both offense types.
  { id: 'inhibitor', name: 'Inhibitor', type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, bonus: { hp: 4 }, abilities: ['eff_inhibitor'], text: "+4 HP. Bearer's attacks apply Bullet Power −1 and Spirit Power −1 for 2 turns." },
  // Siphon Bullets (canon T4 Vitality): attacks temporarily steal 1 max HP (reverts after 2 turns).
  { id: 'siphon_bullets', name: 'Siphon Bullets', type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, abilities: ['eff_siphon_bullets'], text: "After bearer attacks: steal 1 max HP from the target for 2 turns." },
  // Ricochet (canon T4 Weapon): bullets ricochet to nearby enemies — the keyword,
  // Ricochet 2 while worn. Every swing that lands bounces to all OTHER enemy
  // heroes with its on-hit debuffs, so it scales with Extra Attack and with the
  // bearer's debuff gear.
  { id: 'ricochet', name: 'Ricochet', type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, abilities: ['eff_ricochet'], text: "Ricochet 2: after the bearer's attack lands, every other enemy hero takes 2 bullet damage and the attack's on-hit debuffs." },
  { id: 'healing_tempo',  name: 'Healing Tempo',  type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, upgradesFrom: 'healing_booster', bonus: { atk: 3 }, abilities: ['eff_healing_tempo'], text: '+3 Bullet Power. Healing Boost 4.' },
  { id: 'boundless_spirit', name: 'Boundless Spirit', type: 'equipment', rarity: 4, slot: 'spirit', tier: 4, upgradesFrom: 'improved_spirit', bonus: { spirit: 5, hp: 3 }, text: '+5 Spirit Power. +3 HP.' },
  { id: 'glass_cannon',   name: 'Glass Cannon',   type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, bonus: { atk: 6, hp: -1 }, text: '+6 Bullet Power. −1 max HP.' },

  // ----- More canon passive items (docs/card-design.md, added 2026-10-30) -----
  { id: 'headshot_booster',     name: 'Headshot Booster',     type: 'equipment', rarity: 1, slot: 'weapon', tier: 1, abilities: ['eff_headshot_booster'],     text: "Bearer's attacks deal +2 to an enemy at full HP." },
  { id: 'spirit_strike',        name: 'Spirit Strike',        type: 'equipment', rarity: 1, slot: 'spirit', tier: 1, abilities: ['eff_spirit_strike'],        text: "Bearer's attacks apply Spirit Resist −1 for 2 turns." },
  { id: 'mystic_vulnerability', name: 'Mystic Vulnerability', type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, abilities: ['eff_mystic_vulnerability'], text: "When the bearer's skill / spell / ult damages an enemy: Spirit Resist −1 for 2 turns." },
  { id: 'mystic_slow',          name: 'Mystic Slow',          type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, abilities: ['eff_mystic_slow'],          text: "When the bearer's skill / spell / ult damages an enemy: it is Rooted for 1 turn." },
  { id: 'slowing_bullets',      name: 'Slowing Bullets',      type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_slowing_bullets'],      text: "Bearer's attacks Root the target for 1 turn." },
  { id: 'debuff_reducer',       name: 'Debuff Reducer',       type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_debuff_reducer'],       text: 'Debuffs on the bearer last 1 turn less (never under 1).' },
  { id: 'spirit_snatch',        name: 'Spirit Snatch',        type: 'equipment', rarity: 3, slot: 'spirit', tier: 3, upgradesFrom: 'spirit_strike', bonus: { hp: 1 }, abilities: ['eff_spirit_snatch'],        text: "+1 HP. When the bearer's skill / spell / ult damages an enemy: it gets Spirit Power −1 and the bearer +1 Spirit Power, both for 2 turns." },
  { id: 'spiritual_overflow',   name: 'Spiritual Overflow',   type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, upgradesFrom: 'spirit_lifesteal', bonus: { spirit: 3 }, abilities: ['eff_spiritual_overflow'],   text: '+3 Spirit Power. After bearer attacks: +1 Spirit Power for 2 turns (up to +3) and heal 1.' },

  // ----- Mobility (docs/card-design.md, added 2026-11-03) -----
  // A Retreat is 1 soul (RETREAT_COST), one a turn, before the attack; these make it cheap.
  { id: 'sprint_boots',   name: 'Sprint Boots',   type: 'equipment', rarity: 1, slot: 'vitality', tier: 1, abilities: ['eff_sprint_boots'],   text: "Bearer's Retreat costs 1 less." },
  { id: 'enduring_speed', name: 'Enduring Speed', type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, upgradesFrom: 'sprint_boots', abilities: ['eff_enduring_speed'], text: "Bearer's Retreat costs 1 less, and it cannot be Rooted." },
  { id: 'kinetic_dash',   name: 'Kinetic Dash',   type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_kinetic_dash'],   text: 'When the bearer steps into the Active slot by a Retreat or a swap: +3 Bullet Power this turn.' },

  // ----- Added 2026-11-05: the full shop (docs/card-design.md) -----
  // Every passive item of Deadlock's current shop that reads as its own card
  // here; the folds and skips, and the budget behind each number, are in the
  // audit section of docs/card-design.md.
  // Weapon
  { id: 'monster_rounds',        name: 'Monster Rounds',        type: 'equipment', rarity: 1, slot: 'weapon', tier: 1, abilities: ['eff_monster_rounds'], text: "Bearer's attacks deal +1 to the Mid-Boss. On the bench, it heals 1 at the start of your turn." },
  { id: 'intensifying_magazine', name: 'Intensifying Magazine', type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_intensifying_magazine'], text: 'After the bearer attacks: +1 Bullet Power for 2 turns (stacks to +2).' },
  { id: 'mystic_shot',           name: 'Mystic Shot',           type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_mystic_shot'], text: 'After the bearer attacks: the target takes 1 spirit damage.' },
  { id: 'opening_rounds',        name: 'Opening Rounds',        type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_opening_rounds'], text: "Bearer's attacks deal +2 to an enemy above half HP." },
  { id: 'spirit_shredder',       name: 'Spirit Shredder',       type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_spirit_shredder', 'eff_spirit_shredder_drain'], text: "Bearer's attacks apply Spirit Resist −2 for 2 turns. Its skill / spell / ult damage to an enemy with Spirit Resist − heals it 1." },
  { id: 'stalker',               name: 'Stalker',               type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, abilities: ['eff_stalker'], text: "Bearer's attacks apply Bleed 1 (stacks, max 3) and Bullet Resist −1, both for 2 turns." },
  // Swift Striker's sprint is Sprint Boots' line: a soul off the Retreat.
  { id: 'swift_striker',         name: 'Swift Striker',         type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, bonus: { atk: 1 }, abilities: ['eff_sprint_boots'], text: "+1 Bullet Power. Bearer's Retreat costs 1 less." },
  { id: 'weakening_headshot',    name: 'Weakening Headshot',    type: 'equipment', rarity: 2, slot: 'weapon', tier: 2, bonus: { hp: 1 }, abilities: ['eff_weakening_headshot'], text: "+1 HP. Bearer's attacks on an enemy at full HP apply Bullet Resist −2 for 2 turns." },
  { id: 'ballistic_enchantment', name: 'Ballistic Enchantment', type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, abilities: ['eff_ballistic_enchantment'], text: "When the bearer's skill / spell / ult damages an enemy: +2 Bullet Power for 2 turns (stacks to +4)." },
  { id: 'escalating_resilience', name: 'Escalating Resilience', type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, upgradesFrom: 'extended_magazine', bonus: { atk: 2 }, abilities: ['eff_escalating_resilience'], text: '+2 Bullet Power. After the bearer attacks: Bullet Resist +1 for 2 turns (stacks to 3).' },
  { id: 'express_shot',          name: 'Express Shot',          type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, bonus: { atk: 1 }, abilities: ['eff_express_shot'], text: '+1 Bullet Power. Once an attack, a swing that leaves its target above half HP fires again.' },
  { id: 'headhunter',            name: 'Headhunter',            type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, upgradesFrom: 'headshot_booster', bonus: { hp: 1 }, abilities: ['eff_headhunter'], text: "+1 HP. Bearer's attacks deal +3 to an enemy at full HP, and heal the bearer 2 when they do." },
  { id: 'hollow_point',          name: 'Hollow Point',          type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, bonus: { hp: 1 }, abilities: ['eff_hollow_point'], text: '+1 HP. While the bearer is above half HP: +2 Bullet Power, and its attacks apply Bullet Resist −1 for 2 turns.' },
  { id: 'hunters_aura',          name: "Hunter's Aura",         type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, bonus: { hp: 1 }, abilities: ['eff_hunters_aura'], text: '+1 HP. At the start of your turn: every enemy hero gets Bullet Resist −1 and Bullet Power −1 for 2 turns.' },
  { id: 'sharpshooter',          name: 'Sharpshooter',          type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, upgradesFrom: 'long_range', bonus: { atk: 1 }, abilities: ['eff_sharpshooter'], text: "+1 Bullet Power. The bearer's attacks can target any enemy hero, and deal +3 to a bench hero." },
  { id: 'spirit_rend',           name: 'Spirit Rend',           type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, upgradesFrom: 'spirit_shredder', bonus: { hp: 1 }, abilities: ['eff_spirit_rend', 'eff_spirit_rend_drain'], text: "+1 HP. Bearer's attacks apply Spirit Resist −1 (stacks, max 3) for 2 turns. Its skill / spell / ult damage to an enemy with Spirit Resist − heals it 2." },
  // Weighted Shots keeps its component's Root (Slowing Bullets) and adds the weight.
  { id: 'weighted_shots',        name: 'Weighted Shots',        type: 'equipment', rarity: 3, slot: 'weapon', tier: 3, upgradesFrom: 'slowing_bullets', bonus: { atk: 2 }, abilities: ['eff_slowing_bullets'], text: "+2 Bullet Power. Bearer's attacks Root the target for 1 turn." },
  { id: 'armor_piercer',         name: 'Armor Piercer',         type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, bonus: { atk: 2 }, abilities: ['eff_armor_piercer'], text: "+2 Bullet Power. Bearer's attacks pierce: they ignore Bullet Resist and Shield, and the first enemy bench hero takes the swing too." },
  { id: 'silencer',              name: 'Silencer',              type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, bonus: { atk: 5 }, abilities: ['eff_silencer'], text: "+5 Bullet Power. Spirit Resist 2. Bearer's attacks Silence the target for 2 turns." },
  { id: 'spellslinger',          name: 'Spellslinger',          type: 'equipment', rarity: 4, slot: 'weapon', tier: 4, bonus: { atk: 3 }, abilities: ['eff_spellslinger', 'eff_spellslinger_ult'], text: '+3 Bullet Power. After the bearer uses its skill or ultimate: Extra Attack 1 this turn.' },
  // Vitality
  { id: 'battle_vest',           name: 'Battle Vest',           type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_battle_vest'], text: 'Bullet Resist 1. While the bearer is above half HP: +1 Bullet Power.' },
  { id: 'enchanters_emblem',     name: "Enchanter's Emblem",    type: 'equipment', rarity: 2, slot: 'vitality', tier: 2, abilities: ['eff_enchanters_emblem'], text: 'Spirit Resist 1. At the start of your turn, if the bearer is above half HP: +1 Spirit Power for 1 turn.' },
  { id: 'veil_walker',           name: 'Veil Walker',           type: 'equipment', rarity: 3, slot: 'vitality', tier: 3, bonus: { hp: 2 }, abilities: ['eff_veil_walker'], text: '+2 HP. When the bearer steps into the Active slot by a Retreat or a swap: heal 2 and Dome for 1 turn.' },
  { id: 'cheat_death',           name: 'Cheat Death',           type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, bonus: { hp: 4 }, abilities: ['eff_cheat_death'], text: '+4 HP. Bullet Resist 2. A hit that would fell the bearer from 2 HP or more leaves it at 1 HP.' },
  { id: 'indomitable',           name: 'Indomitable',           type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, upgradesFrom: 'reactive_barrier', bonus: { hp: 4 }, abilities: ['eff_indomitable'], text: '+4 HP. Bullet Resist 2 and Spirit Resist 2. When the bearer is Stunned, Silenced, Disarmed, Slept or Rooted: it is cleansed of them and gains Shield 4.' },
  // Juggernaut keeps its component's lines (Enduring Speed: Retreat −1, no Root).
  { id: 'juggernaut',            name: 'Juggernaut',            type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, upgradesFrom: 'enduring_speed', bonus: { hp: 4 }, abilities: ['eff_enduring_speed', 'eff_juggernaut_regen', 'eff_juggernaut'], text: '+4 HP. Cannot be Rooted, and its Retreat costs 1 less. At the start of your turn: heal 2. When it takes bullet damage, the enemy Active gets Bullet Power −2 for 2 turns.' },
  { id: 'plated_armor',          name: 'Plated Armor',          type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, bonus: { hp: 5 }, abilities: ['eff_plated_armor'], text: '+5 HP. Bullet Resist 3.' },
  // Spellbreaker keeps its component's line (Debuff Reducer: debuffs 1 turn less).
  { id: 'spellbreaker',          name: 'Spellbreaker',          type: 'equipment', rarity: 4, slot: 'vitality', tier: 4, upgradesFrom: 'debuff_reducer', bonus: { hp: 5 }, abilities: ['eff_debuff_reducer', 'eff_spellbreaker'], text: '+5 HP. Spirit Resist 2. Debuffs on the bearer last 1 turn less (never under 1). A spirit hit of 3 or more on it is halved, rounded up.' },
  // Spirit
  // Arcane Surge's stamina is Sprint Boots' line: a soul off the Retreat.
  { id: 'arcane_surge',          name: 'Arcane Surge',          type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, abilities: ['eff_sprint_boots', 'eff_arcane_surge'], text: "Bearer's Retreat costs 1 less. When it steps into the Active slot by a Retreat or a swap: +3 Spirit Power for 1 turn." },
  { id: 'duration_extender',     name: 'Duration Extender',     type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, abilities: ['eff_duration_extender'], text: "The bearer's own buffs of 2 turns or more last 1 turn longer." },
  { id: 'quicksilver_reload',    name: 'Quicksilver Reload',    type: 'equipment', rarity: 2, slot: 'spirit', tier: 2, abilities: ['eff_quicksilver_reload'], text: 'After the bearer uses a skill: the enemy Active takes 1 spirit damage, and the bearer gains +1 Bullet Power for 1 turn.' },
  { id: 'radiant_regeneration',  name: 'Radiant Regeneration',  type: 'equipment', rarity: 3, slot: 'spirit', tier: 3, upgradesFrom: 'mystic_regeneration', bonus: { hp: 2 }, abilities: ['eff_radiant_regeneration', 'eff_radiant_regeneration_ult'], text: '+2 HP. After the bearer uses its skill or ultimate: heal 2.' },
  { id: 'torment_pulse',         name: 'Torment Pulse',         type: 'equipment', rarity: 3, slot: 'spirit', tier: 3, abilities: ['eff_torment_pulse'], text: 'At the end of your turn: the enemy Active and the first enemy bench hero each take 1 spirit damage.' },
  { id: 'lightning_scroll',      name: 'Lightning Scroll',      type: 'equipment', rarity: 4, slot: 'spirit', tier: 4, upgradesFrom: 'mystic_slow', bonus: { hp: 2 }, abilities: ['eff_lightning_scroll'], text: '+2 HP. After the bearer casts its ultimate: every enemy takes 3 spirit damage, and the enemy Active is Stunned for 1 turn.' },
  { id: 'mercurial_magnum',      name: 'Mercurial Magnum',      type: 'equipment', rarity: 4, slot: 'spirit', tier: 4, upgradesFrom: 'quicksilver_reload', bonus: { spirit: 3 }, abilities: ['eff_mercurial_magnum', 'eff_mercurial_magnum_shot'], text: '+3 Spirit Power. After the bearer uses a skill: the enemy Active takes 2 spirit damage. After the bearer attacks: the target takes 1 spirit damage.' },
  { id: 'spirit_burn',           name: 'Spirit Burn',           type: 'equipment', rarity: 4, slot: 'spirit', tier: 4, bonus: { spirit: 3 }, abilities: ['eff_spirit_burn'], text: "+3 Spirit Power. A hit of 3 or more from the bearer's skill / spell / ult burns: 3 more spirit damage, then Bleed 2 and no healing for 2 turns." },

  // ----- Added 2026-11-05: tier 5, Deadlock's 9,999-soul items (docs/card-design.md) -----
  // Worn about two own turns, a tier-5 card earns its 24 souls with an effect
  // that can decide a late match, not with stats; the budget behind each number
  // is in the audit section of docs/card-design.md. No tier-5 item has a component.
  { id: 'haunting_shot',   name: 'Haunting Shot',   type: 'equipment', rarity: 4, slot: 'weapon', tier: 5, abilities: ['eff_haunting_shot'], text: 'After the bearer attacks: every enemy hero takes spirit damage equal to a third of its HP, rounded up. Each gets Bullet Power −2, Spirit Power −2 and no healing for 2 turns, and is Rooted for 1 turn.' },
  // Infinite Rounds pierces as Armor Piercer does; worn beside it, a swing pierces once.
  { id: 'infinite_rounds', name: 'Infinite Rounds', type: 'equipment', rarity: 4, slot: 'weapon', tier: 5, abilities: ['eff_infinite_rounds', 'eff_infinite_rounds_pierce'], text: 'The bearer gains Extra Attack 3 each turn. Its attacks pierce: they ignore Bullet Resist and Shield, and the first enemy bench hero takes the swing too.' },
  { id: 'frostbite_charm', name: 'Frostbite Charm', type: 'equipment', rarity: 4, slot: 'spirit', tier: 5, bonus: { spirit: 4 }, abilities: ['eff_frostbite_charm'], text: "+4 Spirit Power. When the bearer's skill / spell / ult damages an enemy: it takes 7 more spirit damage and is Stunned for 1 turn." },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e])) as Record<string, EquipmentCard>;
