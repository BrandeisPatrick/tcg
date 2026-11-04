/**
 * Which board heroes the armed skill, item or attack may be aimed at — the glow
 * on the tiles and the check behind a tap. The engine answers it
 * (`skillBlocked` / `activateBlocked` / `attackBlocked`, legality.ts): the
 * corpse rule, the ally / rival filters and a Dome are all written there once,
 * so the glow can never offer a hero the engine would refuse.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { findCardOnBoard } from '@/engine/query';
import { activateBlocked, attackBlocked, skillBlocked } from '@/engine/legality';
import type { PendingPlay } from '../helpers';

/** True when `card` is a legal target for what the player has armed. An armed
 *  attack lights exactly the heroes in `attackTargets` (a hero with reach may
 *  name any living rival that no Dome protects). Nothing is a target while
 *  nothing is armed. */
export function isValidTarget(G: GameState, me: PlayerID, pending: PendingPlay | null, card: CardInstance): boolean {
  if (!pending) return false;
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
