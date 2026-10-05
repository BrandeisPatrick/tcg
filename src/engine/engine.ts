/**
 * The engine's front door. `perform` takes one action by one player, asks
 * legality whether it may be made, and only then changes anything — so an
 * action that is not allowed leaves `G` exactly as it was (the old moves could
 * discard a replaced item and then fail). The boardgame.io adapter (game.ts),
 * the forecast and the tests all go through here.
 *
 * Importing this module loads the card behaviour (`src/abilities`), which
 * registers itself with the engine (registry.ts), so anything that performs an
 * action has the cards.
 */
import '@/abilities';
import type { GameState, PlayerID } from './types';
import { blocked } from './legality';
import { assertNoCast } from './castContext';
import { attack } from './actions/attack';
import { playCard } from './actions/playCard';
import { useSkill } from './actions/useSkill';
import { moveHero, promoteToActive } from './actions/board';

/** What `perform` returns for an action that is not allowed (the adapter maps
 *  it to boardgame.io's INVALID_MOVE). */
export const INVALID: unique symbol = Symbol('INVALID');

export type Action =
  | { type: 'attack' }
  | { type: 'useSkill'; heroIid: string; targetIid?: string }
  | { type: 'playCard'; cardIid: string; targetIid?: string; discardIid?: string }
  | { type: 'moveHero'; fromSlot: 0 | 1 | 2 | 3; toSlot: 0 | 1 | 2 | 3 }
  | { type: 'promoteToActive'; benchIid: string }
  | { type: 'endTurn' };                         // validity only; the adapter calls events.endTurn()

/** Make `a` as `pid`: INVALID if legality says no (and nothing is touched),
 *  else the action's effects are applied to `G`. */
export function perform(G: GameState, pid: PlayerID, a: Action): typeof INVALID | void {
  assertNoCast();
  if (blocked(G, pid, a) !== null) return INVALID;
  switch (a.type) {
    case 'attack': return attack(G, pid);
    case 'useSkill': return useSkill(G, pid, a.heroIid, a.targetIid);
    case 'playCard': return playCard(G, pid, a.cardIid, a.targetIid, a.discardIid);
    case 'moveHero': return moveHero(G, pid, a.fromSlot, a.toSlot);
    case 'promoteToActive': return promoteToActive(G, a.benchIid);
    case 'endTurn': return; // the adapter ends the turn
  }
}
