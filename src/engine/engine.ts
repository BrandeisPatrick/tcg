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
import type { AbilityId, CardId, GameState, PlayerID } from './types';
import { blocked } from './legality';
import { assertNoCast } from './castContext';
import { attack } from './actions/attack';
import { activate } from './actions/activate';
import { useSkill } from './actions/useSkill';
import { moveHero, promoteToActive } from './actions/board';
import { chooseActive, discard, placeHero, playCard } from './actions/hand';

/** What `perform` returns for an action that is not allowed (the adapter maps
 *  it to boardgame.io's INVALID_MOVE). */
export const INVALID: unique symbol = Symbol('INVALID');

export type Action =
  // The hand.
  | { type: 'playCard'; cardIid: string; heroIid: string; upgradeId?: CardId }   // an item from the hand onto one of your heroes, for its price
  | { type: 'placeHero'; cardIid: string; toActive?: boolean }                     // a hero from the hand onto the bench (or into an empty Active slot), free
  | { type: 'discard'; cardIids: string[] }                                        // a draw card's discard, from anywhere in the hand
  // The board.
  | { type: 'attack'; targetIid?: string }               // no targetIid = the first of `attackTargets`
  | { type: 'useSkill'; heroIid: string; skillId?: AbilityId; targetIid?: string }   // no skillId = the hero's first skill
  | { type: 'activate'; itemIid: string; targetIid?: string }
  | { type: 'moveHero'; fromSlot: 0 | 1 | 2 | 3; toSlot: 0 | 1 | 2 | 3 }
  // Owed choices, made from either seat.
  | { type: 'chooseActive'; cardIid: string }               // the opening: a hero from the hand into the lane
  | { type: 'promoteToActive'; benchIid: string }
  | { type: 'endTurn' };                         // validity only; the adapter calls events.endTurn()

/** Make `a` as `pid`: INVALID if legality says no (and nothing is touched),
 *  else the action's effects are applied to `G`. */
export function perform(G: GameState, pid: PlayerID, a: Action): typeof INVALID | void {
  assertNoCast();
  if (blocked(G, pid, a) !== null) return INVALID;
  switch (a.type) {
    case 'playCard': return playCard(G, pid, a.cardIid, a.heroIid, a.upgradeId);
    case 'placeHero': return placeHero(G, pid, a.cardIid, a.toActive === true);
    case 'discard': return discard(G, pid, a.cardIids);
    case 'chooseActive': return chooseActive(G, a.cardIid);
    case 'attack': return attack(G, pid, a.targetIid);
    case 'useSkill': return useSkill(G, pid, a.heroIid, a.targetIid, a.skillId);
    case 'activate': return activate(G, pid, a.itemIid, a.targetIid);
    case 'moveHero': return moveHero(G, pid, a.fromSlot, a.toSlot);
    case 'promoteToActive': return promoteToActive(G, a.benchIid);
    case 'endTurn': return; // the adapter ends the turn
  }
}
