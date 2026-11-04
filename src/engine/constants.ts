/**
 * Every number the rules are made of, in one place. The engine, the AI, the
 * board and the tutorial all read these, so a balance change is one edit and
 * nothing has to be kept in step by hand. (Card stats live on the cards; this
 * is only the table's own arithmetic.)
 */

// ---------- Costs and limits ----------

/** Souls to swap the Active with a bench hero: the base price. What a Retreat
 *  costs right now is `retreatCost` (legality.ts) — Sprint Boots take a soul
 *  off, a Swift hero's is free. A player retreats at most once a turn, and only
 *  before the turn's attack. */
export const RETREAT_COST = 1;

/** Items a hero can wear at once. A full hero buys nothing more (sell one
 *  first) except an upgrade of an item it wears, which takes that item's place. */
export const MAX_ITEMS = 3;

/** The extra slot every hero of a side has once that side's heroes have felled
 *  the enemy Walker (`PlayerState.flexSlot`; `slotCap` in query.ts). */
export const FLEX_SLOT = 1;

/** Hard ceiling on stacked Extra Attacks (a loop backstop, not a balance gate). */
export const MAX_EXTRA_ATTACKS = 6;

// ---------- Patron and souls ----------

/** Patron HP — the ONLY way it drops is a hero death, which costs the fallen
 *  hero's level (`koPatronDamage` in query.ts, charged in killInPlace), and
 *  the push into an empty lane at the end of a turn (endTurnEffects). */
export const PATRON_HP = 10;

/** Souls a player holds before their first turn's income. */
export const SOULS_START = 0;

/** Souls accumulate: nothing refills and nothing is lost at the end of a turn.
 *  At the start of each of a player's own turns (their first included) the
 *  lane pays this much. */
export const LANE_INCOME = 4;

/** The comeback at income time: a player whose net worth (souls on hand plus
 *  the list price of every item their heroes wear, `netWorth` in query.ts)
 *  trails the rival's by at least the first number gets the second on top of
 *  the lane income. The largest step that applies is paid. */
export const COMEBACK_STEPS: readonly (readonly [behindBy: number, bonus: number])[] = [[8, 1], [16, 2]];

/** Extra souls on the second mover's first income (the pie rule's dial; the
 *  pricing pass may raise it). */
export const SECOND_MOVER_FIRST_INCOME_BONUS = 0;

/** A kill pays the victim's opponent the victim's level plus this. */
export const KILL_BOUNTY_BASE = 1;

/** …and this much more when the victim was strictly the richest hero on the
 *  board (the highest list-price total of worn items among all eight; a tie
 *  pays nothing extra). */
export const RICHEST_BOUNTY_BONUS = 2;

// ---------- The shop ----------

/** What an item costs, by its tier: Deadlock's 1 : 2 : 4 : 8 ladder. An
 *  upgrade bought over its component costs the difference. Net worth counts
 *  every worn item at this price. */
export const PRICE: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 2, 2: 4, 3: 8, 4: 16 };

/** The market's random slice, drawn from the match seed before the draft: per
 *  tab, this many items of each tier (tier 1 is always on sale in full, and the
 *  heroes' signature items join as they are drafted). Fewer when a tier runs short. */
export const MARKET_SLICE: readonly (readonly [tier: 2 | 3 | 4, count: number])[] = [[2, 2], [3, 2], [4, 1]];

/** Own turns an active item waits after it is used, and when it is bought:
 *  `low` for tiers 1–2, `high` for tiers 3–4. Hard crowd control uses charges
 *  instead. */
export const ACTIVE_COOLDOWN = { low: 2, high: 3 } as const;

/** Uses a hard crowd-control active has per match (no cooldown). */
export const HARD_CC_CHARGES = 2;

/** A hero wearing this many items of one tab gets that tab's category spike:
 *  +1 Bullet Power (Weapon), +1 Spirit Power (Spirit) or +1 max HP (Vitality). */
export const CATEGORY_SPIKE_ITEMS = 3;

// ---------- Abilities ----------

/** Own turns a hero skill waits after use when its data names no `cooldown`:
 *  1 is usable every turn, as a skill always was. Abilities cost nothing. */
export const SKILL_COOLDOWN = 1;

/** The level at which a hero's ultimate unlocks. It is a kit ability, not a
 *  card: free, used like a skill (it is the hero's one ability that turn). */
export const ULT_UNLOCK_LEVEL = 2;

/** Own turns an ultimate waits after use. */
export const ULT_COOLDOWN = 3;

// ---------- Turn structure and death ----------

/** Turns a hero takes to respawn after being KO'd. Long enough that death
 *  matters, short enough that you can rebuild. Hero stays in their slot,
 *  greyed-out, while this counts down. */
export const RESPAWN_TURNS = 3;

// ---------- Leveling ----------
// Heroes start at Lv1, climb to Lv4 (cap). Step costs are 5 → 7 → 9 exp
// (cumulative cap 21). Exp is earned in the lane: at the end of the owner's
// turn the Active earns EXP_PER_TURN_ACTIVE and each bench hero
// EXP_PER_TURN_BENCH; attaching equipment and landing a kill blow earn more.
// It persists across respawn.

/** Exp the Active earns at the end of its owner's turn — the lane is where a
 *  hero grows, and where it is at risk. */
export const EXP_PER_TURN_ACTIVE = 2;
/** Exp a bench hero earns at the end of its owner's turn. */
export const EXP_PER_TURN_BENCH = 1;
/** Exp the bearer earns when equipment is attached to it. */
export const EXP_ON_EQUIP = 1;
/** Exp a hero earns for the hit that knocks an enemy out — the highest-value
 *  source, so aggression outpaces standing the turn. */
export const EXP_ON_KILL = 2;

export const LEVEL_THRESHOLDS = [5, 7, 9] as const;
export const START_LEVEL = 1 as const;
export const MAX_LEVEL = 4 as const;

export const LEVEL_ATK_BONUS = 1 as const;
export const LEVEL_HP_BONUS = 1 as const;
// Every hero gains Spirit per level (not just casters) so any hero's skill /
// ultimate scales into the late game — Spirit is a real build axis, no role
// caps. See docs/balance-model.md.
export const LEVEL_SPIRIT_BONUS = 1 as const;

// ---------- Status stacking caps ----------

/** Bleed stacks additively up to this value. */
export const BLEED_CAP = 3;
/** Djinn's Mark stacks additively up to this value (and detonates at it). */
export const DJINN_CAP = 4;
/** Fixation stacks additively up to this value (+1 to the fixed attacker's swing per stack). */
export const FIXATION_CAP = 3;
