/**
 * The pricing budget: what each item in the shop yields over the life it gets
 * at a given pace, in souls, set against what it costs (PRICE by tier,
 * engine/constants.ts). It is the first reading for the pricing pass, kept in
 * component units so that a regression can later fit a rate to each component
 * in place of the budget's own rates below.
 *
 * Every item (ITEMS, cards/index.ts) has one entry in BUDGET: its effect, read
 * off its ability code in src/abilities (the code, not only the card text), as
 * a yield per own turn worn for a passive and per use for an active, in these
 * components:
 *  - dmg: damage points dealt, of any type;
 *  - heal: heal or Shield points, damage prevented (a Resist, a Dome, a Bullet
 *    Power − on the enemy) and heals denied to the enemy (Healbane): all
 *    shield-like effects;
 *  - stat: permanent stat points (Bullet Power, Spirit Power, max HP); for a
 *    passive, the stat itself, held every own turn it is worn;
 *  - ccActive, ccBench: turns of hard crowd control denied to the enemy Active
 *    or to an enemy bench hero. A Stun is a whole turn; a Silence or a Disarm
 *    alone on the Active is half of one (it keeps its attack, or its ability);
 *    a Silence on a bench hero is all of one, since a bench hero has only its
 *    ability. CC kept off your own Active counts the same way;
 *  - extra: extra attacks;
 *  - souls: souls gained or saved;
 *  - other: a value in souls for what fits no component (the note says what).
 *
 * Procs fire at a few rates read once off the sim (P_ATTACK, P_SKILL, P_HIT and
 * the rest, each with its justification), never at a rate of an item's own. A
 * buff or a debuff is priced by what it changes over the turns it covers
 * (docs/stats-model.md: a stat debuff of stored duration N covers N − 1 enemy
 * turns, a hard CC of N denies N turns); a turn it covers after the first, on a
 * hero in an Active slot, counts P_STAY, the chance that hero is still there.
 * A heal that could pass max HP is discounted by HEAL_AIMED, HEAL_SELF or
 * HEAL_TEAM, a Shield by SHIELD_LAND.
 *
 * The life. A passive is worn max(0.5, L − first) own turns, where L is the
 * match's mean length in own turns and `first` the mean own turn of a player's
 * first purchase at the item's tier; it stays worn through death. An active
 * starts on its cooldown (ACTIVE_COOLDOWN: 2 own turns for tiers 1–2, 3 for
 * tiers 3 and up), so it fires the turns it is worn ÷ its cooldown; a hard
 * crowd-control active has HARD_CC_CHARGES uses and no cooldown, so it fires
 * min(2, turns worn). `components` multiplies the yield by the life;
 * `budgetValue` prices the totals at the budget's rates (DAMAGE to SOUL) and
 * rounds to the 0.5 grain; `verdict` sets the value against the price: it fits
 * within one tier step (price ÷ 2 to price × 2), it is underpriced above that
 * and overpriced below.
 *
 * What it leaves out. An active is its bearer's one ability of the turn: what
 * the hero's own skill would have done instead is not taken off. The tab spike
 * (three items of one tab) and an upgrade's discount over its component are not
 * counted: an item is priced at its tier's price. The proc rates and P_STAY were
 * read off today's sim (5.4 own turns, about one kill a side-turn); a longer and
 * less lethal match raises P_STAY, and with it every second covered turn, every
 * debuff and every damage over time, so read them again off the tuned sim.
 *
 *   npx vite-node scripts/eval/budget.ts [sim.json] [--length L --t1 a … --t5 e --attack A]
 *
 * prints the table (item, tab, tier, price, value, value ÷ price, verdict)
 * sorted by tab and then tier, the pace it used and the verdicts by tier. The
 * pace: a flag given wins; else the sim report's, read at pace.ownTurns.mean and
 * shop.firstByTier (with shop.firstT3 and shop.firstT4, each player's own first
 * purchase, for the tiers it lacks), at the report's root or under
 * byStrength.normal; else today's measured pace (TODAY). Another script imports
 * BUDGET, components, budgetValue, verdict and the rates; the table is printed
 * only when this file is the script that was run.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardId, ItemCard, ItemTier } from '@/engine/types';
import { ITEMS, itemCard } from '@/cards';
import { ACTIVE_COOLDOWN, HARD_CC_CHARGES, ITEM_TIERS, PRICE } from '@/engine/constants';

/** What a Retreat the swap items save costs: each hero prints its own (0–2,
 *  docs/hero-design.md §2); most print 1. */
const RETREAT_COST = 1;
import { ITEM_SLOTS } from '@/engine/market';

// ---------------------------------------------------------------- components and pace

/** The components an item's effect is read in, in the order the table keeps them. */
export const COMPONENTS = ['dmg', 'heal', 'stat', 'ccActive', 'ccBench', 'extra', 'souls', 'other'] as const;
export type Component = (typeof COMPONENTS)[number];
/** An amount of each component. */
export type Components = Record<Component, number>;

/** How a match runs, which sets how long an item is worn and how often it fires. */
export interface Pace {
  /** Mean own turns per match. */
  length: number;
  /** Mean own turn of a player's first purchase, by tier. */
  firstBuy: Record<ItemTier, number>;
  /** The bullet power an extra attack doubles: about the mean Active bullet power. */
  attack: number;
}

/** Today's measured pace, from the 2,500-game sim before tuning: 5.4 own turns;
 *  a player's first purchase of tier 3 on own turn 3.8 and of tier 4 on 5.5
 *  (tiers 1, 2 and 5 are estimates until the sim measures them: tier 5, which
 *  that sim had not got, two own turns from the end of the 9-turn match the
 *  gates aim at); a mean Active bullet power of 2.5. */
export const TODAY: Pace = { length: 5.4, firstBuy: { 1: 1.5, 2: 1.6, 3: 3.8, 4: 5.5, 5: 7 }, attack: 2.5 };

// ---------------------------------------------------------------- the budget's rates

/** Souls one damage point buys. */
export const DAMAGE = 1.0;
/** Souls one heal or Shield point buys (and one damage point prevented): heals
 *  and shields are worth 0.4–0.5 of a damage point. */
export const HEAL = 0.5;
/** Souls a permanent +1 stat (Bullet Power, Spirit Power or max HP) buys for
 *  each own turn it is held. */
export const STAT = 0.7;
/** Souls a turn of hard crowd control on the enemy Active buys. */
export const CC_ACTIVE = 2.0;
/** Souls a turn of hard crowd control on an enemy bench hero buys. */
export const CC_BENCH = 1.0;
/** Souls an extra attack buys for each point of the attack it doubles: an extra
 *  attack is worth EXTRA_ATTACK × pace.attack. */
export const EXTRA_ATTACK = 2;
/** Souls a soul buys. */
export const SOUL = 1.0;
/** The `other` component is already counted in souls. */
export const OTHER = 1.0;
/** The grain a value is rounded to. */
export const GRAIN = 0.5;

