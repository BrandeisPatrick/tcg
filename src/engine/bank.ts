/**
 * The bank: the souls a side holds, what the lane pays it next and what a kill
 * is worth. Souls accumulate (nothing refills, nothing is lost at a turn's
 * end), so a turn's question is to spend or to keep; this is what the board's
 * bank sheet reads to answer it, and what the turn's Income pays from.
 */
import type { GameState, PlayerID } from './types';
import { LANE_INCOME, ROUND_CAP, SECOND_MOVER_FIRST_INCOME_BONUS } from './constants';
import { bountyAtRound, killBounty, ownTurn, round, secondMover } from './rounds';

/** Souls the lane pays `pid` at the start of its own turn number `own`: the
 *  lane's income, and the second mover's bonus on its first turn. */
export function laneIncome(G: Pick<GameState, 'firstMover'>, pid: PlayerID, own: number): { total: number; seat: number } {
  const seat = pid === secondMover(G) && own === 1 ? SECOND_MOVER_FIRST_INCOME_BONUS : 0;
  return { total: LANE_INCOME + seat, seat };
}

/** What `pid`'s bank holds and what is coming to it. */
export interface BankForecast {
  /** Souls held now. */
  held: number;
  /** What the lane pays at the start of `pid`'s next own turn; 0 when the
   *  round cap leaves it no next turn (`last`). */
  income: number;
  /** What `pid` holds as its next own turn opens if it neither spends nor
   *  earns before then: `held` + `income`. */
  next: number;
  /** What a kill pays its side now (the round in play's bounty). */
  bounty: number;
  /** What a kill pays in the next round; `bounty` again when this is the last. */
  bountyNext: number;
  /** True when `pid` has no own turn left after the one in play (or just
   *  played): the round cap decides the match first. */
  last: boolean;
}

/** `pid`'s bank as the board stands. */
export function bankForecast(G: GameState, pid: PlayerID): BankForecast {
  const held = G.players[pid].souls;
  const nextOwn = ownTurn(G, pid) + 1;
  const last = nextOwn > ROUND_CAP;
  const income = last ? 0 : laneIncome(G, pid, nextOwn).total;
  const r = round(G);
  return {
    held,
    income,
    next: held + income,
    bounty: killBounty(G),
    bountyNext: bountyAtRound(Math.min(ROUND_CAP, Math.max(1, r) + 1)),
    last,
  };
}
