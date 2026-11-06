/**
 * Counting turns. `G.turnNumber` is the engine turn: both players' turns
 * counted together, 1 being the first mover's first. An own turn is one
 * player's turn, and round r holds both players' r-th own turns: the first
 * mover's own turn r is engine turn 2r − 1, the second mover's is 2r. Every
 * rule that counts own turns or rounds reads them here, never off the engine
 * turn by hand: who moved first is a fact of the match (`G.firstMover`, the
 * pie rule's seat 1 in a drafted match), not always seat 0. The map's clocks
 * live here too: the late game, the respawn bands, the Mid-Boss's return, the
 * Rejuvenator's window and the round cap.
 */
import type { GameState, PlayerID } from './types';
import {
  BOSS_RESPAWN_ROUNDS, LATE_GAME_ROUND, LATE_PUSH_MULTIPLIER, RESPAWN_BY_ROUND, REVIVE_ROUNDS, ROUND_CAP,
} from './constants';

/** The seat that took the first turn. */
export function firstMover(G: Pick<GameState, 'firstMover'>): PlayerID {
  return G.firstMover ?? '0';
}

/** The seat that moves second. */
export function secondMover(G: Pick<GameState, 'firstMover'>): PlayerID {
  return firstMover(G) === '0' ? '1' : '0';
}

/** The round in play: both players' r-th own turns make round r (0 before
 *  the first turn). It is also the own turn of whoever is moving now. */
export function round(G: Pick<GameState, 'turnNumber'>): number {
  return Math.max(0, Math.ceil((G.turnNumber ?? 0) / 2));
}

/** How many own turns `pid` has begun by the engine turn in play: the first
 *  mover's count is ceil(T / 2), the second mover's floor(T / 2). On a
 *  player's own turn it is the number of that turn (1 on their first). */
export function ownTurn(G: Pick<GameState, 'turnNumber' | 'firstMover'>, pid: PlayerID): number {
  const t = Math.max(0, G.turnNumber ?? 0);
  return pid === firstMover(G) ? Math.ceil(t / 2) : Math.floor(t / 2);
}

/** The seat whose turn it is: the first mover's on odd engine turns, the
 *  second mover's on even ones; null before the first turn (the draft). */
export function seatToMove(G: Pick<GameState, 'turnNumber' | 'firstMover'>): PlayerID | null {
  const t = G.turnNumber ?? 0;
  if (t < 1) return null;
  return t % 2 === 1 ? firstMover(G) : secondMover(G);
}

// ---------- The map's clocks ----------

type Clock = Pick<GameState, 'turnNumber'>;

/** The engine turns a match runs at most: both players' own turns of every
 *  round up to ROUND_CAP (the round cap decides it as the last one ends).
 *  The drivers' guard against a runaway match, which no match reaches. */
export const MATCH_TURNS = 2 * ROUND_CAP;

/** True from round LATE_GAME_ROUND on: the late game, when pushes double. */
export function lateGame(G: Clock): boolean {
  return round(G) >= LATE_GAME_ROUND;
}

/** What a push made now is multiplied by: LATE_PUSH_MULTIPLIER in the late
 *  game, else 1. */
export function pushMultiplier(G: Clock): number {
  return lateGame(G) ? LATE_PUSH_MULTIPLIER : 1;
}

/** Own turns a hero that falls now waits in its slot before it respawns, by
 *  the round in play (RESPAWN_BY_ROUND) — before the richest hero's penalty. */
export function respawnTurns(G: Clock): number {
  const r = round(G);
  let turns = RESPAWN_BY_ROUND[0][1];
  for (const [from, n] of RESPAWN_BY_ROUND) if (r >= from) turns = n;
  return turns;
}

/** The round at whose start the Mid-Boss rises again when it dies now. */
export function bossReturnRound(G: Clock): number {
  return round(G) + BOSS_RESPAWN_ROUNDS;
}

/** The last round a Rejuvenator taken now is good through: it lapses as that
 *  round ends. */
export function reviveLastRound(G: Clock): number {
  return round(G) + REVIVE_ROUNDS;
}

/** True when the turn `pid` is ending is the last of its round: the second
 *  mover's. */
export function endsRound(G: Pick<GameState, 'firstMover'>, pid: PlayerID): boolean {
  return pid === secondMover(G);
}

/** True when the turn `pid` is ending closes round ROUND_CAP (or a later
 *  one): the match is then decided on what stands. */
export function endsLastRound(G: Pick<GameState, 'turnNumber' | 'firstMover'>, pid: PlayerID): boolean {
  return endsRound(G, pid) && round(G) >= ROUND_CAP;
}