/** The rate of each component at a pace (only the extra attack's moves with it). */
export function rates(pace: Pace): Components {
  return {
    dmg: DAMAGE, heal: HEAL, stat: STAT, ccActive: CC_ACTIVE, ccBench: CC_BENCH,
    extra: EXTRA_ATTACK * pace.attack, souls: SOUL, other: OTHER,
  };
}

// ---------------------------------------------------------------- how often things happen
// Read off the 2,500-game balance sim before tuning (sim-reports/latest.json:
// 25,706 side-turns with 22,158 attacks, 49,754 skill and ultimate uses, 5,114
// Retreats and 25,098 kills) and off the rules. Every yield in BUDGET is built
// from these.

/** Share of its own turns an item's bearer spends in its side's Active slot:
 *  four heroes a side, the AI buys for its Active first, and a kill a side-turn
 *  turns the slot over. */
export const P_ACTIVE = 0.4;
/** Attacks a side's Active makes per own turn: 22,158 in 25,706 side-turns. */
export const ATTACKS = 0.86;
/** Swings an attack makes: one, and the Extra Attacks that ride on it (Burst
 *  Fire, Fleetfoot, Haze from Level 3) when the target lives through the first. */
export const SWINGS = 1.1;
/** Swings a side's Active makes at the rival Active on its turn (ATTACKS × SWINGS). */
export const SIDE_SWINGS = ATTACKS * SWINGS;
/** Attack procs: the share of its own turns the bearer is the Active and
 *  attacks (P_ACTIVE × ATTACKS); a proc on each swing fires SWINGS times then. */
export const P_ATTACK = P_ACTIVE * ATTACKS;
/** Skill procs (a skill used; not an item or an ultimate): a skill hero casts on
 *  about 60% of its own turns, 1.94 skill and ultimate uses a side-turn over
 *  about 2.3 skill heroes a side, less ultimates and turns spent down. A
 *  passive hero (8 of 19) has no skill and fires none. */
export const P_SKILL = 0.6;
/** Skill-damage procs (the bearer's skill, item or ultimate damages an enemy)
 *  per own turn, for a caster: its skill lands on about 60% of its turns, and
 *  an ultimate every four or five turns fires once for each enemy it hits. */
export const P_SKILL_HIT = 0.8;
/** Share of skill-damage procs that land on the enemy Active: most skills aim
 *  there, and an AoE fires once on it of about three. */
export const HIT_ON_ACTIVE = 0.7;
/** Being-hit procs: bullet hits the bearer takes per enemy turn, SIDE_SWINGS
 *  while it stands as the Active (P_ACTIVE), and a Ricochet bounce or a Tesla
 *  chain on the bench. */
export const P_HIT = 0.45;
/** Spirit hits the bearer takes per enemy turn: about one on the Active, where
 *  most skills aim, and a third of one on the bench (ultimates, AoE items). */
export const P_SPIRIT_HIT = 0.6;
/** Spirit hits a side lands on the rival Active per own turn: about 0.6 from
 *  damaging skills, 0.35 from ultimates, a little from items and passives. */
export const SPIRIT_HITS = 1.0;
/** Share of a turn's spirit hits that come after the item or cast that sets
 *  them up: the setup goes first. */
export const HITS_AFTER = 0.6;
/** Hard CC (Root included) landing on the bearer per enemy turn: about one
 *  every two enemy turns on the Active (Slowing Bullets, Mystic Slow, Static
 *  Charge, the stun ultimates), little on the bench. */
export const P_CC = 0.2;
/** Ultimates a hero casts per own turn: ULT_COOLDOWN = 3 caps it at a third
 *  once Level 2 unlocks it (about the third own turn), less turns spent down. */
export const P_ULT = 0.2;
/** Heals that pass through the bearer per own turn (its regen and lifesteal,
 *  an ally's heal on it, the heals it casts on others), for a bearer built to
 *  heal: Abrams, Paige, Dynamo, Rem. */
export const P_HEALED = 0.8;
/** Retreats a side makes per own turn: 5,114 in 25,706 side-turns. */
export const RETREATS = 0.2;
/** The bearer steps into the Active slot by a Retreat or a swap: RETREATS,
 *  about half of them bringing in the hero that gains from it. */
export const P_STEP_IN = RETREATS * 0.5;
/** Share of its turns a hero spends below half HP: it has 4–7 HP, and a side
 *  loses about one hero a turn. */
export const P_LOW_HP = 0.3;
/** Share of the bearer's attacks aimed at an enemy at full HP: a fresh Active
 *  (promoted after a kill, or respawned) is at full HP unless a skill hit it first. */
export const P_FULL_HP = 0.35;
/** Chance a hero standing in an Active slot is still there one rival turn
 *  later: a side loses about one hero a turn (25,098 kills in 25,706
 *  side-turns), most of them Actives, and Retreats move a few more. */
export const P_STAY = 0.35;
/** A this-turn swing buff (Fleetfoot, Split Shot, Blood Tribute) is used when
 *  the Active will swing and one swing will not do; it pays on most uses. */
export const P_FOLLOW = 0.85;
/** An Extra Attack that comes on its own (Burst Fire) needs its target
 *  standing after the first swing: about a third of swings at the rival Active kill it. */
export const P_SECOND = 0.65;
/** Share of the enemy's attack a Dome on your Active stops: without reach it has
 *  nothing else to aim at but the Mid-Boss. */
export const DOME = 0.9;
/** Living bench heroes a side has when an AoE, a bounce or a team heal reaches
 *  it: three slots, less the heroes waiting to respawn. */
export const LIVE_BENCH = 2.2;
/** Chance a hero standing in an Active slot is still there one rival turn later
 *  when a Dome keeps attacks off it: only spirit damage reaches it. */
export const P_STAY_DOMED = 0.65;
/** Chance the bearer is still standing at its next own turn: the Active falls
 *  most turns, a bench hero seldom. */
export const P_LIVES = 0.7;
/** Chance next turn's Active is a hero that stood when a team-wide buff or an
 *  AoE landed, not one respawned since. */
export const STOOD = 0.8;
/** Chance your Active has not cast yet when an item buffs its Spirit: a bench
 *  bearer goes first. */
export const NOT_CAST = 0.5;
/** An Active's Spirit-scaled hits in a turn, against a caster's (P_SKILL_HIT):
 *  a passive hero has only its ultimate and the items it uses. */
export const CASTER_SHARE = 0.75;
/** The Active's Spirit Power a spell adds (activeSpi): +1 a level past the
 *  first, Level 2–3 by the time items are used, and the odd Spirit item. */
export const SPELL_SPIRIT = 1.5;

// How much of a heal, a Shield or a cleanse lands.
/** A heal the player aims at a hurt ally: most of it lands (a heal stops at max HP). */
export const HEAL_AIMED = 0.8;
/** A heal that fires on its own on the bearer (regen, lifesteal): the bearer is
 *  at full HP, or down, some of the time. */
export const HEAL_SELF = 0.6;
/** A heal on every ally: the bench is mostly at or near full HP. */
export const HEAL_TEAM = 0.4;
/** A Shield waits until damage comes: the match's end, or a blow it cannot
 *  stop, wastes a little of it. */
