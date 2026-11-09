/**
 * Every number the rules are made of, in one place. The engine, the AI, the
 * board and the tutorial all read these, so a balance change is one edit and
 * nothing has to be kept in step by hand. (Card stats live on the cards; this
 * is only the table's own arithmetic.)
 */
import type { ItemTier, StructureKind, UltSize } from './types';

// ---------- Costs and limits ----------

/** Items a hero can wear at once. A full hero takes nothing more except an
 *  upgrade of an item it wears, which takes that item's place. */
export const MAX_ITEMS = 3;

/** The extra slot every hero of a side has once that side's heroes have felled
 *  the enemy Walker (`PlayerState.flexSlot`; `slotCap` in query.ts). */
export const FLEX_SLOT = 1;

/** Hard ceiling on stacked Extra Attacks (a loop backstop, not a balance gate). */
export const MAX_EXTRA_ATTACKS = 6;

// ---------- Souls ----------

/** Souls a player holds before their first turn's income. */
export const SOULS_START = 0;

/** Souls accumulate: nothing refills and nothing is lost at the end of a turn.
 *  At the start of each of a player's own turns (their first included) the
 *  lane pays this much — the only souls there are (docs/deck-plan.md):
 *  knockouts and objectives push the map and give exp, and pay nothing. */
export const LANE_INCOME = 5;

/** Extra souls on the second mover's first income (the pie rule's dial; the
 *  pricing pass may raise it). */
export const SECOND_MOVER_FIRST_INCOME_BONUS = 0;

/** A kill pushes the victim's level plus this into the victim's side's front
 *  structure (`killPush`). It pays no souls. */
export const KILL_BOUNTY_BASE = 1;

// ---------- Items ----------

/** What putting an item on a hero costs, by its tier: Deadlock's 1 : 2 : 4 : 8
 *  ladder (800 to 6,400 souls there, 2 × cost ÷ 800 here), and its tier 5 at
 *  9,999 there, 24 here: 1.5 × tier 4 as 9,999 is 1.56 × 6,400, so an upgrade
 *  over a tier-4 component costs a whole 8. An upgrade played onto the hero
 *  that wears its component costs the difference (it evolves). Net worth
 *  counts every worn item and every item in hand at this price. */
export const PRICE: Readonly<Record<ItemTier, number>> = { 1: 2, 2: 4, 3: 8, 4: 16, 5: 24 };

/** The tiers, cheapest first: PRICE's keys (whole-number keys list in
 *  ascending order). The deck builder's rows, the tier marks, the build
 *  editor and the gallery all walk this list, so a new tier is its
 *  `ItemTier` and its PRICE, and nothing else. */
export const ITEM_TIERS: readonly ItemTier[] = Object.keys(PRICE).map(Number) as ItemTier[];

/** Own turns an active item waits after it is used, and when it is put on:
 *  `low` for tiers 1–2, `high` for tiers 3 and up — unless the card names its
 *  own (`SpellCard.cooldown`: the draw cards' 2). Hard crowd control uses
 *  charges instead. */
export const ACTIVE_COOLDOWN = { low: 2, high: 3 } as const;

/** Uses a hard crowd-control active has per match (no cooldown). */
export const HARD_CC_CHARGES = 2;

/** A hero wearing this many items of one tab gets that tab's category spike:
 *  +1 Bullet Power (Weapon), +1 Spirit Power (Spirit) or +1 max HP (Vitality). */
export const CATEGORY_SPIKE_ITEMS = 3;

// ---------- The deck and the hand ----------

/** Items a deck holds (the deck builder's size, and the one made from the
 *  heroes' builds). The four drafted heroes are shuffled in on top of these. */
export const DECK_SIZE = 16;

/** The most copies of one item a deck may hold. */
export const MAX_COPIES = 4;

/** Cards each player draws before the first turn — at least one of them a
 *  hero when the deck holds one (the Pocket rule: a hand with none swaps a
 *  random card of it for a random hero of the deck). */
export const OPENING_HAND = 5;
/** A drafted match's deal: each side chooses its first Active from its four
 *  drafted heroes, then draws this many from the rest of its deck (the hero
 *  and the draw come to OPENING_HAND). */
