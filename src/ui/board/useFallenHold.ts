import { useEffect, useRef, useState } from 'react';
import type { FxEvent, GameState } from '@/engine/types';
import { boardWithFallen, fallenHolds, type FallenHold } from './fallenHold';

/**
 * The game for the board to draw: `G` with the heroes a fresh batch shuffled
 * into a deck still in their slots until their knockout has played
 * (fallenHold.ts). Taken on the render the batch arrives, from the game
 * before it (`before`), and let go one by one as each one's time is up.
 * Under calm motion nothing is held.
 */
export function useFallenHold(
  G: GameState,
  freshFx: readonly FxEvent[],
  freshFxKey: number,
  before: GameState | null,
  koCorpse: Record<string, number>,
  calm: boolean,
): GameState {
  const store = useRef<{ key: number; held: { h: FallenHold; until: number; before: GameState }[] }>({ key: 0, held: [] });
  const [, wake] = useState(0);
  // A new batch: its fallen heroes join the held (idempotent per key, so a
  // second render of the same batch adds nothing).
  if (!calm && freshFxKey !== 0 && freshFxKey !== store.current.key && before) {
    store.current.key = freshFxKey;
    const now = performance.now();
    for (const h of fallenHolds(freshFx, before, koCorpse)) {
      store.current.held.push({ h, until: now + h.ms, before });
    }
  }
  const now = performance.now();
  store.current.held = store.current.held.filter((x) => x.until > now);
  const live = store.current.held;
  // Wake when the next one is let go.
  const next = live.length ? Math.min(...live.map((x) => x.until)) : 0;
  useEffect(() => {
    if (!next) return;
    const t = setTimeout(() => wake((n) => n + 1), Math.max(0, next - performance.now()) + 16);
    return () => clearTimeout(t);
  }, [next]);
  if (live.length === 0) return G;
  let out = G;
  for (const x of live) out = boardWithFallen(out, x.before, [x.h]);
  return out;
}