export const SHIELD_LAND = 0.9;
/** Chance an ally a cleanse is aimed at carries a debuff worth taking off. */
export const P_DEBUFFED = 0.5;

// What a kit does, averaged.
/** One cast of a hero skill, averaged over the eleven at about Level 2: 1–3 +
 *  Spirit damage on six of them, a heal or Shield of 2–3 (and a rider) on the rest. */
export const AVG_SKILL = { dmg: 1.9, heal: 1.5 } as const;
/** An extra ultimate over the skill it takes the place of that turn: the
 *  nineteen average about 6 damage after overkill (AoE 3–5 + Spirit), a team
 *  heal now and then and a Stun on five, less AVG_SKILL on a skill hero. */
export const ULT_GAIN = { dmg: 5, heal: 0.5, ccActive: 0.35, ccBench: 0.1 } as const;

// Values in souls for what fits no component.
/** A free swap of the Active, beyond the soul a Retreat costs: a move the
 *  turn's one Retreat does not spend, which saves a hurt Active from the kill. */
export const SWAP_EXTRA = 0.5;
/** A turn of Root on the enemy Active: it cannot Retreat or be swapped, so a
 *  hurt one stays to be finished (a side Retreats about one turn in five). On a
 *  bench hero, a quarter of that. */
export const ROOT = 0.4;
/** What a cleanse takes off when it finds something: a hard CC turned back, a
 *  Bleed's ticks, a shred or a power-down. */
export const CLEANSE = 1.0;
/** A turn off the cooldowns of the bearer's own active items, per own turn worn:
 *  it wears one about half the time, and each extra use costs its one ability. */
export const ITEM_CUT = 0.4;

// ---------------------------------------------------------------- the table

/** One item's line in the budget. */
export interface BudgetEntry {
  /** 'passive': `per` is what one own turn worn yields. 'active': what one use yields. */
  mode: 'passive' | 'active';
  /** The yield per own turn worn, or per use, in component units. */
  per: Partial<Components>;
  /** Yield counted in swings: each unit is one swing of `pace.attack` bullet
   *  damage (a Dome that stops the enemy's attack, a Resist that stops a whole swing). */
  perSwing?: Partial<Components>;
  /** An active's yield per use for each own turn the match has left after it:
   *  a gain that lasts (Golden Goose Egg's max HP). */
  lasting?: Partial<Components>;
  /** How the numbers were read. */
  note: string;
}

/** `c` times `k`. */
function times(c: Partial<Components>, k: number): Partial<Components> {
  const out: Partial<Components> = {};
  for (const key of COMPONENTS) {
    const v = c[key];
    if (v !== undefined) out[key] = v * k;
  }
  return out;
}

const passive = (per: Partial<Components>, note: string): BudgetEntry => ({ mode: 'passive', per, note });
const active = (per: Partial<Components>, note: string, more: Pick<BudgetEntry, 'perSwing' | 'lasting'> = {}): BudgetEntry =>
  ({ mode: 'active', per, ...more, note });

