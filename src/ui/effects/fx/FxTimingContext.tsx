import { createContext, useContext } from 'react';

/**
 * How long (ms) a card's print should lag the engine while an FX batch plays
 * on it — Board derives both numbers from the fresh batch's timeline
 * (fxTimeline.ts) on the very render the state changes, so HeroSlot can hold
 * its numbers in step with the bolt:
 *
 *   impact  until the first impact lands on the card (HP / BP / Shield /
 *           status chips switch then)
 *   settle  until a KO'd card may take on its corpse look (after the shatter
 *           and the K.O. sticker have played)
 *
 * Both are zero when nothing is in flight for that card.
 */
export interface FxHold {
  impact: number;
  settle: number;
}

export type FxHoldResolver = (iid: string) => FxHold;

export const NO_HOLD: FxHold = { impact: 0, settle: 0 };

export const FxTimingContext = createContext<FxHoldResolver>(() => NO_HOLD);

export function useFxHold(iid: string): FxHold {
  return useContext(FxTimingContext)(iid);
}
