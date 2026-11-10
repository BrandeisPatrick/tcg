/**
 * Which board heroes the armed card, skill, item or attack may be aimed at —
 * the glow on the tiles and the check behind a tap. The engine answers it
 * (`playBlockedAny` / `skillBlocked` / `activateBlocked` / `attackBlocked`,
 * legality.ts): the corpse rule, the ally / rival filters, an item already
 * worn, the slot cap and a Dome are all written there once, so the glow can
 * never offer a hero the engine would refuse. The drag-and-drop path and the
 * tap path both end at the same question.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { findCardOnBoard } from '@/engine/query';
import { activateBlocked, attackBlocked, playBlockedAny, skillBlocked } from '@/engine/legality';
import type { PendingPlay } from '../helpers';

/** True when `card` is a legal target for what the player has armed. A card
 *  from the hand lights the heroes of yours it may go on (a corpse among them,
 *  and a full one, where it goes in place of an item the player then chooses;
 *  not one wearing it already). An armed
 *  attack lights exactly the heroes in `attackTargets` (a hero with reach may
 *  name any living rival that no Dome protects). Nothing is a target while
 *  nothing is armed. */
export function isValidTarget(G: GameState, me: PlayerID, pending: PendingPlay | null, card: CardInstance): boolean {
  if (!pending) return false;
  if (pending.kind === 'playCard') return playBlockedAny(G, me, pending.iid, card.iid) === null;
  // A hero picked up goes in an empty slot, never onto a hero: the wells light instead.
  if (pending.kind === 'placeHero') return false;
  if (pending.kind === 'useSkill') {
    const hero = findCardOnBoard(G, pending.iid);
    return !!hero && hero.owner === me && skillBlocked(G, me, hero.card, card.iid, pending.skillId) === null;
  }
  if (pending.kind === 'attack') {
    // The attack is the Active's own: armed for a hero that is no longer there, nothing glows.
    return G.players[me].active?.iid === pending.iid && attackBlocked(G, me, card.iid) === null;
  }
  return activateBlocked(G, me, pending.iid, card.iid) === null;
}