/** Every item's yield, in the order of the card files (cards/spells.ts, then cards/equipment.ts). */
export const BUDGET: Readonly<Record<CardId, BudgetEntry>> = {
  // ----- Actives, tier 1 -----
  healing_rite: active({ heal: 2 * HEAL_AIMED },
    'Heals an ally 2; aimed at a hurt one, HEAL_AIMED of it lands.'),
  rusted_barrel: active({ heal: 2 * SIDE_SWINGS },
    "Bullet Power −2 on the enemy Active, stored 2 turns, covers its next turn: SIDE_SWINGS swings 2 lighter, damage prevented."),
  golden_goose_egg: active({ souls: 2 },
    '2 souls, and +1 max HP (with the HP) on your Active for good: the stat counts for the own turns left after each use.',
    { lasting: { stat: 1 } }),
  grit: active({ heal: 2 * SHIELD_LAND },
    'Shield 2 on your Active.'),

  // ----- Actives, tier 2 -----
  cold_front: active({ dmg: 4 + SPELL_SPIRIT },
    "4 + Spirit spirit damage to the enemy Active; the Spirit is your Active's (SPELL_SPIRIT)."),
  slowing_hex: active({ ccBench: 1 },
    'Silence any enemy 1 turn, aimed at a caster: a bench hero loses its whole turn (its ability); on the Active the same ability is half a turn, the same 1.0 souls.'),
  spirit_sap: active({ dmg: 2 * SPIRIT_HITS * (HITS_AFTER + P_STAY) },
    "Spirit Resist −2 on an enemy, stored 2 turns (the rest of your turn and your next): +2 on this turn's spirit hits still to come and on next turn's, if it is still there."),
  guardian_ward: active({ heal: 3 * SHIELD_LAND },
    'Shield 3 on an ally.'),
  return_fire: active({ dmg: 2 * SIDE_SWINGS * (1 + P_STAY) },
    'Return Fire 2 on your Active for 2 enemy turns: 2 bullet damage back for each swing that lands on it, the second turn if it is still there.'),
  fleetfoot: active({ extra: P_FOLLOW },
    'Extra Attack 1 on your Active this turn. Its free Retreat is not counted: an Active that retreats takes the Extra Attack to the bench.'),
  split_shot: active({ dmg: 2 * LIVE_BENCH * SWINGS * P_FOLLOW },
    "Ricochet 2 on your Active this turn: each swing that lands bounces 2 to every other living enemy hero (LIVE_BENCH)."),

  // ----- Actives, tier 3 -----
  decay: active({ dmg: 3 * (1 + P_STAY) },
    "Bleed 3 for 2 turns on the enemy Active: 3 pure at its next turn start, and at the one after if it still stands."),
  disarming_hex: active({ ccActive: 0.5 * (1 + P_STAY) },
    'Disarm 2 turns, aimed at the enemy Active (a bench hero has no attack to lose): half a turn each, the second if it is still the Active.'),
  knockdown: active({ ccActive: 1 },
    'Stun the enemy Active 1 turn.'),
  metal_skin: active({},
    'Bullet Resist 5 on an ally (your Active) for 2 enemy turns stops nearly every swing whole: counted in swings, the second turn if it is still there.',
    { perSwing: { heal: SIDE_SWINGS * (1 + P_STAY) } }),
  debuff_remover: active({ heal: 2 * SHIELD_LAND + P_DEBUFFED * 3 * HEAL_AIMED, other: P_DEBUFFED * CLEANSE },
    'Dispel Magic: Shield 2 on an ally; when it carried a debuff (P_DEBUFFED), the cleanse (CLEANSE) and a heal of 3.'),
  silence_glyph: active({ dmg: 2 + SPELL_SPIRIT, ccActive: 0.5 * (1 + P_STAY) },
    'Silence Wave: 2 + Spirit spirit damage and Silence 2 turns on the enemy Active, half a turn each, the second if it is still the Active.'),
  warp_stone: active({ souls: RETREAT_COST, other: SWAP_EXTRA },
    "A free swap (a Retreat's soul, and SWAP_EXTRA); the hero stepping in has Bullet Resist 3 for 2 enemy turns, about 0.9 of a swing stopped.",
    { perSwing: { heal: 0.9 * SIDE_SWINGS * (1 + P_STAY) } }),
  blood_tribute: active({ extra: P_FOLLOW, dmg: 2 * P_FOLLOW, heal: -3 * HEAL_AIMED },
    'Extra Attack 1 and +1 Bullet Power on both swings this turn, for 3 HP off your Active (never below 1), counted as a heal lost.'),
  healing_nova: active({ heal: 3 * (1 + LIVE_BENCH) * HEAL_TEAM },
    'Heals every living ally 3: the Active and LIVE_BENCH bench heroes, HEAL_TEAM of it landing.'),
  rescue_beam: active({ souls: RETREAT_COST, other: SWAP_EXTRA, heal: 4 * HEAL_AIMED },
    "A free swap, and the Active it rescues (the hurt one) heals 4 on the bench."),
  fury_trance: active({
    extra: P_FOLLOW,
    heal: 2.6 * SPIRIT_HITS * (1 + P_STAY) - AVG_SKILL.heal * P_STAY,
    dmg: -AVG_SKILL.dmg * P_STAY,
  }, "Extra Attack 1 this turn; Spirit Resist 3 for 2 enemy turns (about 2.6 off each spirit hit: they run 2–6); Silenced 2 turns, so next turn's skill (AVG_SKILL) is lost if it is still there."),
  alchemical_fire: active({ dmg: (1 + SPELL_SPIRIT) * (1 + LIVE_BENCH) + 2 * SIDE_SWINGS * (1 + STOOD) },
    "1 + Spirit spirit damage to every enemy, and Bullet Resist −2 on each through your next turn: +2 on this turn's swings and on next turn's at whoever is the Active then (one it hit: STOOD)."),
  heroic_aura: active({ dmg: SWINGS * P_FOLLOW + SIDE_SWINGS * STOOD, heal: 2 * (SIDE_SWINGS + 0.2) * STOOD },
    "+1 Bullet Power and Bullet Resist 1 for 2 turns on every ally: +1 on this turn's swings and next turn's (the Active then carries it: STOOD), and 1 off each enemy bullet hit on them for 2 enemy turns (the swings at the Active, and 0.2 a turn of bounces and chains on the bench)."),
  shadow_weave: active({ dmg: 2 * (SWINGS * P_FOLLOW + SIDE_SWINGS * P_STAY_DOMED) },
    "Dome 1 turn and +2 Bullet Power for 2 turns on your Active: the enemy's next attack stopped (DOME, in swings); +2 on this turn's swings and next turn's (P_STAY_DOMED).",
    { perSwing: { heal: SIDE_SWINGS * DOME } }),
  majestic_leap: active({ souls: RETREAT_COST, other: SWAP_EXTRA },
    "A free swap: the Retreat's soul, and SWAP_EXTRA."),

  // ----- Actives, tier 4 -----
  echo_shard: active(times(AVG_SKILL, 0.75),
    'Your Active casts its skill again (AVG_SKILL) when it has one: 11 of 19 heroes do, and the bearer waits for one, so 0.75 of uses.'),
  unstoppable: active({ heal: 3 * SPIRIT_HITS * 0.8, ccActive: (P_CC / P_ACTIVE) * 0.7, other: P_DEBUFFED * CLEANSE * 0.5 },
    "Unstoppable 1 turn on an ally (your Active): immune through the next enemy turn to its swings (in swings), its spirit hits (about 3 each, 0.8 still aimed at it) and its CC (P_CC / P_ACTIVE on the Active, 0.7 of a turn each); it cleanses CC as it lands (half a cleanse).",
    { perSwing: { heal: SIDE_SWINGS } }),
  curse: active({ ccActive: 1, ccBench: 0.6 + 0.6 * 0.6 },
    'Cursed Relic: Silence and Disarm 3 turns on one enemy hero, aimed at the Active: its first turn whole, then its ability for two more turns, retreated or not, if it lives (0.6 a round).'),
  divine_barrier: active({ heal: 4 * SHIELD_LAND, other: P_DEBUFFED * CLEANSE },
    'Shield 4 on an ally, and a cleanse of all its debuffs but Stun.'),
  ethereal_shift: active({ dmg: P_SKILL_HIT * CASTER_SHARE * (NOT_CAST + P_STAY_DOMED) },
    "Dome 1 turn on an ally (your Active: the enemy's next attack stopped, in swings) and +1 Spirit Power for 2 turns: +1 on its Spirit-scaled hits (CASTER_SHARE of a caster's) this turn if it has not cast (NOT_CAST) and next turn (P_STAY_DOMED).",
    { perSwing: { heal: SIDE_SWINGS * DOME } }),
  phantom_strike: active({ dmg: 2 + SPELL_SPIRIT, ccActive: 0.5, other: 1.5 },
    'Drags an enemy bench hero to the front (a hurt one, for your attack, while their Active goes to the bench: about 1.5 souls), then 2 + Spirit spirit damage and Disarm 1 turn on it.'),
  vortex_web: active({ dmg: (2 + SPELL_SPIRIT) * (1 + LIVE_BENCH), other: ROOT * (1 + P_STAY) + (ROOT / 4) * LIVE_BENCH * 2 },
    '2 + Spirit spirit damage to every enemy, and Root 2 turns on each: ROOT on the Active, a quarter of it on each bench hero.'),
  refresher: active({ ...times(ULT_GAIN, 0.6), other: 0.3 },
    "Resets your Active's skill, ultimate and items: its ultimate again (ULT_GAIN) when it was waiting on it (0.6 of uses), and its items ready a turn early (0.3)."),
  colossus: active({ heal: 3 * SPIRIT_HITS * 1.5, other: ROOT },
    "Bullet and Spirit Resist 4 on your Active for 2 enemy turns (nearly every swing stopped, about 3 off each spirit hit; with them it is still there half the time) and Root 1 turn on the enemy Active.",
    { perSwing: { heal: 0.95 * SIDE_SWINGS * 1.5 } }),
  infuser: active({ heal: 3 * HEAL_AIMED, dmg: 3 * P_SKILL_HIT * CASTER_SHARE * (NOT_CAST + P_STAY) },
    "+3 Spirit Power for 2 turns and heal 3 on your Active: +3 on its Spirit-scaled hits (CASTER_SHARE of a caster's) this turn if it has not cast (NOT_CAST) and next turn (P_STAY)."),
  arctic_blast: active({ dmg: (2 + SPELL_SPIRIT) * (1 + LIVE_BENCH), ccActive: 0.75 },
    '2 + Spirit spirit damage to every enemy, then Stun 1 turn on the enemy Active if it still stands (0.75).'),

  // ----- Passives, tier 1 -----
  extended_magazine: passive({ stat: 1 }, '+1 Bullet Power.'),
  extra_spirit: passive({ stat: 1 }, '+1 Spirit Power.'),
  extra_regen: passive({ heal: 1 * HEAL_SELF },
    'Heal 1 at the start of your turn.'),
  extra_health: passive({ stat: 2 }, '+2 max HP.'),
  restorative_shot: passive({ heal: 1 * P_ATTACK * SWINGS * HEAL_SELF },
    'Heal 1 after each swing (not a bounce).'),
  mystic_regeneration: passive({ heal: 1 * P_SKILL_HIT * HEAL_SELF },
    'Heal 1 each time its skill, item or ultimate damages an enemy.'),
  mystic_burst: passive({ dmg: 1 * P_SKILL },
    '1 spirit damage to the enemy Active each time it uses a skill (not an item or an ultimate); nothing on a passive hero.'),

  // ----- Passives, tier 2: stats, healing boost, reactive shields, shred -----
  titanic_magazine: passive({ stat: 2 }, '+2 Bullet Power.'),
  improved_spirit: passive({ stat: 2 }, '+2 Spirit Power.'),
  healing_booster: passive({ heal: 2 * P_HEALED * HEAL_SELF },
    'Healing Boost 2: +2 on each heal it gets or casts (P_HEALED), the extra landing HEAL_SELF.'),
  weapon_shielding: passive({ heal: 2 * P_HIT * SHIELD_LAND },
    'Shield 2 after each bullet hit it takes (refreshed to 2, not stacked).'),
  spirit_shielding: passive({ heal: 2 * P_SPIRIT_HIT * SHIELD_LAND },
    'Shield 2 after each spirit hit it takes (refreshed to 2, not stacked).'),
  bullet_resist_shredder: passive({ dmg: 1 * P_ATTACK * (SWINGS - 1) },
    "Bullet Resist −1 stored 1 turn ticks off at the target's turn start: only the same attack's later swings feel it."),

  // ----- Passives: the cooldown family -----
  improved_cooldown: passive(times(ULT_GAIN, P_ULT * (3 / 2 - 1)),
    'Compress Cooldown: its ultimate every 2 own turns, not 3, so half as many again (P_ULT × ½ more, each ULT_GAIN).'),
  superior_cooldown: passive({ ...times(ULT_GAIN, P_ULT * (3 / 2 - 1)), other: ITEM_CUT },
    'Its ultimate every 2 own turns, not 3 (ULT_GAIN each), and its own active items a turn sooner (ITEM_CUT).'),

  // ----- Passives: the spirit burst line -----
  improved_burst: passive({ dmg: 2 * P_SKILL_HIT * 0.85 },
    'Tankbuster: 2 pure more when its skill, item or ultimate deals 2 or more to an enemy (0.85 of its hits do).'),

  // ----- Passives: the lifesteal family -----
  bullet_lifesteal: passive({ heal: 2 * P_ATTACK * SWINGS * HEAL_SELF },
    'Heal 2 after each swing (not a bounce).'),
  spirit_lifesteal: passive({ heal: 2 * P_SKILL_HIT * HEAL_SELF },
    'Heal 2 each time its skill, item or ultimate damages an enemy.'),

  // ----- Passives: cast payoffs, extra shots -----
  surge_of_power: passive({ dmg: 2 * P_ATTACK * SWINGS * (1 - (1 - P_SKILL) ** 2) },
    '+2 Bullet Power through its next turn after a skill: on its swings when it cast this turn or last (a skill hero).'),
  burst_fire: passive({ extra: P_ATTACK * P_SECOND },
    'Extra Attack 1 each turn: a second swing when it is the Active, attacks, and the target lives through the first (P_SECOND).'),

  // ----- Passives, tier 2: tech -----
  suppressor: passive({ heal: P_SKILL_HIT * HIT_ON_ACTIVE * P_STAY * SIDE_SWINGS },
    "Bullet Power −1 for the next enemy turn on an enemy its skill, item or ultimate damages: 1 off the enemy Active's swings, if it lives to make them."),
  reactive_barrier: passive({ heal: 3 * P_CC * SHIELD_LAND },
    'Shield 3 each time it suffers hard CC (Root included).'),

  // ----- Passives that were spells, and new passives -----
  healbane: passive({ heal: P_SKILL_HIT * P_STAY * 0.75 },
    "No heals for 2 turns on an enemy its skill, item or ultimate damages: about 0.75 HP of regen, lifesteal or an ally's heal denied on its next turn, if it lives; a heal denied counts as one."),
  active_reload: passive({ stat: 1, heal: 1 * P_ATTACK * SWINGS * HEAL_SELF },
    '+1 Bullet Power, and heal 1 after each swing.'),
  long_range: passive({ other: 1 * P_ATTACK },
    'Its attack may aim at any enemy hero: about a soul an attack (a hurt bench hero for the kill, a way round a Dome or a Shield).'),
  fortitude: passive({ stat: 2, heal: 2 * HEAL_SELF },
    '+2 max HP, and heal 2 at the start of your turn.'),

  // ----- Passives, tier 3: weapon offense -----
  toxic_bullets: passive({ dmg: 1 * P_ATTACK * SWINGS * (P_STAY + P_STAY ** 2) },
    "Bleed +1 (to 3) for 2 turns on each swing: 1 pure at the target's next turn start and at the one after, if it still stands."),
  tesla_bullets: passive({ dmg: 1 * P_ATTACK * SWINGS },
    '1 bullet damage to a living enemy bench hero after each swing.'),

  // ----- Passives, tier 3: resists -----
  bullet_resilience: passive({ heal: P_HIT * (1.8 + P_LOW_HP * 0.7) },
    'Bullet Resist 2 (about 1.8 off a hit: swings of 1–4, bounces of 2), and below half HP 2 more (about 0.7 of what is left).'),
  spirit_resilience: passive({ heal: P_SPIRIT_HIT * (1.9 + P_LOW_HP * 1.0) },
    'Spirit Resist 2 (about 1.9 off a spirit hit: they run 2–6), and below half HP 2 more (about 1).'),

  // ----- Passives, tier 3: premium -----
  berserker: passive({ dmg: P_ATTACK * SWINGS * 0.6 },
    '+1 Bullet Power (to +4) for each bullet hit it takes, lost on death: about 0.6 of it on when it swings (a fresh Active has none).'),
  superior_duration: passive({ other: 0.4 },
    'Buffs on it last a turn longer (not Shields or permanent ones): about one every two turns, its extra turn worth about 0.8 souls. On a channel ultimate (Dynamo, Seven, Warden) it is a whole pulse more, worth far more there.'),

  // ----- Passives, tier 4 -----
  transcendent_cooldown: passive({ ...times(ULT_GAIN, P_ULT * (3 / 1 - 1)), other: ITEM_CUT },
    'Its ultimate every own turn, not every third: three times as many, each over the skill it replaces (ULT_GAIN), and its items a turn sooner (ITEM_CUT).'),
  crippling_headshot: passive({ stat: 1, dmg: 2 * P_ATTACK * (SWINGS - 1 + P_STAY * (SIDE_SWINGS + SPIRIT_HITS)) },
    "+1 Bullet Power, and Bullet and Spirit Resist −2 through your next turn on what it hits: +2 on the attack's later swings, and on next turn's swings and spirit hits if it is still the Active."),
  leech: passive({ heal: 2 * (P_ATTACK * SWINGS + P_SKILL_HIT) * HEAL_SELF },
    'Bullet and Spirit Lifesteal both: heal 2 after each swing, and each time its skill, item or ultimate damages an enemy.'),
  diviners_kevlar: passive({ heal: P_ULT * 6 * SHIELD_LAND, dmg: P_ULT * 2 * P_SKILL_HIT * P_LIVES },
    "After its ultimate, Shield 6 and +2 Spirit Power for 2 turns: +2 on next turn's spirit hits, if it stands (P_LIVES)."),
  mystic_reverb: passive({ dmg: P_SKILL_HIT * 1.5 * 0.45 },
    'An enemy its skill, item or ultimate damages takes half that hit again at its next turn start (about 1.5), if it still stands (0.45: P_STAY on the Active, more on the bench).'),
  escalating_exposure: passive({ dmg: P_SKILL_HIT * SPIRIT_HITS * (HITS_AFTER + P_STAY * 1.5) },
    "Spirit Resist −1 (stacking to 3) through your next turn on each enemy it damages: +1 on the spirit hits after it this turn, about +1.5 on next turn's if it is still there."),
  frenzy: passive({ dmg: 3 * P_ATTACK * SWINGS * P_LOW_HP, heal: 2 * P_ATTACK * SWINGS * P_LOW_HP * 0.9 },
    'Below half HP, +3 Bullet Power and heal 2 after each swing (it is hurt then: 0.9 of the heal lands).'),
  inhibitor: passive({ heal: P_ATTACK * P_STAY * (SIDE_SWINGS + 0.6) },
    'Bullet Power −1 and Spirit Power −1 on the target for its next turn: 1 off its swings and its Spirit-scaled hits (about 0.6), if it lives to make them.'),
  siphon_bullets: passive({ dmg: P_ATTACK * SWINGS * P_FULL_HP, heal: P_ATTACK * SWINGS * 0.7 },
    'Each swing steals 1 max HP for 2 turns: a point of damage on a target at full HP, and +1 max HP with the HP on the bearer (0.7: it goes back when the steal ends).'),
  ricochet: passive({ dmg: 2 * LIVE_BENCH * P_ATTACK * SWINGS },
    'Ricochet 2 on every swing: 2 to every other living enemy hero (LIVE_BENCH).'),
  healing_tempo: passive({ stat: 2, heal: 2.5 * P_HEALED * HEAL_SELF },
    '+2 Bullet Power, and Healing Boost 4 on each heal it gets or casts, of which about 2.5 fits under max HP.'),
  boundless_spirit: passive({ stat: 5 + 3 }, '+5 Spirit Power and +3 max HP.'),
  glass_cannon: passive({ stat: 6 - 1 }, '+6 Bullet Power and −1 max HP.'),

  // ----- More canon passives -----
  headshot_booster: passive({ dmg: 2 * P_ATTACK * P_FULL_HP },
    '+2 on a swing at an enemy at full HP: the first swing at a fresh Active.'),
  spirit_strike: passive({ dmg: P_ATTACK * P_STAY * SPIRIT_HITS },
    "Spirit Resist −1 through your next turn on what it hits: +1 on next turn's spirit hits, if it is still the Active (Wraith's own spirit half feels it at once)."),
  mystic_vulnerability: passive({ dmg: P_SKILL_HIT * SPIRIT_HITS * (HITS_AFTER + P_STAY) * 0.7 },
    'Spirit Resist −1 through your next turn on an enemy its skill, item or ultimate damages: refreshed, not stacked (0.7, for hits on one already marked).'),
  mystic_slow: passive({ other: P_SKILL_HIT * HIT_ON_ACTIVE * P_STAY * ROOT },
    'Root 1 turn on an enemy its skill, item or ultimate damages: ROOT on the enemy Active, if it lives to its turn.'),
  slowing_bullets: passive({ other: P_ATTACK * P_STAY * ROOT },
    'Root 1 turn on the target of each swing: ROOT, if it lives to its turn.'),
  debuff_reducer: passive({ other: 0.3 },
    'Debuffs on it last a turn less (never under 1): about 0.3 of 2 turns or more land on it a turn, each turn cut worth about a soul (a stat debuff gone, a Bleed tick, a turn of CC).'),
  spirit_snatch: passive({ dmg: P_SKILL * P_SKILL_HIT * P_LIVES, heal: P_SKILL * HIT_ON_ACTIVE * P_STAY * 0.5 },
    "When it damages an enemy, +1 Spirit Power on it and −1 on the enemy for 2 turns (refreshed, not stacked: counted on the 60% of turns it casts, P_SKILL): +1 on its next turn's spirit hits if it stands (P_LIVES), 1 off the enemy's (about 0.5 of them) if it lives."),
  spiritual_overflow: passive({ heal: 1 * P_ATTACK * SWINGS * HEAL_SELF, dmg: P_ATTACK * 1.2 * P_SKILL_HIT * P_STAY },
    '+1 Spirit Power (to +3) for 2 turns and heal 1 after each swing: about +1.2 on its spirit hits next turn, if it is still standing.'),

  // ----- Mobility -----
  sprint_boots: passive({ souls: P_ACTIVE * RETREATS },
    'A soul off its Retreat, when it is the Active that retreats.'),
  enduring_speed: passive({ souls: P_ACTIVE * RETREATS, other: P_CC * 0.5 * ROOT },
    'A soul off its Retreat, and no Root (about half the CC that lands on it).'),
  kinetic_dash: passive({ dmg: P_STEP_IN * SIDE_SWINGS },
    "+1 Bullet Power on the turn's swings when it steps in by a Retreat or a swap."),
};

