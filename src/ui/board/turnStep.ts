/**
 * A turn runs Prepare → Battle → Prepare → End Turn, and one button walks
 * it. This is the button's vocabulary, shared by the board (which names the
 * button) and the tutorial (whose gate finds the button by that name).
 */
import type { GameState } from '@/engine/types';
import { battleOwed } from '@/engine/combat';

/** What the turn button does next. */
export type TurnStep = 'battle' | 'end';

/** The turn button's name at each step — its label and its accessible name. */
export const TURN_STEP_LABEL: Record<TurnStep, string> = {
  battle: 'Enter Battle',
  end: 'End Turn',
};

/** The step the local player's turn button is on: open the battle while it
 *  is still ahead, then end the turn. (Turn 1 has no battle, so it ends the
 *  turn outright.) On the rival's turn the button is inert and wears the step
 *  your own next turn opens with. */
export function turnStepFor(G: GameState, isMyTurn: boolean): TurnStep {
  return !isMyTurn || battleOwed(G) ? 'battle' : 'end';
}
