import { createContext, useContext } from 'react';

/**
 * Navigation bridge for the in-match UI. Board lives under boardgame.io's
 * Client, so Root can't hand it props directly — it provides these callbacks
 * via context instead (same React tree, so context flows through fine).
 *
 * `rematch` remounts the match via Root's matchEpoch (no full page reload);
 * `exitToMenu` returns to the title screen.
 */
export interface MatchNav {
  rematch: () => void;
  exitToMenu: () => void;
  /** Back to the tutorial's lesson list. */
  toLessons: () => void;
  /** Start a lesson fresh (the coach's "Next lesson"). */
  startLesson: (id: string) => void;
}

export const MatchNavContext = createContext<MatchNav | null>(null);

export function useMatchNav(): MatchNav | null {
  return useContext(MatchNavContext);
}
