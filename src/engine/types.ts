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
  tier: 1 | 2 | 3;
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

export interface GameState {
  players: { '0': PlayerState; '1': PlayerState };
  turnNumber: number;
  selector: PendingSelector | null;
  resolveQueue: QueuedItem[];
  log: LogEntry[];
  rngSeed?: string;
  mulliganPending: boolean;       // true at game start until player resolves opening mulligan
}
