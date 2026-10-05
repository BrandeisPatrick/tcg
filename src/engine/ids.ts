/**
 * The counters that name things, kept in `G` so that a game is its whole
 * state: instance ids, FX sequence numbers and action ids all come from
 * `G.counters`. A simulation runs on a clone of G, so it counts on its own
 * copy and never moves the real game's numbers; two games in one process
 * (tests, the tutorial beside a match) never share a counter either.
 */
import type { Counters, GameState } from './types';

export function newCounters(): Counters {
  return { iid: 1, fx: 0, action: 0 };
}

/** A G built by hand (a test, a mock) may not carry counters yet. */
function countersOf(G: Pick<GameState, 'counters'>): Counters {
  return (G.counters ??= newCounters());
}

/** What a builder needs to name the cards it makes: hands out the next iid. */
export type IidAllocator = (prefix?: string) => string;

/** An allocator over a counter record. Whoever owns the record (`G`, or a
 *  setup that has no G yet) sees the count advance, so a setup that builds
 *  both rosters through one allocator simply keeps the record it counted with. */
export function allocatorFor(counters: Counters): IidAllocator {
  return (prefix = 'i') => `${prefix}${counters.iid++}`;
}

/** An allocator over the counters in `G`, for building cards mid-match. */
export function allocatorOf(G: Pick<GameState, 'counters'>): IidAllocator {
  return allocatorFor(countersOf(G));
}

/** A fresh instance id for a card created mid-match (an ultimate unlocking,
 *  Sinclair's copy). */
export function newIid(G: Pick<GameState, 'counters'>, prefix = 'i'): string {
  return allocatorOf(G)(prefix);
}

/** The next FX event sequence number — monotonic for the whole game, across
 *  the per-turn flush of `G.fx`, so the board can keep a high-water mark. */
export function nextFxSeq(G: Pick<GameState, 'counters'>): number {
  return ++countersOf(G).fx;
}

/** The next `G.action.id`: each play / skill / ult takes one, so the board's
 *  animation driver (keyed on the id) re-fires for back-to-back actions of
 *  the same kind. */
export function nextActionId(G: Pick<GameState, 'counters'>): string {
  return `act-${++countersOf(G).action}`;
}
