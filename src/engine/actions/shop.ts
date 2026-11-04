/**
 * The shop step: buying, selling and moving items, then closing the shop.
 * `buyBlocked`, `sellBlocked`, `moveItemBlocked` and `closeShopBlocked`
 * (legality.ts) have said each may be done; these only do it.
 *
 * A card bought goes to its buyer's hand; it is played onto a hero from there
 * (`playCard`, actions/playCard.ts). A worn item's cooldown and charges live
 * on the item, so they travel with it; a passive one's stat bonus sits on the
 * bearer's modifiers while worn. Items stay on through death.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '../types';
import { cardName, itemCard } from '@/cards';
import { findCardOnBoard, findWornItem, handCard, slotCap, wornItems } from '../query';
import { buyPrice, sellRefund } from '../legality';
import { allocatorOf } from '../ids';
import { attachItem, detachItem, makeInstance, syncVitalitySpike } from '../instances';
import { pushLog } from '../log';

/**
 * Buy `itemId` for `pid`: pay `buyPrice` (an upgrade whose component is on
 * its side costs the difference) and the new card goes to the hand, marked
 * with the turn it was bought on and what was paid. No hero is chosen here.
 */
export function buy(G: GameState, pid: PlayerID, itemId: CardId) {
  const data = itemCard(itemId)!;
  const cost = buyPrice(G, pid, itemId);
  const ps = G.players[pid];
  ps.souls -= cost;
  const card = makeInstance(allocatorOf(G), itemId, pid, 'hand');
  card.boughtOnTurn = G.turnNumber;
  card.paid = cost;
  ps.hand.push(card);
  pushLog(G, `P${pid} bought ${data.name} (-${cost} souls).`);
}

/**
 * Put back a component an upgrade consumed this turn, the upgrade being sold
 * on the turn it was bought: onto the hero that wore it, while it has room and
 * wears no copy, else into the hand — and with it, a component it brought
 * along in turn.
 */
function restore(G: GameState, pid: PlayerID, item: CardInstance, fromIid: string | undefined) {
  const found = fromIid ? findCardOnBoard(G, fromIid) : null;
  const hero = found && found.owner === pid ? found.card : undefined;
  if (hero && wornItems(hero).length < slotCap(G, pid) && !wornItems(hero).some((it) => it.cardId === item.cardId)) {
    attachItem(hero, item);
    syncVitalitySpike(hero);
  } else {
    item.zone = 'hand';
    item.attachedTo = undefined;
    // A cooldown does not run in the hand (its play sets it going again), but a
    // hard crowd-control item's charges are its own: they come back with it.
    item.cooldowns = undefined;
    G.players[pid].hand.push(item);
  }
  const inner = item.replaced;
  const innerFrom = item.replacedFrom;
  item.replaced = undefined;
  item.replacedFrom = undefined;
  if (inner) restore(G, pid, inner, innerFrom);
}

/** Sell `pid`'s card `itemIid` — from its hand, or off the hero that wears
 *  it: `sellRefund` comes back, and a worn item's bonus goes with it. An
 *  upgrade sold on the turn it was bought gives back the component its play
 *  consumed. */
export function sell(G: GameState, pid: PlayerID, itemIid: string) {
  const ps = G.players[pid];
  const held = handCard(G, pid, itemIid);
  if (held) {
    const refund = sellRefund(G, held);
    ps.hand = ps.hand.filter((c) => c !== held);
    ps.souls += refund;
    pushLog(G, `P${pid} sold ${cardName(held.cardId)} from the hand (+${refund} souls).`);
    return;
  }
  const { bearer, item } = findWornItem(G, itemIid, pid)!;
  const refund = sellRefund(G, item);
  detachItem(bearer, item);
  syncVitalitySpike(bearer);
  const restored = item.boughtOnTurn === G.turnNumber ? item.replaced : undefined;
  if (restored) restore(G, pid, restored, item.replacedFrom);
  item.replaced = undefined;
  item.replacedFrom = undefined;
  ps.souls += refund;
  pushLog(G, `P${pid} sold ${cardName(item.cardId)} from ${cardName(bearer.cardId)} (+${refund} souls)${restored ? `; ${cardName(restored.cardId)} is back` : ''}.`);
}

/** Move `pid`'s item `itemIid` to its hero `toHeroIid`: its bonus moves with
 *  it, and so do its cooldown and charges. A moved upgrade no longer undoes:
 *  the component it replaced is let go. */
export function moveItem(G: GameState, pid: PlayerID, itemIid: string, toHeroIid: string) {
  const { bearer, item } = findWornItem(G, itemIid, pid)!;
  const to: CardInstance = findCardOnBoard(G, toHeroIid)!.card;
  detachItem(bearer, item);
  attachItem(to, item);
  item.replaced = undefined;
  item.replacedFrom = undefined;
  syncVitalitySpike(bearer);
  syncVitalitySpike(to);
  pushLog(G, `P${pid} moved ${cardName(item.cardId)} from ${cardName(bearer.cardId)} to ${cardName(to.cardId)}.`);
}

/** Close the shop: the turn moves on to its act step. */
export function closeShop(G: GameState) {
  G.step = 'act';
}
