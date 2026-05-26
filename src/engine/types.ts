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
  | 'discard'
  | 'secret';

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
  flags?: { longRange?: boolean; benchOnly?: boolean };
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
  skillUsedThisTurn: boolean;
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
  secret: CardInstance[];
  ultsConsumed: string[]; // ult cardIds that have already entered hand this match
  /** Whether this player has already used a hero skill this turn (max 1 skill per player per turn). */
  skillUsedThisTurn: boolean;
  /** Heroes waiting to come back to the bench after being KO'd. */
  respawning: RespawnEntry[];
}

export interface RespawnEntry {
  card: CardInstance;     // fresh-state hero (full HP, no statuses)
  turnsLeft: number;      // ticks down at the start of each turn
}

export interface PendingSelector {
  movingPlayer: PlayerID;
  abilityId: AbilityId;
  sourceIid?: string;
  filter: 'enemyBoard' | 'allyBoard' | 'enemyAny' | 'allyAny' | 'anyBoard' | 'enemyHero' | 'allyHero';
  prompt: string;
}

export interface LogEntry {
  turn: number;
  text: string;
}

export interface QueuedItem {
  kind: 'ability' | 'attack' | 'secret' | 'callback';
  effectId: string;
  params?: Record<string, unknown>;
  sourceIid?: string;
  targetIid?: string;
  priority: number;
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

export interface ShopState {
  forPlayer: PlayerID;
  round: 1 | 2 | 3;
  visit: 1 | 2 | 3 | 4;
  choices: CardId[];
}

export interface GameState {
  players: { '0': PlayerState; '1': PlayerState };
  turnNumber: number;
  selector: PendingSelector | null;
  resolveQueue: QueuedItem[];
  log: LogEntry[];
  rngSeed?: string;
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
  /** Current resolving action (card play / skill / ult). UI watches this to
   *  trigger the reveal animation and pause further input until the player
   *  has had time to see what just happened. */
  action: GameAction | null;
  /** Street Brawl shop. When non-null the player must pick before acting. */
  shop: ShopState | null;
}