// ---------------------------------------------------------------- reading the table

/** The item behind an id, or a thrown error naming it. */
function item(id: CardId): ItemCard {
  const card = itemCard(id);
  if (!card) throw new Error(`No item ${id}.`);
  return card;
}

/** An item's entry in BUDGET, or a thrown error naming it. */
export function budgetEntry(id: CardId): BudgetEntry {
  const entry = BUDGET[id];
  if (!entry) throw new Error(`No budget entry for ${id}: add one to BUDGET (scripts/eval/budget.ts).`);
  return entry;
}

/** Items with no entry, entries for no item, and entries whose mode is not the
 *  kind of their card (or a passive's with a `lasting` yield): all empty when
 *  BUDGET is whole. */
export function coverage(): { missing: CardId[]; unknown: CardId[]; misread: CardId[] } {
  const ids = new Set(ITEMS.map((c) => c.id));
  return {
    missing: ITEMS.filter((c) => !BUDGET[c.id]).map((c) => c.id),
    unknown: Object.keys(BUDGET).filter((id) => !ids.has(id)),
    misread: ITEMS.filter((c) => {
      const entry = BUDGET[c.id];
      if (!entry) return false;
      return entry.mode !== (c.type === 'spell' ? 'active' : 'passive') || (entry.mode === 'passive' && !!entry.lasting);
    }).map((c) => c.id),
  };
}

