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

type CardType = 'hero' | 'spell' | 'equipment' | 'ultimate';

export interface BaseCard {
  id: CardId;
  name: string;
  type: CardType;
  rarity: 1 | 2 | 3 | 4;
  text?: string;
}

/** A hero prints no text of its own: its card text is its abilities' (`name`
 *  and `text` on each AbilityDef), read through `heroAbilities` (engine/query.ts). */
export interface HeroCard extends Omit<BaseCard, 'text'> {
  type: 'hero';
  atk: number;
  hp: number;
  /** The skills the hero may use, in order: one or two, none for a passive-only
   *  hero. A bare `useSkill` names `skills[0]`. A hero uses one ability a turn
   *  (a skill or its ultimate). */
  skills: AbilityId[];
  passives?: AbilityId[];
  /** The ultimate's ability id: a kit ability like a skill, unlocked at
   *  ULT_UNLOCK_LEVEL and on its own cooldown. Its card (`ULTIMATES`, the one
   *  whose `abilities[0]` it is) only names and draws it. */
  ult?: AbilityId;
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

/** An ultimate's face: its name, text and art. The ultimate itself is a kit
 *  ability of its hero (`HeroCard.ult`), used from the hero sheet and never
 *  dealt, held or paid for. */
export interface UltimateCard extends BaseCard {
  type: 'ultimate';
  linkedHero: CardId;
  abilities: AbilityId[];
}

export type CardData = HeroCard | SpellCard | EquipmentCard | UltimateCard;

export interface StatusInstance {
  id: StatusId;
  value: number;
  duration: number;
  /** A channel that escalates: `value` climbs by `ramp` after each pulse
   *  (Seven's Storm Cloud marks its `casting` status with 1). Absent on
   *  everything else. */
  ramp?: number;
  /** HP the bearer heals when the status goes off (Last Stand's). Absent on
   *  everything else, and read as 0 where a status that heals does not say. */
  heal?: number;
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
  /** This hero used an ability this turn — a skill or its ultimate. Each hero
   *  uses one a turn; the Active may still make the turn's attack after it. */
  skillUsedThisTurn: boolean;
  /** The ability this hero used this turn (set by `useSkill`, cleared with the
   *  other turn flags): what Echo Shard repeats (a skill only), and which
   *  plate the hero sheet marks USED. Bookkeeping, so the replay trace ignores it. */
  lastSkillUsed?: AbilityId;
  /** Own turns left before each kit ability may be used again: a skill's
   *  `cooldown` (SKILL_COOLDOWN when its data names none), an ultimate's
   *  ULT_COOLDOWN. Present only once an ability has set one: the map is dropped
   *  when it empties. Ticks at the start of the owner's turn (docs/stats-model.md
   *  §1), on a corpse too; a fall and a respawn leave it as it is. */
  cooldowns?: Partial<Record<AbilityId, number>>;
  /** An ultimate this hero may use once, free, as a kit ability: Sinclair's
   *  Audience Participation copies the enemy Active's. Gone once used; it
   *  needs no level and has no cooldown, and it stays through a death. */
  borrowedUlt?: AbilityId;
  /** Per-instance play-cost override. When set, used instead of the card
   *  definition's cost. */
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
  // bearer's attack — see grantExtraAttacks / actions/attack.ts. Each bonus swing
  // re-fires onAttack procs (so Toxic Bullets / Djinn's Mark proc per swing)
  // and bounces again with Ricochet.
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
  /** For a 'skill' action: which of the hero's skills was used (the skill
   *  flash reads its name). */
  abilityId?: AbilityId;
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
 *  basic swing is 'attack' — the engine reports it like everything else, but
 *  the combat choreographer has already walked it from the forecast BEFORE the
 *  engine resolved, so the board skips these events (`walkedByChoreographer`
 *  in ui/effects/fx/fxTimeline.ts). Anything riding on a swing (a tagged proc)
 *  is filed as 'proc'. */
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
  | 'ricochet'       // a Ricochet bounce off the swing to another enemy hero
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
  /** How the hit that met the Shield came about (a basic swing is 'attack'). */
  cast?: FxCastKind;
  source?: FxSource;
}

/** Unstoppable shrugged something off. */
export interface ImmuneFx extends FxBase {
  kind: 'immune';
  iid: string;
  what: 'damage' | StatusId;
  /** For `what: 'damage'`: how the hit that was shrugged off came about. */
  cast?: FxCastKind;
}

/** One swing of the turn's attack, pushed BEFORE that swing's damage so the
 *  stream reads "this swing, then what it did": the hit, the Shield that ate
 *  part of it, the riders and detonations it set off. The forecast reads the
 *  swings back off the real run. */
export interface SwingFx extends FxBase {
  kind: 'swing';
  iid: string;            // the attacker
  targetIid: string;
  /** 0 for the primary swing, 1.. for Extra Attacks. */
  index: number;
  /** The attack power the swing was made with, before the target's mitigation. */
  raw: number;
  /** What the swing carried: 'Extra Attack' on an extra swing, a bonus's own
   *  label (Frenzy's) on a swing whose attack power included one. */
  label?: string;
  /** The target's HP as the swing begins — so HP after a swing is read off the
   *  next one's, riders and detonations included. */
  targetHp: number;
}

/** A cast just happened — pushed BEFORE its effects so the batch reads as
 *  "this caster did the following". `iid` is the casting unit on the board
 *  (the hero for a skill or an ultimate — `cardId` then names the ultimate's
 *  face — the channelling Active for a spell, the bearer for equipment);
 *  absent when nobody's there. */
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

export type FxEvent = HitFx | HealFx | StatusFx | ShieldFx | ImmuneFx | SwingFx | CastFx | ReviveFx | LevelUpFx;

/**
 * Pre-match hero draft. Both players take turns picking 4 heroes each from
 * the full pool in snake order (seat 0 first). While `draft != null` the
 * regular match gates are inactive and the DraftOverlay is displayed. On the
 * 8th pick the move builds both PlayerStates from the drafted heroes, clears
 * `draft` and ends the draft's turn: the first mover (seat 1, the pie rule)
 * opens engine turn 1.
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
  /** The engine turn: both players' turns counted together, 1 the first
   *  mover's first. Own turns and rounds are read off it by rounds.ts. 0 between
   *  the last draft pick and the first turn. */
  turnNumber: number;
  /** The seat that takes the first turn. The pie rule: seat 0 drafts first, so
   *  seat 1 moves first in a drafted match; a scripted match names its own
   *  (seat 0 by default). Read it through `firstMover` (rounds.ts). */
  firstMover: PlayerID;
  /** The seat a person plays, or null when the AI plays both (a sim). Only that
   *  seat is asked who steps up when its Active falls (`pendingPromotion`); every
   *  other seat is promoted on the spot. Seat 0 by default. */
  humanSeat: PlayerID | null;
  log: LogEntry[];
  /** Pre-match hero draft. Null once draft completes. */
  draft: DraftState | null;
  /**
   * Offset between boardgame.io's ctx.turn and the engine turn. The draft
   * uses boardgame.io turns for its snake order, so the match's first turn is
   * a later ctx.turn; `beginTurn` reads `G.turnNumber = ctx.turn -
   * draftTurnsOffset`. Set when the last pick ends the draft's turn.
   */
  draftTurnsOffset: number;
  mulliganPending: boolean;       // true after draft completes until player resolves opening mulligan
  /** The turn's attack has been made. One basic attack a turn per player: this
   *  is its gate, and the attack ends the Act — after it nothing is legal but
   *  `endTurn` (and an owed promotion). Ending the turn never attacks. Reset at
   *  each turn start. */
  attackUsed: boolean;
  /** The turn's Retreat has been made (one a turn). Reset at each turn start. */
  retreatUsed: boolean;
  /** Set by the `resolve` pass when the human seat's Active is a corpse and an
   *  eligible bench hero can step up — a forced promotion is owed, and the UI
   *  asks who (PromotionOverlay), or the auto-play loop answers. Every other
   *  seat is promoted inside `resolve`. Cleared once a promotion lands. */
  pendingPromotion?: PlayerID;
  /** Current resolving action (card play / skill / ult). UI watches this to
   *  trigger the reveal animation and pause further input until the player
   *  has had time to see what just happened. */
  action: GameAction | null;
  /** Transient board-FX stream — hits, heals, statuses, casts, revives…
   *  since the last turn ended. Cleared when a turn's end effects begin (so
   *  after `endTurn` it holds that turn's end and the next turn's start); the UI
   *  plays new entries by tracking the highest `seq` it has seen. */
  fx: FxEvent[];
}
