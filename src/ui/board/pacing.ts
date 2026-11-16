/**
 * The table's pacing: how long each move holds the board before the next may
 * start. One place, so the reveal overlays, the FX timeline's leads and the
 * AI's rhythm are tuned together (Patrick, 2026-11-15: plays and skills "take
 * too much time", and the rival's card must be seen before its effect).
 *
 * Every move is two phases — its activation, then its effect resolving on the
 * board (fxTimeline.ts). The hold below is when `completeAction` unlocks the
 * table: the activation for your own move (you may already line up the next
 * one while the effect lands), and a little of the resolve as well for the
 * rival's, so its next card is never shown over an effect still landing.
 */
import type { GameActionKind } from '@/engine/types';
import { FX_TIMING } from '../effects/fx/fxCatalog';
import { CARD_REVEAL_MS } from '../effects/CardPlayFlash';

/** The pause between two of the rival's moves, ms (it was 800). */
export const AI_THINK_MS = 450;

/** What of the resolve the rival's move holds for, past its activation, ms:
 *  the bolt's flight and the first impact's beat. */
const RIVAL_RESOLVE_MS = 450;

/** How long a move of `kind` holds the table, ms — `mine` for the local
 *  player's own.
 *   - a card from the hand: the reveal mid-screen (CARD_REVEAL_MS);
 *   - a skill: its flare on the hero's own tile — no overlay, so the hold is
 *     only the charge (yours) or the charge and the bolt (the rival's);
 *   - an ultimate: its name plate, then the strike. */
export function actionHoldMs(kind: GameActionKind, mine: boolean): number {
  if (kind === 'ult') return FX_TIMING.ultLead + 700;
  if (kind === 'item') return CARD_REVEAL_MS + (mine ? 0 : RIVAL_RESOLVE_MS);
  return mine ? FX_TIMING.castCharge + 110 : FX_TIMING.castLead + 90;
}
