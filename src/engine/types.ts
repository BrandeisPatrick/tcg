// Core type model for Deadlock TCG.
// Cards are static data; CardInstance is per-game runtime.

export type CardId = string;
export type AbilityId = string;
export type StatusId = string;
export type PlayerID = '0' | '1';
export type Zone =
  | 'deck'
  | 'hand'
  | 'active'
  | 'bench'
  | 'equipment'
  | 'discard';

export type DamageType = 'attack' | 'spirit' | 'pure';

export type CardType = 'hero' | 'spell' | 'equipment' | 'ultimate';

export interface BaseCard {
  id: CardId;
  name: string;
  type: CardType;
  rarity: 1 | 2 | 3 | 4;
  text?: string;
}

export interface HeroCard extends BaseCard {
  type: 'hero';
  atk: number;
  hp: number;
  skill?: AbilityId;
  passives?: AbilityId[];
  ult?: CardId;
  /** Display name of the hero's skill or passive (e.g., "Willpower", "Fixation").
   *  Rendered as a tag next to the role on the card subtitle so the card text
   *  body can carry just the mechanical effect without a "Role. Name:" prefix. */
  abilityName?: string;
  flags?: { benchOnly?: boolean };
}

export interface SpellCard extends BaseCard {
  type: 'spell';
  abilities: AbilityId[];
  cost?: number;
}

export interface EquipmentCard extends BaseCard {
  type: 'equipment';
  tier: 1 | 2 | 3 | 4;
  abilities?: AbilityId[];
  bonus?: { atk?: number; hp?: number; spirit?: number };
  cost?: number;
  /** Charge-based gear: number of times its reactive trigger fires before the
   *  item is consumed (cooldown→draw family). Omitted for normal equipment. */
  charges?: number;
}

export interface UltimateCard extends BaseCard {
  type: 'ultimate';
  linkedHero: CardId;
  abilities: AbilityId[];
  cost?: number;
}

export type CardData = HeroCard | SpellCard | EquipmentCard | UltimateCard;

export interface StatusInstance {
  id: StatusId;
  value: number;
  duration: number;
  sourceIid?: string;
  /** A channel that escalates: `value` climbs by `ramp` after each pulse
   *  (Seven's Storm Cloud marks its `casting` status with 1). Absent on
   *  everything else. */
  ramp?: number;
}

export interface CardInstance {
  iid: string;
  cardId: CardId;
  ownerId: PlayerID;
  zone: Zone;
  slot?: 0 | 1 | 2 | 3;
  attachedTo?: string;
  attached?: CardInstance[];
  hp: number;
  hpMax: number;
  atkMod: number;
  spiritMod: number;
  statuses: StatusInstance[];
  exhausted: boolean;
  /** This hero used its skill this turn. Each hero may use its skill once a
   *  turn, and a hero that has done so cannot make the turn's attack. */
  skillUsedThisTurn: boolean;
  /** This hero made the turn's attack, so it cannot use its skill this turn
   *  (it keeps the flag if it retreats to the bench afterwards). */
  attackedThisTurn?: boolean;
  /** Per-instance play-cost override. When set, used instead of the card
   *  definition's cost — e.g. Sinclair's free (0-cost) copied ultimate. */
  costOverride?: number;
  /**
   * Charge-based equipment counter (cooldown→draw family). Initialized from the
   * card's `charges` when attached; each qualifying trigger spends one, and the
   * item is consumed (sent to discard) when it hits 0. Undefined for normal gear.
   */
  charges?: number;
  // Multi-attack is modeled via the `extra_attack` STATUS (value = N extra
  // full-power swings queued for this turn). It stacks additively across
  // sources (Active Reload, Burst Fire, Haze's Fixation) and is consumed by the
  // turn's attack — see grantExtraAttacks / resolveAttackPhase. Each bonus swing
  // re-fires onAttack procs (so Ricochet / Toxic Bullets / Djinn's Mark all proc
  // per swing).
  /**
   * Rem's "Lil Helpers" merge: when Rem casts her skill she leaves her bench
   * slot and attaches to an ally as a temporary buff. These live on the Rem
   * card while it sits in the bearer's `attached` list: `remMergeTurnsLeft`
   * counts down at her owner's turn start, and `remMergeHpBuff` is the max-HP
   * she granted (reverted when she detaches). On expiry / bearer death she
   * returns to her bench slot. Undefined for everyone else.
   */
  remMergeTurnsLeft?: number;
  remMergeHpBuff?: number;
  /**
   * Turns remaining until the hero respawns. `> 0` means the hero is currently
   * KO'd and occupying its slot as a corpse (greyed in UI, can't act / be
   * targeted). On reaching 0 the hero returns to life at full HP in the same
   * slot. `undefined` / `0` means alive.
   */
  respawnTurnsLeft?: number;
  /**
   * Hero leveling. Heroes start at level 1 and climb to a cap of 4.
   * Earn exp from three triggers: end of owner's turn (+1 per alive hero),
   * equipping an item (+1 to the bearer), and landing a killing blow (+2 to
   * the killer). Reaching the next per-level threshold (3 → 6 → 9 exp)
   * advances `level` and rolls the surplus into the next bar. Resets to
   * level 1 / 0 exp on death (alongside other corpse cleanup).
   */
  exp?: number;
  level?: 1 | 2 | 3 | 4;
}

