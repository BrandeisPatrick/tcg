/**
 * Moving heroes about the board: the swap (a paid Retreat, or a free bench
 * shuffle) and the forced promotion of a bench hero to a fallen Active's slot.
 * `moveBlocked` / `promoteBlocked` (legality.ts) hold the guards.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { RETREAT_COST } from '../constants';
import { pushLog } from '../log';
import { resolve } from '../death';

export function moveHero(G: GameState, pid: PlayerID, fromSlot: 0|1|2|3, toSlot: 0|1|2|3) {
  const ps = G.players[pid];
  const get = (s: 0|1|2|3) => s === 0 ? ps.active : ps.bench[s - 1];
  const set = (s: 0|1|2|3, c: CardInstance | null) => {
    if (s === 0) { ps.active = c; if (c) { c.zone = 'active'; c.slot = 0; } }
    else { ps.bench[s - 1] = c; if (c) { c.zone = 'bench'; c.slot = s; } }
  };
  const a = get(fromSlot)!;
  const b = get(toSlot);
  // Retreat: swapping the Active with a bench hero charges souls (both are alive).
  const isRetreat = (fromSlot === 0 || toSlot === 0) && a && b;
  if (isRetreat) ps.souls -= RETREAT_COST;
  set(fromSlot, b);
  set(toSlot, a);
  a.exhausted = true;
  if (b) b.exhausted = true;
  if (isRetreat) {
    pushLog(G, `P${pid} retreated (-${RETREAT_COST} souls).`);
  } else {
    pushLog(G, `P${pid} swapped bench slots ${fromSlot} <-> ${toSlot}.`);
  }
}

/**
 * Promote a bench hero to Active after the previous Active was KO'd.
 * Free (no Retreat cost) since it's a forced replacement, not a tactical
 * swap. The dying corpse takes the chosen bench hero's slot — that's
 * where it stays greyed-out until its respawn timer hits 0.
 *
 * Callable on EITHER player's turn — your Active can die to the
 * opponent's attack or off a skill they cast, and the engine is
 * still on their turn at that moment. The owning player is derived from
 * the bench iid rather than from `playerID` so the dispatcher's turn
 * context doesn't gate the swap.
 */
export function promoteToActive(G: GameState, benchHeroIid: string) {
  const pid = (['0', '1'] as PlayerID[]).find((p) => G.players[p].bench.some((b) => b != null && b.iid === benchHeroIid))!;
  const ps = G.players[pid];
  const benchIdx = ps.bench.findIndex((b) => b != null && b.iid === benchHeroIid);
  const benchHero = ps.bench[benchIdx]!;
  // Swap: bench hero becomes Active, corpse takes the vacated bench slot.
  const corpse = ps.active!;
  ps.active = benchHero;
  benchHero.zone = 'active';
  benchHero.slot = 0;
  ps.bench[benchIdx] = corpse;
  corpse.zone = 'bench';
  corpse.slot = (benchIdx + 1) as 1 | 2 | 3;
  pushLog(G, `P${pid} promoted ${CARDS_BY_ID[benchHero.cardId]?.name} to Active.`);
  // Re-run the state-based pass so the pendingPromotion flag clears (and any
  // further deaths/promotions settle) before the UI re-reads it.
  resolve(G);
}