/** Own turns an item of `tier` is worn: max(0.5, L − the own turn of its first purchase). */
export function turnsWorn(tier: ItemTier, pace: Pace): number {
  return Math.max(0.5, pace.length - pace.firstBuy[tier]);
}

/** Own turns an active of `tier` waits after a use, and after it is bought. */
export function cooldownOf(tier: ItemTier): number {
  return tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high;
}

/** What an entry's `per` is multiplied by: the own turns a passive is worn; the
 *  uses an active gets, its turns worn ÷ its cooldown (it starts on it), or
 *  min(HARD_CC_CHARGES, turns worn) for hard crowd control. */
export function life(id: CardId, pace: Pace): number {
  const card = item(id);
  const worn = turnsWorn(card.tier, pace);
  if (card.type === 'equipment') return worn;
  return card.hardCC ? Math.min(HARD_CC_CHARGES, worn) : worn / cooldownOf(card.tier);
}

/** Own turns the match has left after an active's use, on average: a hard-CC
 *  active is used on its first turns worn; any other's uses are spread from its
 *  first chance (a cooldown after it is bought) to the match's end. */
function turnsAfterUse(card: ItemCard, pace: Pace): number {
  const worn = turnsWorn(card.tier, pace);
  if (card.type === 'spell' && card.hardCC) return Math.max(0.5, worn - (Math.min(HARD_CC_CHARGES, worn) - 1) / 2);
  return Math.max(0.5, (worn - cooldownOf(card.tier)) / 2);
}

