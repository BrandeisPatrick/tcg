/**
 * Moving heroes about the board: the swap (a paid Retreat, or a free bench
 * shuffle), the forced promotion of a bench hero to a fallen Active's slot, and
 * the two free swaps a card's effect makes — a bench hero stepping in for the
 * Active (`swapIntoActive`) or an enemy bench hero dragged to the front
 * (`pullToActive`). `moveBlocked` / `promoteBlocked` (legality.ts) hold the
 * guards of the first two; the effects' helpers check for themselves.
 *
 * Every hero that leaves the Active slot goes through `leaveActive`
 * (lane.ts), which ends what only means something in the lane (Fixation).
 */
import type { CardInstance, GameState, PlayerID, PlayerState } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { RETREAT_COST } from '../constants';
import { pushLog } from '../log';
import { resolve } from '../death';
import { stepInCandidates } from '../query';
import { leaveActive } from '../lane';

export function moveHero(G: GameState, pid: PlayerID, fromSlot: 0|1|2|3, toSlot: 0|1|2|3) {
  const ps = G.players[pid];
  const get = (s: 0|1|2|3) => s === 0 ? ps.active! : ps.bench[s - 1]!;
  const set = (s: 0|1|2|3, c: CardInstance) => {
    if (s === 0) { ps.active = c; c.zone = 'active'; c.slot = 0; }
    else { ps.bench[s - 1] = c; c.zone = 'bench'; c.slot = s; }
  };
  // Two occupied slots trade places (moveBlocked has seen to it).
  const a = get(fromSlot);
  const b = get(toSlot);
  // Retreat: swapping the Active with a bench hero charges souls (both are alive).
  const isRetreat = fromSlot === 0 || toSlot === 0;
  if (isRetreat) {
    ps.souls -= RETREAT_COST;
    leaveActive(G, ps.active!); // the hero standing in the lane steps out of it
  }
  set(fromSlot, b);
  set(toSlot, a);
  a.exhausted = true;
  b.exhausted = true;
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
  leaveActive(G, corpse);
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

/** The name a log line calls a card by. */
const nameOf = (card: CardInstance) => CARDS_BY_ID[card.cardId]?.name ?? card.cardId;

/**
 * Trade the Active of `ps` with `hero`, a bench hero of the same player: the
 * Active goes to the slot `hero` leaves. No souls, and neither hero is
 * exhausted (a free swap, not a Retreat). Only a hero who could take the front
 * at all comes — alive and not bench-only, the `stepInCandidates` list — and a
 * player with no Active has nobody to trade with: otherwise it says nothing,
 * touches nothing and tells the caller (false). `say` words the log line from
 * the two names; null logs nothing.
 */
function swapWithActive(
  G: GameState, ps: PlayerState, hero: CardInstance, say: ((hero: string, active: string) => string) | null,
): boolean {
  const active = ps.active;
  const slotIdx = ps.bench.findIndex((b) => b != null && b.iid === hero.iid);
  if (!active || slotIdx < 0 || !stepInCandidates(ps).some((b) => b.iid === hero.iid)) return false;
  const stepsIn = ps.bench[slotIdx]!; // the card on the board, whatever copy of it the caller holds
  leaveActive(G, active);
  ps.active = stepsIn;
  stepsIn.zone = 'active';
  stepsIn.slot = 0;
  ps.bench[slotIdx] = active;
  active.zone = 'bench';
  active.slot = (slotIdx + 1) as 1 | 2 | 3;
  if (say) pushLog(G, say(nameOf(stepsIn), nameOf(active)));
  return true;
}

/**
 * A bench hero of `ps` steps into the Active slot, free: the Active takes the
 * slot it leaves (Mirage's Traveler). `leaveActive` runs for the hero who steps
 * out, and the log says "X steps in for Y." — pass `quiet` when the card's own
 * line already tells it. Returns whether the swap was made: it is not for a
 * hero who is not on `ps`'s bench, a fallen one, a bench-only one (Rem), or a
 * board with no Active.
 */
export function swapIntoActive(G: GameState, ps: PlayerState, hero: CardInstance, opts: { quiet?: boolean } = {}): boolean {
  return swapWithActive(G, ps, hero, opts.quiet ? null : (h, a) => `${h} steps in for ${a}.`);
}

/**
 * The same swap on the rival's board: `benchHero`, on `victimPs`'s bench, is
 * dragged to the front and that player's Active takes its slot. `leaveActive`
 * runs for the Active it replaces; the log says "X is dragged to the front."
 * Returns whether it was made, on the same terms as `swapIntoActive`.
 */
export function pullToActive(G: GameState, victimPs: PlayerState, benchHero: CardInstance): boolean {
  return swapWithActive(G, victimPs, benchHero, (h) => `${h} is dragged to the front.`);
}
