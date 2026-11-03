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
 * A hero that takes the slot by a move its player chose — the Retreat, or a
 * card's `swapIntoActive` — sets off what it wears that listens for
 * `onBearerStepIn` (Kinetic Dash); a promotion off a fallen Active and a drag
 * to the front (`pullToActive`) do not.
 */
import type { CardInstance, GameState, PlayerID, PlayerState } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { pushLog } from '../log';
import { resolve } from '../death';
import { retreatCost } from '../legality';
import { stepInCandidates } from '../query';
import { leaveActive } from '../lane';
import { fireTriggers } from '../triggers';

/** Swap the heroes in two slots. With the Active on one side it is a Retreat:
 *  it charges `retreatCost` (read before the swap, off the hero leaving),
 *  spends that hero's Swift, and the hero stepping in sets off its
 *  `onBearerStepIn` gear. Between two bench slots it is a free shuffle. */
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
  const cost = isRetreat ? retreatCost(G, pid) : 0;
  if (isRetreat) {
    const leaving = ps.active!;
    ps.souls -= cost;
    // A Swift hero's free Retreat is the one it spends.
    leaving.statuses = leaving.statuses.filter((s) => s.id !== 'swift');
    leaveActive(G, leaving); // the hero standing in the lane steps out of it
  }
  set(fromSlot, b);
  set(toSlot, a);
  a.exhausted = true;
  b.exhausted = true;
  if (isRetreat) {
    pushLog(G, `P${pid} retreated (${cost > 0 ? `-${cost} soul${cost === 1 ? '' : 's'}` : 'free'}).`);
    fireTriggers(G, ps.active!, 'onBearerStepIn', { reaction: true });
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
 * slot it leaves (Warp Stone, Rescue Beam, Majestic Leap, Mirage's Traveler).
 * `leaveActive` runs for the hero who steps out, the hero who steps in sets off
 * its `onBearerStepIn` gear (Kinetic Dash), and the log says "X steps in for
 * Y." — pass `quiet` when the card's own line already tells it. The swap is
 * free, so it neither costs souls nor spends a Swift. Returns whether it was
 * made: it is not for a hero who is not on `ps`'s bench, a fallen one, a
 * bench-only one (Rem), or a board with no Active.
 */
export function swapIntoActive(G: GameState, ps: PlayerState, hero: CardInstance, opts: { quiet?: boolean } = {}): boolean {
  const swapped = swapWithActive(G, ps, hero, opts.quiet ? null : (h, a) => `${h} steps in for ${a}.`);
  // The player chose this move: the hero who stepped in sets off its step-in gear.
  if (swapped) fireTriggers(G, ps.active!, 'onBearerStepIn', { reaction: true });
  return swapped;
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