export const OPENING_DRAW = OPENING_HAND - 1;

/** Cards drawn at the start of each own turn (the first included). */
export const DRAW_PER_TURN = 1;

/** The most cards a hand holds: a draw into a full hand is skipped (the card
 *  stays in the deck). */
export const MAX_HAND = 10;

// ---------- Abilities ----------

/** Own turns a hero skill waits after use when its data names no `cooldown`
 *  (docs/hero-design.md §2: "then waits 1 turn"): ready again at the start of
 *  the hero's next own turn. A skill costs its own souls (`AbilityDef.souls`,
 *  1–3); a hero's Retreat is its card's `retreat`. */
export const SKILL_COOLDOWN = 1;

/** The level at which a hero's ultimate unlocks. It is a button printed on the
 *  hero card, not a card: used like a skill (it is the hero's one ability that
 *  turn) for its size's souls (`ULT_COST`). */
export const ULT_UNLOCK_LEVEL = 2;

/** Own turns an ultimate waits after use ("then waits 3 turns"): ready again on
 *  the third of its hero's own turns after it. */
export const ULT_COOLDOWN = 3;

/** What an ultimate costs, by its size (docs/hero-design.md §2 and §4): a
 *  small one is worth 4–6 points, a medium one 8–12, a large one 12–18, and a
 *  soul buys about a point. */
export const ULT_COST: Readonly<Record<UltSize, number>> = { small: 4, medium: 8, large: 12 };

// ---------- The map: structures, pushes, the Mid-Boss, the round cap ----------

/** Each side's track, front to back, with its HP: damage goes to the front
 *  standing structure and what is left over carries on to the next. The
 *  Patron falling loses the match. */
export const STRUCTURES: readonly (readonly [kind: StructureKind, hp: number])[] = [['guardian', 4], ['walker', 6], ['patron', 8]];

/** From this round on a push — a kill's or an empty lane's — deals
 *  LATE_PUSH_MULTIPLIER times as much. */
export const LATE_GAME_ROUND = 9;
export const LATE_PUSH_MULTIPLIER = 2;

/** The last round: once both players' own turn ROUND_CAP is over, the side
 *  with more structure HP wins (then the richer side, then the second mover). */
export const ROUND_CAP = 12;

/** The Mid-Boss's card id: no card in the catalogue, a unit of the pit. */
export const BOSS_CARD_ID = 'boss_midboss';
/** The round at whose start the Mid-Boss first rises in the pit. */
export const BOSS_SPAWN_ROUND = 4;
/** The Mid-Boss's HP. */
export const BOSS_HP = 10;
/** What the Mid-Boss hits the hero that attacked it for, at that player's End
 *  step (pure damage; a death from it pays no bounty and pushes nothing). */
export const BOSS_RETALIATION = 2;
/** Rounds after the round it died in that the Mid-Boss rises again. */
export const BOSS_RESPAWN_ROUNDS = 4;
/** The Rejuvenator the taker of the Mid-Boss gets: this many revives, good
 *  through the end of round (the round it was taken + REVIVE_ROUNDS). */
export const REVIVE_CREDITS = 2;
export const REVIVE_ROUNDS = 2;

// ---------- Death ----------

/** Own turns of its owner's a fallen hero waits in its slot (a corpse)
 *  before it goes back to its owner's hand, at full HP with its level and its
 *  items (Patrick, 2026-11-09). 0 sends it straight to the hand. (The
 *  Mid-Boss keeps its own return, BOSS_RESPAWN_ROUNDS.) */
export const RESPAWN_TURNS = 2;

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

// What a level adds is the hero's own: `HeroCard.growth`, its curve's growth
// points (2 a level early, 3 mid, 4 late) split between Attack, HP and Spirit
// (docs/hero-design.md §2).

// ---------- Status stacking caps ----------

/** Bleed stacks additively up to this value. */
export const BLEED_CAP = 3;
/** Djinn's Mark stacks additively up to this value, and the mark that reaches
 *  it detonates them all (Mirage's passive). */
export const DJINN_CAP = 3;
/** Fixation stacks additively up to this value (+1 to Haze's swing per stack). */
export const FIXATION_CAP = 2;
