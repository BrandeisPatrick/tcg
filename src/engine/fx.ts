/**
 * Board-FX emitter. The engine calls `pushFx` for every visible thing it
 * resolves (a hit, a heal, a status landing, a cast, a revive…) and the match
 * screen's FxLayer plays each new batch as a small choreographed timeline.
 *
 * The events are presentation hints only — nothing in the rules reads them.
 * `seq` comes from `G.counters` (see ids.ts), so it keeps climbing across
 * moves and across the per-turn flush of `G.fx` (turn.onBegin); the UI tracks
 * the high-water mark it has played and never replays an old event after a
 * remount.
 */
import type { CardInstance, FxEvent, FxSource, GameState } from './types';
import { nextFxSeq } from './ids';

/** Omit that distributes over a union (plain Omit collapses the variants). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export function pushFx(G: GameState, ev: DistributiveOmit<FxEvent, 'seq'>): void {
  (G.fx ?? (G.fx = [])).push({ ...ev, seq: nextFxSeq(G) } as FxEvent);
}

/** The board-pointable identity of a unit, or undefined for "nobody". */
export function fxSource(card: CardInstance | null | undefined): FxSource | undefined {
  return card ? { iid: card.iid, cardId: card.cardId, owner: card.ownerId } : undefined;
}
