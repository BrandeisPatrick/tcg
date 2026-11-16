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

/** The bank: souls accumulate. Nothing refills and nothing is lost at the end
 *  of a turn. At the start of each of a player's own turns (their first
 *  included) the lane pays this much: the price of one tier-1 item, as
 *  Pokémon TCG Pocket's Energy Zone gives one Energy a turn. The rest comes
 *  from kills (`killBounty`, rounds.ts). The reasoning is in
 *  docs/balance-model.md §7. */
export const LANE_INCOME = 2;

/** Extra souls on the second mover's first income (the pie rule's dial; the
 *  pricing pass may raise it). */
export const SECOND_MOVER_FIRST_INCOME_BONUS = 0;

/** A kill pays the killer's side 1 soul, and 1 more for every this many
 *  rounds the match has run (`bountyAtRound`, rounds.ts): 1 in rounds 1–2, 6
 *  in rounds 11–12. Little early, a lot late, as Deadlock's own bounty grows
 *  with the clock (docs/balance-model.md §7). */
export const KILL_BOUNTY_STEP_ROUNDS = 2;

/** A kill pushes the victim's level plus this into the victim's side's front
 *  structure (`killPush`). */
export const KILL_PUSH_BASE = 1;

// ---------- Items ----------

/** What putting an item on a hero costs, by its tier: Deadlock's 1 : 2 : 4 : 8
 *  ladder (800 to 6,400 souls there, cost ÷ 800 here), and its tier 5 at
 *  9,999 there, 12 here: 1.5 × tier 4 as 9,999 is 1.56 × 6,400. Half what it
 *  was until 2026-11-16 (Patrick: "equipment and spells, they're too
 *  expensive"; it was 2 / 4 / 8 / 16 / 24): a soul now buys SOUL_POINTS
 *  points of the budget, so a tier's budget in points is unchanged. An
 *  upgrade played onto the hero that wears its component costs the
 *  difference (it evolves). Net worth counts every worn item and every item
 *  in hand at this price. */
export const PRICE: Readonly<Record<ItemTier, number>> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 12 };

/** Points of the card budget one soul buys (docs/balance-model.md §12): 2
 *  since 2026-11-16, when prices halved; 1 before. A tier's budget in points
 *  is its price × this: 2 / 4 / 8 / 16 / 24. */
export const SOUL_POINTS = 2;

/** The tiers, cheapest first: PRICE's keys (whole-number keys list in
 *  ascending order). The deck builder's rows, the tier marks, the build
 *  editor and the gallery all walk this list, so a new tier is its
 *  `ItemTier` and its PRICE, and nothing else. */
export const ITEM_TIERS: readonly ItemTier[] = Object.keys(PRICE).map(Number) as ItemTier[];

/** A hero wearing this many items of one tab gets that tab's category spike:
 *  +1 Bullet Power (Weapon), +1 Spirit Power (Spirit) or +1 max HP (Vitality). */
export const CATEGORY_SPIKE_ITEMS = 3;

// ---------- The deck and the hand ----------

/** Items a deck holds (the deck builder's size, and the one made from the
 *  heroes' builds). The four drafted heroes are shuffled in on top of these. */
export const DECK_SIZE = 16;

/** The heroes a side drafts for a match (Patrick, 2026-11-16: 3, down from 4).
 *  The board keeps its four spots — the Active and three on the bench — so a
 *  full squad leaves one free for a unit (a Ghoul, a Gravestone). */
export const SQUAD_SIZE = 3;

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

/** Counterspell (docs/card-design.md, "Counters"): the turns of its owner the
 *  shield stays up for unless it is triggered first, and the HP its hero heals
 *  when it stops a card. */
export const COUNTERSPELL_TURNS = 2;

/** Flight (Vindicta's ultimate; docs/hero-design.md): the turns she flies, and
 *  the odds a hit on a flying hero misses — 1 in this many. */
export const FLIGHT_TURNS = 3;
export const FLIGHT_DODGE_IN = 3;
export const COUNTERSPELL_HEAL = 4;

// ---------- Abilities ----------
// A kit ability costs no souls (Patrick, 2026-11-15): souls buy the deck's
// cards, spells and equipment alike. A skill is paid for in turns (its wait,
// some with charges), an ultimate in turns too, one a turn for a side.
// The reasoning is in docs/balance-model.md §8.

/** Own turns a hero skill waits after use when its data names no `cooldown`:
 *  used on one turn, it is ready again on the hero's third own turn after.
 *  With three skills on a side that is about one a turn. The heavier skills
 *  (the five that cost 3 souls before: area damage with a rider, or a turn
 *  denied) name 4 (`AbilityDef.cooldown`). A charged skill
 *  (`AbilityDef.charges`) holds that many uses, and its wait brings them back
 *  one at a time. A hero's Retreat is its card's `retreat`, in souls. */
export const SKILL_COOLDOWN = 3;

/** How many times a hero's own skill or passive counts its Spirit Power
 *  (docs/balance-model.md §10, 2026-11-16). A point of Attack pays on every
 *  swing; a point of Spirit pays only when the skill goes off, every 3 or 4
 *  turns since skills wait (§8). Counted twice there, a level's Spirit is
 *  worth about what a level's Attack is. Ultimates and spells count it once:
 *  their pace did not change. A `{sp:N}` in a skill or passive prints
 *  N + 2 × Spirit. */
export const SKILL_SPIRIT_RATE = 2;

/** The level at which a hero's ultimate unlocks: 3 since 2026-11-16 (Patrick:
 *  "ultimate should be level 3 unlock"; it was 2). It is a button printed on
 *  the hero card, not a card: used like a skill (it is the hero's one ability
 *  that turn), for no souls, one ultimate a turn for its side. */
export const ULT_UNLOCK_LEVEL = 3;

/** Own turns an ultimate waits, by its size (docs/hero-design.md §2 and §4: a
 *  small one is worth 4–6 points, a medium one 8–12, a large one 12–18): after
 *  each use, and from the match's first turn — an ultimate starts the match
 *  on its wait, as an active item starts on its cooldown. So a small one is
 *  first ready on its side's turn 4, a medium one on turn 6, a large one on
 *  turn 8, each with its hero at ULT_UNLOCK_LEVEL. A charged ultimate
 *  (`UltimateCard.charged`) has no opening wait — the damage it needs is
 *  that — and waits its size's turns after a use like the rest. */
export const ULT_WAIT: Readonly<Record<UltSize, number>> = { small: 4, medium: 6, large: 8 };

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

/** Whether a match has the Mid-Boss at all. Off for now (Patrick,
 *  2026-11-09: "remove the mid boss mechanics for now"): no boss rises,
 *  nothing counts down to it, and no reward or event names it. Every line of
 *  it is kept — turning this on brings it back, and a match (or a test) may
 *  turn it on for itself (`GameState.midBoss`, `StorySetup.midBoss`,
 *  `MatchConfig.midBoss`). */
export const MID_BOSS_ENABLED = false;
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
