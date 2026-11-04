/**
 * Paying souls — the one way a side gains them outside its income: a kill's
 * bounty, a felled Guardian, the Mid-Boss, Golden Goose Egg. A leaf, so the
 * map (map.ts) and death (death.ts) can both pay without importing each other.
 */
import type { GameState, PlayerID } from './types';
import { pushLog } from './log';

/**
 * Give `pid` `n` souls. Souls accumulate with no ceiling, and a payment never
 * subtracts (a negative `n` pays nothing). The log says what was gained
 * (nothing is logged when nothing was) and why. Returns the souls gained.
 */
export function awardSouls(G: GameState, pid: PlayerID, n: number, reason?: string): number {
  const gained = Math.max(0, Math.floor(n));
  G.players[pid].souls += gained;
  if (gained > 0) pushLog(G, `P${pid} +${gained} Souls${reason ? ` (${reason})` : ''}.`);
  return gained;
}