export interface PlayerState {
  id: PlayerID;
  hp: number;
  hpMax: number;
  souls: number;
  deck: CardInstance[];
  hand: CardInstance[];
  active: CardInstance | null;
  bench: (CardInstance | null)[]; // length 3
  discard: CardInstance[];
  ultsConsumed: string[]; // ult cardIds that have already entered hand this match
  /** Deck archetype this player drafted (for eval/balance tracking). */
  archetype?: string;
}

export interface LogEntry {
  turn: number;
  text: string;
}

/**
 * One "action" the player or AI just took — drives the matching reveal
 * animation (card-play flash, skill flash, ult flash) and the UI/AI lock that
 * prevents the next move until the animation finishes. State transitions
 * `begin` → `done` via the `completeAction` move once the UI's animation
 * timeout fires. Engine moves do not gate themselves on this — tests bypass
 * the UI and the lock lives at the dispatch layer.
 */
export type GameActionKind = 'play' | 'skill' | 'ult';

export interface GameAction {
  id: string;
  kind: GameActionKind;
  by: PlayerID;
  cardId: CardId;
  state: 'begin' | 'done';
}

// ---------------------------------------------------------------------------
// Board FX stream — everything the match screen animates after the engine has
// resolved it. The engine pushes one event per thing that visibly happened;
// the UI plays each new batch as a small choreographed timeline (a skill's
// flare on the caster, its bolt to the target, the type-coloured impact, the
// status stamps) and holds the stat numbers until the impact lands.
// ---------------------------------------------------------------------------

/** How an effect came about. The FX layer picks its animation family from
 *  this: a skill / spell / ult is a cast (a bolt leaves the caster), a proc is
 *  a passive going off, a tick is a start- or end-of-turn resolution. The
 *  basic swing is 'attack' — the combat choreographer animates it BEFORE the
 *  engine resolves, so the engine never emits an untagged hit for it. */
export type FxCastKind = 'skill' | 'spell' | 'ult' | 'proc' | 'tick' | 'attack';

/** A one-of-a-kind effect signature. Each tag has its own animation in the
 *  FX layer (Djinn's Mark converging and detonating, Bleed dripping, Mystic
 *  Reverb ringing in, a Killing Blow slashing…). Untagged events fall back to
 *  the damage-type family (gunfire / spirit / pure). */
export type FxTag =
  | 'djinns_mark'    // Mirage's mark detonating (at 4 stacks or on expiry)
  | 'bleed'          // start-of-turn Bleed tick
  | 'reverb'         // Mystic Reverb's delayed echo
  | 'naptime'        // Rem's Naptime wake-up burst
  | 'discharge'      // Charged running out → Stun
  | 'execute'        // Shiv's Killing Blow execute
  | 'life_drain'     // Lady Geist's Life Drain hit
  | 'lifesteal'      // healing drawn out of a struck enemy (Bloodscent, Leech…)
  | 'mixed_bullets'  // Wraith's spirit rider on her bullet
  | 'ricochet'       // Ricochet bouncing to the bench
  | 'tesla'          // Tesla Bullets chaining to the bench
  | 'burst'          // Mystic Burst proc after a skill
  | 'channel'        // a channeled ultimate's end-of-turn pulse
  | 'regen'          // start-of-turn regeneration (Abrams, Extra Regen)
  | 'combo'          // Mo & Krill's Combo drain
  | 'siphon';        // Siphon Bullets' max-HP transfer

/** Who caused an effect, as far as the board can point at them. */
export interface FxSource {
  iid: string;
  cardId: CardId;
  owner: PlayerID;
}

interface FxBase {
  /** Monotonic id — the UI tracks a high-water mark to play only new events. */
  seq: number;
}

/** A resolved damage hit (post-resist, post-shield). */
export interface HitFx extends FxBase {
  kind: 'hit';
  iid: string;            // the damaged unit
  amount: number;         // final damage dealt
  type: DamageType;       // 'attack' (bullet) | 'spirit' | 'pure'
  ko: boolean;            // dropped the unit to 0
  cast: FxCastKind;
  source?: FxSource;
  tag?: FxTag;
  /** Tag-specific count — Djinn's Mark stacks that detonated. */
  stacks?: number;
}

export interface HealFx extends FxBase {
  kind: 'heal';
  iid: string;
  amount: number;
  tag?: FxTag;
  /** Where the healing was drawn from (lifesteal) — the motes stream from here. */
  from?: FxSource;
  source?: FxSource;
}

