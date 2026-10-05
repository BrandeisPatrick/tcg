import type { GameState } from './types';

/** Append a line to the match log (capped: the oldest lines fall off). */
export function pushLog(G: GameState, text: string) {
  G.log.push({ turn: G.turnNumber, text });
  if (G.log.length > 200) G.log.splice(0, G.log.length - 200);
}
