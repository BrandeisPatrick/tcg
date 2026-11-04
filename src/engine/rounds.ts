/**
 * Counting turns. `G.turnNumber` is the engine turn: both players' turns
 * counted together, 1 being the first mover's first. An own turn is one
 * player's turn, and round r holds both players' r-th own turns: the first
 * mover's own turn r is engine turn 2r − 1, the second mover's is 2r. Every
 * rule that counts own turns or rounds reads them here, never off the engine
 * turn by hand: who moved first is a fact of the match (`G.firstMover`, the
 * pie rule's seat 1 in a drafted match), not always seat 0.
 */
import type { GameState, PlayerID } from './types';

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
