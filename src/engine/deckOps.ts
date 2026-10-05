/**
 * Deck / hand operations shared between the turn pipeline (actions/turn.ts)
 * and card effects (abilities/index.ts). Kept in its own module so abilities
 * can draw cards without importing the turn pipeline (a circular import).
 */
import type { CardInstance, GameState, PlayerID } from './types';
import { CARDS_BY_ID, getCard } from '@/cards';
import type { IidAllocator } from './ids';
import { pushLog } from './log';
import { MAX_HAND } from './constants';

/** A fresh card of `cardId`, named by `ids` (see ids.ts). */
export function makeInstance(ids: IidAllocator, cardId: string, ownerId: PlayerID, zone: CardInstance['zone'], slot?: 0|1|2|3): CardInstance {
  const data = getCard(cardId);
  const hp = data.type === 'hero' ? data.hp : 0;
  const isHero = data.type === 'hero';
  return {
    iid: ids(),
    cardId,
    ownerId,
    zone,
    slot,
    attachedTo: undefined,
    attached: [],
    hp,
    hpMax: hp,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
    attackedThisTurn: false,
    // Hero leveling: start at Lv1 with 0 exp.
    ...(isHero ? { exp: 0, level: 1 as const } : {}),
  };
}

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