/** The item's yield over its expected life at `pace`, per component: a passive's
 *  yield a turn times its turns worn; an active's yield a use times its uses
 *  (with a lasting gain counted for the turns left after each). */
export function components(id: CardId, pace: Pace): Components {
  const entry = budgetEntry(id);
  const card = item(id);
  const n = life(id, pace);
  const out = Object.fromEntries(COMPONENTS.map((k) => [k, 0])) as Components;
  const add = (c: Partial<Components> | undefined, k: number) => {
    if (!c) return;
    for (const key of COMPONENTS) out[key] += (c[key] ?? 0) * k;
  };
  add(entry.per, n);
  add(entry.perSwing, n * pace.attack);
  if (entry.mode === 'active') add(entry.lasting, n * turnsAfterUse(card, pace));
  return out;
}

/** What the item's yield is worth at `pace`, in souls at the budget's rates,
 *  rounded to the 0.5 grain. */
export function budgetValue(id: CardId, pace: Pace): number {
  const c = components(id, pace);
  const r = rates(pace);
  const souls = COMPONENTS.reduce((sum, k) => sum + c[k] * r[k], 0);
  return Math.round(souls / GRAIN) * GRAIN || 0;
}

/** How a value sits against its price. */
export type Call = 'fits' | 'underpriced' | 'overpriced';

/** An item's value at a pace, set against its price. */
export interface ItemVerdict {
  id: CardId;
  /** The budget value in souls, at the 0.5 grain. */
  value: number;
  /** PRICE of its tier. */
  price: number;
  /** value ÷ price. */
  ratio: number;
  /** 'fits' within one tier step (price ÷ 2 to price × 2); 'underpriced' when
   *  the value is above price × 2, 'overpriced' when it is below price ÷ 2. */
  verdict: Call;
}

/** The item's budget value at `pace` against its price. */
export function verdict(id: CardId, pace: Pace): ItemVerdict {
  const value = budgetValue(id, pace);
  const price = PRICE[item(id).tier];
  const call: Call = value > price * 2 ? 'underpriced' : value < price / 2 ? 'overpriced' : 'fits';
  return { id, value, price, ratio: value / price, verdict: call };
}

// ---------------------------------------------------------------- the pace in a sim report

/** What a sim report says of the pace. */
export interface ReportPace {
  length?: number;
  firstBuy: Partial<Record<ItemTier, number>>;
}

const TIERS: readonly ItemTier[] = ITEM_TIERS;

/** The tier a report key or a flag names ("3", "T3", "tier3"), if the shop has it. */
function tierNamed(key: string): ItemTier | undefined {
  const n = Number(/^(?:t|tier)?(\d+)$/i.exec(key)?.[1]);
  return (TIERS as readonly number[]).includes(n) ? (n as ItemTier) : undefined;
}

/** An object's own fields, or undefined for anything else. */
function fields(x: unknown): Record<string, unknown> | undefined {
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined;
}

