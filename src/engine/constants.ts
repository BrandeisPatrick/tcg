/**
 * Every number the rules are made of, in one place. The engine, the AI, the
 * board and the tutorial all read these, so a balance change is one edit and
 * nothing has to be kept in step by hand. (Card stats live on the cards; this
 * is only the table's own arithmetic.)
 */

// ---------- Costs and limits ----------

/** Soul cost to activate a hero skill. Each hero may use its skill once a
 *  turn, so a full bench can cast several in one turn souls permitting; a hero
 *  that uses its skill gives up the turn's attack, and one that has attacked
 *  cannot use its skill. */
export const SKILL_COST = 1;

/** Souls to swap an Active with a bench hero (Pokémon-flavored). */
export const RETREAT_COST = 2;

/** Max equipment a hero can wear at once. Playing a 4th piece requires the
 *  player to choose one of the existing items to discard. */
export const MAX_EQUIPMENT_PER_HERO = 3;

/** Max cards a player may hold. Draws past this are lost (they fizzle). */
export const MAX_HAND = 7;

/** Hard ceiling on stacked Extra Attacks (a loop backstop, not a balance gate). */
export const MAX_EXTRA_ATTACKS = 6;

// ---------- Patron, souls, drawing ----------

/** Patron HP — the ONLY way it drops is a hero death (flat KO_PATRON_DAMAGE,
 *  in killInPlace). Low because each death is just 1 dmg; tuned via the eval
 *  sim for pacing. */
export const PATRON_HP = 8;

/** Patron HP a side loses each time one of its heroes falls — the only way a
 *  patron is ever damaged. */
export const KO_PATRON_DAMAGE = 1;

export const SOULS_START = 0;

/** The soul ceiling (the refill table tails at it). A KO bounty is capped
 *  here so it can never subtract from a player already at the ceiling. */
export const SOULS_MAX = 10;

/** Refill economy (Hearthstone-style): at the start of each of your turns,
 *  your pool is REFILLED to N — anything banked from last turn is lost. The
 *  ramp climbs 1 → 10 by your 10th turn, then caps. */
export const SOULS_REFILL_TABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const INITIAL_DRAW = 3;
export const DRAW_PER_TURN = 1;

// ---------- Turn structure and death ----------

/** The match turn from which a hero's ultimate may enter its owner's hand. */
export const ULT_UNLOCK_TURN = 5;

/** Turns a hero takes to respawn after being KO'd. Long enough that death
 *  matters, short enough that you can rebuild. Hero stays in their slot,
 *  greyed-out, while this counts down. */
export const RESPAWN_TURNS = 3;

// ---------- Leveling ----------
// Heroes start at Lv1, climb to Lv4 (cap). Step costs are 5 → 7 → 9 exp
// (cumulative cap 21). Exp is earned at the end of the owner's turn (all board
// heroes), on equipment attach, and on a kill blow; it persists across respawn.

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
