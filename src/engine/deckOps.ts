/**
 * Deck / hand operations shared between the turn pipeline (game.ts) and
 * card effects (abilities/index.ts). Kept in its own module so abilities can
 * draw cards without importing game.ts (which would be a circular import).
 */
import type { CardInstance, GameState, PlayerID } from './types';
import { CARDS_BY_ID } from '@/cards';
import { pushLog } from './util';

/** Max cards a player may hold. Draws past this are lost (they fizzle). */
export const MAX_HAND = 7;

/**
 * Draw up to `n` cards from the player's deck into hand, respecting MAX_HAND
 * and an empty deck. Returns the number actually drawn (may be < n, or 0 when
 * the hand is full / the deck is empty).
 */
export function drawCards(G: GameState, pid: PlayerID, n: number): number {
  const ps = G.players[pid];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (ps.deck.length === 0 || ps.hand.length >= MAX_HAND) break;
    const card = ps.deck.pop()!;
    card.zone = 'hand';
    ps.hand.push(card);
    pushLog(G, `P${pid} drew ${CARDS_BY_ID[card.cardId]?.name ?? card.cardId}.`);
    drawn++;
  }
  return drawn;
}

/**
 * Detach a spent equipment from its bearer and send it to the owner's discard.
 * Used by charge-based items (the cooldown→draw family) when the last charge is
 * consumed, so the hero's equipment slot frees up instead of holding a dead item.
 */
export function consumeEquipment(G: GameState, bearer: CardInstance, eq: CardInstance): void {
  const arr = bearer.attached;
  if (arr) {
    const idx = arr.findIndex((e) => e.iid === eq.iid);
    if (idx >= 0) arr.splice(idx, 1);
  }
  eq.zone = 'discard';
  eq.attachedTo = undefined;
  G.players[eq.ownerId].discard.push(eq);
  pushLog(G, `${CARDS_BY_ID[eq.cardId]?.name ?? 'Equipment'} spent its last charge and broke.`);
}