/** A finite number, or undefined. */
function finite(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

/** The mean a report gives in any of the shapes the sim writes: a number; an
 *  object with a `mean`; the sim's per-role pair (`firstMover`, `secondMover`,
 *  each weighted by its players who bought, 1 − `noneShare`); or one of those
 *  under `all` or `perPlayer`. */
function meanOf(x: unknown): number | undefined {
  const n = finite(x);
  if (n !== undefined) return n;
  const o = fields(x);
  if (!o) return undefined;
  const m = finite(o.mean);
  if (m !== undefined) return m;
  let sum = 0;
  let weight = 0;
  for (const role of [o.firstMover, o.secondMover]) {
    const r = fields(role);
    const mean = finite(r?.mean);
    if (mean === undefined) continue;
    const w = 1 - (finite(r?.noneShare) ?? 0);
    sum += mean * w;
    weight += w;
  }
  if (weight > 0) return sum / weight;
  return meanOf(o.all) ?? meanOf(o.perPlayer);
}

/** A by-tier table of means: an array (tier 1 first) or an object keyed by
 *  tier (1, T1 or tier1, for each tier of the shop). */
function byTier(x: unknown): Partial<Record<ItemTier, number>> {
  const out: Partial<Record<ItemTier, number>> = {};
  if (Array.isArray(x)) {
    x.slice(0, TIERS.length).forEach((v, i) => {
      const m = meanOf(v);
      if (m !== undefined) out[(i + 1) as ItemTier] = m;
    });
    return out;
  }
  for (const [key, v] of Object.entries(fields(x) ?? {})) {
    const tier = tierNamed(key);
    const m = meanOf(v);
    if (tier && m !== undefined) out[tier] = m;
  }
  return out;
}

/** The pace a sim report gives: the mean length at pace.ownTurns.mean, and each
 *  player's own first purchase by tier at shop.firstByTier (or, for tiers 3 and
 *  4 that lacks, shop.firstT3 and shop.firstT4), looked for at the report's
 *  root and then under byStrength.normal. */
export function paceFromReport(report: unknown): ReportPace {
  const scopes = [fields(report), fields(fields(fields(report)?.byStrength)?.normal)].filter(
    (s): s is Record<string, unknown> => !!s,
  );
  const out: ReportPace = { firstBuy: {} };
  for (const s of scopes) out.length ??= finite(fields(fields(s.pace)?.ownTurns)?.mean);
  for (const s of scopes) {
    const given = byTier(fields(s.shop)?.firstByTier);
    for (const t of TIERS) out.firstBuy[t] ??= given[t];
  }
  for (const s of scopes) {
    const shop = fields(s.shop);
    out.firstBuy[3] ??= meanOf(shop?.firstT3);
    out.firstBuy[4] ??= meanOf(shop?.firstT4);
  }
  for (const t of TIERS) if (out.firstBuy[t] === undefined) delete out.firstBuy[t];
  return out;
}

// ---------------------------------------------------------------- the command line

const USAGE = `Usage: npx vite-node scripts/eval/budget.ts [sim.json] [--length L ${TIERS.map((t) => `--t${t} N`).join(' ')} --attack A]`;

/** Stop on a command line this script cannot run, saying why. */
function usage(why: string): never {
  console.error(`${why}\n\n${USAGE}`);
  process.exit(2);
}

type Flag = 'length' | 'attack' | `t${ItemTier}`;
/** Where a number of the pace came from. */
type Source = 'flag' | 'sim' | 'today';

/** A number for print: at most two decimals. */
const num = (x: number) => String(Number(x.toFixed(2)));

function main(argv: string[]): void {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const flags: Partial<Record<Flag, number>> = {};
  let file: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(length|attack|t\d+)(?:=(.*))?$/.exec(argv[i]);
    if (m && m[1].startsWith('t') && !tierNamed(m[1])) usage(`No tier ${m[1].slice(1)} in the shop: --${m[1]}.`);
    if (m) {
      const raw = m[2] ?? argv[++i];
      const value = Number(raw);
      if (raw === undefined || raw === '' || !Number.isFinite(value) || value < 0) usage(`--${m[1]} needs a number.`);
      flags[m[1] as Flag] = value;
    } else if (argv[i].startsWith('-')) {
      usage(`Unknown option ${argv[i]}.`);
    } else if (file === undefined) {
      file = argv[i];
    } else {
      usage(`One sim report at most (${file} and ${argv[i]}).`);
    }
  }

  const gaps = coverage();
  if (gaps.missing.length || gaps.unknown.length || gaps.misread.length) {
    console.error(`BUDGET is out of step with ITEMS. No entry: ${gaps.missing.join(', ') || 'none'}. No item: ${gaps.unknown.join(', ') || 'none'}. Wrong mode: ${gaps.misread.join(', ') || 'none'}.`);
    process.exit(1);
  }

  let sim: ReportPace = { firstBuy: {} };
  if (file !== undefined) {
    try {
      sim = paceFromReport(JSON.parse(readFileSync(file, 'utf8')));
    } catch (err) {
      console.error(`Cannot read the sim report ${file}: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  const pick = (flag: number | undefined, fromSim: number | undefined, today: number): [number, Source] =>
    flag !== undefined ? [flag, 'flag'] : fromSim !== undefined ? [fromSim, 'sim'] : [today, 'today'];
  const [length, lengthFrom] = pick(flags.length, sim.length, TODAY.length);
  const [attack, attackFrom] = pick(flags.attack, undefined, TODAY.attack);
  const firstBuy = {} as Record<ItemTier, number>;
  const firstFrom = {} as Record<ItemTier, Source>;
  for (const t of TIERS) [firstBuy[t], firstFrom[t]] = pick(flags[`t${t}`], sim.firstBuy[t], TODAY.firstBuy[t]);
  const pace: Pace = { length, firstBuy, attack };

  const rows = ITEMS.map((card) => ({ card, v: verdict(card.id, pace) })).sort((a, b) =>
    ITEM_SLOTS.indexOf(a.card.slot) - ITEM_SLOTS.indexOf(b.card.slot)
    || a.card.tier - b.card.tier
    || a.card.name.localeCompare(b.card.name));

  const out: string[] = [];
  out.push(`# Item budget at ${num(length)} own turns`, '');
  out.push(`Pace: a match of ${num(length)} own turns (${lengthFrom}); a player's first purchase of `
    + TIERS.map((t) => `tier ${t} on own turn ${num(firstBuy[t])} (${firstFrom[t]})`).join(', ')
    + `; an extra attack doubles a swing of ${num(attack)} bullet power (${attackFrom}).`
    + (file !== undefined ? ` Sim report: ${file}.` : ''));
  out.push(`Life: a passive is worn ${TIERS.map((t) => `T${t} ${num(turnsWorn(t, pace))}`).join(' · ')} own turns; `
    + `an active fires that ÷ ${ACTIVE_COOLDOWN.low} (tiers 1–2) or ÷ ${ACTIVE_COOLDOWN.high} (tiers 3 and up), a hard-CC active min(${HARD_CC_CHARGES}, that).`);
  const r1 = (x: number) => x.toFixed(1);
  out.push(`Rates: damage ${r1(DAMAGE)}, heal or shield ${r1(HEAL)}, a stat ${r1(STAT)} a turn held, hard CC ${r1(CC_ACTIVE)} a turn on the Active and ${r1(CC_BENCH)} on the bench, `
    + `an extra attack ${r1(EXTRA_ATTACK * attack)} (${EXTRA_ATTACK} × ${num(attack)}), a soul ${r1(SOUL)}; values to the ${GRAIN} grain. `
    + 'It fits within [price ÷ 2, price × 2]; above that it is underpriced, below it overpriced.', '');
  out.push('| Item | Tab | Tier | Price | Value | Value ÷ price | Verdict |', '|---|---|---:|---:|---:|---:|---|');
  for (const { card, v } of rows) {
    out.push(`| ${card.name} | ${card.slot} | ${card.tier} | ${v.price} | ${v.value.toFixed(1)} | ${v.ratio.toFixed(2)} | ${v.verdict} |`);
  }
  out.push('', '## Verdicts by tier', '', '| Tier | Price | Items | Underpriced | Fits | Overpriced |', '|---:|---:|---:|---:|---:|---:|');
  const count = (list: typeof rows, call: Call) => list.filter((r) => r.v.verdict === call).length;
  for (const t of TIERS) {
    const list = rows.filter((r) => r.card.tier === t);
    out.push(`| ${t} | ${PRICE[t]} | ${list.length} | ${count(list, 'underpriced')} | ${count(list, 'fits')} | ${count(list, 'overpriced')} |`);
  }
  out.push(`| All | | ${rows.length} | ${count(rows, 'underpriced')} | ${count(rows, 'fits')} | ${count(rows, 'overpriced')} |`);
  console.log(out.join('\n'));
}

/** True when this file is the script that was run, not a module another script
 *  imports. vite-node evaluates the file it was given through `executeFile` and
 *  an import through `dependencyRequest`, and the stack of this module's
 *  evaluation shows which came first; run any other way, the script is
 *  process.argv[1]. Asked while the module is evaluated, at its top level. */
function runAsScript(): boolean {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 64;
  const stack = new Error().stack ?? '';
  Error.stackTraceLimit = limit;
  const first = /\b(executeFile|dependencyRequest)\b/.exec(stack)?.[1];
  if (first) return first === 'executeFile';
  const script = process.argv[1];
  return !!script && resolve(script) === fileURLToPath(import.meta.url);
}

if (runAsScript()) main(process.argv.slice(2));