export interface StatusFx extends FxBase {
  kind: 'status';
  iid: string;
  statusId: StatusId;
  /** Resulting magnitude on the unit (after stacking / refresh). */
  value: number;
  duration: number;
  debuff: boolean;
  tag?: FxTag;
  source?: FxSource;
}

/** A Shield ate some or all of a hit. */
export interface ShieldFx extends FxBase {
  kind: 'shield';
  iid: string;
  absorbed: number;
  broken: boolean;        // the shield is gone after this
  type: DamageType;
  source?: FxSource;
}

/** Unstoppable shrugged something off. */
export interface ImmuneFx extends FxBase {
  kind: 'immune';
  iid: string;
  what: 'damage' | StatusId;
}

/** A cast just happened — pushed BEFORE its effects so the batch reads as
 *  "this caster did the following". `iid` is the casting unit on the board
 *  (the hero for a skill, the linked hero for an ult, the channelling Active
 *  for a spell, the bearer for equipment); absent when nobody's there. */
export interface CastFx extends FxBase {
  kind: 'cast';
  castKind: 'skill' | 'spell' | 'ult' | 'equip';
  by: PlayerID;
  cardId: CardId;
  iid?: string;
  targetIid?: string;
}

/** A corpse came back at full HP. */
export interface ReviveFx extends FxBase {
  kind: 'revive';
  iid: string;
}

/** A hero reached a new level. */
export interface LevelUpFx extends FxBase {
  kind: 'levelup';
  iid: string;
  level: number;
}

export type FxEvent = HitFx | HealFx | StatusFx | ShieldFx | ImmuneFx | CastFx | ReviveFx | LevelUpFx;
export type FxKind = FxEvent['kind'];

/**
 * Pre-match hero draft. Both players take turns picking 4 heroes each from
 * the full pool in snake order. While `draft != null` the regular match
 * gates (mulligan, normal moves) are inactive and the DraftOverlay is
 * displayed. On the 8th pick the move finalizes both PlayerStates with the
 * drafted heroes, clears `draft`, and flips `mulliganPending` to true.
 */
export interface DraftState {
  pool: CardId[];                                 // remaining hero ids
  order: PlayerID[];                              // length 8, snake e.g. ['0','1','1','0','0','1','1','0']
  currentIndex: number;                           // 0..order.length
  picks: { '0': CardId[]; '1': CardId[] };        // per-player picks in pick order
}

/** The counters that name things (see ids.ts). They live in G so a game is
 *  its whole state: a simulation on a clone counts on its own copy. */
export interface Counters {
  /** Next instance id number. */
  iid: number;
  /** Last FX event sequence number handed out. */
  fx: number;
  /** Last `G.action` id handed out. */
  action: number;
}

export interface GameState {
  /** Id / FX-seq / action-id counters — see ids.ts. */
  counters: Counters;
  players: { '0': PlayerState; '1': PlayerState };
  turnNumber: number;
  log: LogEntry[];
  /** Pre-match hero draft. Null once draft completes. */
  draft: DraftState | null;
  /**
   * Offset between boardgame.io's ctx.turn and the "real match turn". The
   * draft phase uses boardgame.io turns for snake-order ownership, which
   * inflates ctx.turn by ~5 turns before the match proper starts. This
   * offset is set at the moment of draft completion so that turn.onBegin
   * can compute `realTurn = ctx.turn - draftTurnsOffset` for soul refill +
   * draw rules.
   */
  draftTurnsOffset: number;
  mulliganPending: boolean;       // true after draft completes until player resolves opening mulligan
  /** This turn's attack has been made. A turn is the player's to spend on
   *  cards, skills and a retreat in any order, with at most one attack among
   *  them: the `attack` move, the Active swinging one-way at the rival Active.
   *  Ending the turn never attacks. One attack a turn whoever is Active, so a
   *  hero who steps in after it cannot swing again. Reset at each turn start. */
  attackUsed: boolean;
  /** Set by the `resolve` pass when a player's Active is a corpse and an
   *  eligible bench hero can step up — i.e. a forced promotion is owed. The AI
   *  side is auto-promoted inside `resolve`, so in practice this only flags the
   *  local player ('0'): the UI shows the PromotionOverlay (human) or the
   *  auto-play loop resolves it. Cleared once a promotion lands. */
  pendingPromotion?: PlayerID;
  /** Current resolving action (card play / skill / ult). UI watches this to
   *  trigger the reveal animation and pause further input until the player
   *  has had time to see what just happened. */
  action: GameAction | null;
  /** Transient board-FX stream — hits, heals, statuses, casts, revives…
   *  since the turn began. Cleared at the start of each turn; the UI plays new
   *  entries by tracking the highest `seq` it has seen. */
  fx: FxEvent[];
}
