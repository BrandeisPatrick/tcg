/**
 * The shop step: buying, selling and moving items, then closing the shop.
 * `buyBlocked`, `sellBlocked`, `moveItemBlocked` and `closeShopBlocked`
 * (legality.ts) have said each may be done; these only do it.
 *
 * An item goes on at once. An active one starts on its full cooldown — or,
 * hard crowd control, with HARD_CC_CHARGES uses — and its cooldown and charges
 * live on the item, so they travel with it. A passive one's stat bonus sits on
 * the bearer's modifiers while worn. Items stay on through death.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '../types';
import { cardName, itemCard } from '@/cards';
import { activeCooldown, findCardOnBoard, findWornItem, isRespawning } from '../query';
import { buyPrice, sellRefund, upgradeComponent } from '../legality';
import { allocatorOf } from '../ids';
import { attachItem, detachItem, makeInstance, syncVitalitySpike } from '../instances';
import { grantExp } from '../expSystem';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { EXP_ON_EQUIP, HARD_CC_CHARGES } from '../constants';

/**
 * Buy `itemId` for `pid`'s hero `heroIid`: pay `buyPrice` and put it on. An
 * upgrade of an item the hero wears replaces it (kept aside for this turn, so
 * selling the upgrade back now undoes the purchase). The hero earns
 * EXP_ON_EQUIP the first time it wears this item, not again for buying it back.
 */
export function buy(G: GameState, pid: PlayerID, itemId: CardId, heroIid: string) {
  const hero = findCardOnBoard(G, heroIid)!.card;
  const data = itemCard(itemId)!;
  const cost = buyPrice(hero, itemId);
  const component = upgradeComponent(hero, itemId);
  G.players[pid].souls -= cost;
  if (component) detachItem(hero, component);

  const item = makeInstance(allocatorOf(G), itemId, pid, 'equipment');
  item.boughtOnTurn = G.turnNumber;
  item.paid = cost;
  if (component) item.replaced = component;
  if (data.type === 'spell') {
    if (data.hardCC) item.charges = HARD_CC_CHARGES;
    else item.cooldowns = { [itemId]: activeCooldown(hero, data.tier) };
  }
  attachItem(hero, item);
  syncVitalitySpike(hero);

  pushLog(G, component
    ? `P${pid} upgraded ${cardName(hero.cardId)}'s ${cardName(component.cardId)} to ${data.name} (-${cost} souls).`
    : `P${pid} bought ${data.name} for ${cardName(hero.cardId)} (-${cost} souls).`);
  pushFx(G, { kind: 'cast', castKind: 'equip', by: pid, cardId: itemId, iid: hero.iid, targetIid: hero.iid });
  if (!isRespawning(hero) && !(hero.equippedIds ?? []).includes(itemId)) {
    (hero.equippedIds ??= []).push(itemId);
    grantExp(G, hero, EXP_ON_EQUIP);
  }
}

/** Sell `pid`'s item `itemIid`: it comes off and `sellRefund` comes back. An
 *  upgrade sold on the turn it was bought gives back the component it took
 *  the place of. */
export function sell(G: GameState, pid: PlayerID, itemIid: string) {
  const { bearer, item } = findWornItem(G, itemIid, pid)!;
  const refund = sellRefund(G, item);
  detachItem(bearer, item);
  const restored = item.boughtOnTurn === G.turnNumber ? item.replaced : undefined;
  if (restored) attachItem(bearer, restored);
  item.replaced = undefined;
  syncVitalitySpike(bearer);
  G.players[pid].souls += refund;
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
  syncVitalitySpike(bearer);
  syncVitalitySpike(to);
  pushLog(G, `P${pid} moved ${cardName(item.cardId)} from ${cardName(bearer.cardId)} to ${cardName(to.cardId)}.`);
}

/** Close the shop: the turn moves on to its act step. */
export function closeShop(G: GameState) {
  G.step = 'act';
}
