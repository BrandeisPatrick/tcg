/**
 * Play a card from the hand onto a hero: the item goes on and is worn from
 * then on. `playBlocked` (legality.ts) has said it may be played there; this
 * only does it. Placing your own card is free, is no shopping and is not the
 * hero's ability for the turn: it is legal in the shop step and in the act.
 *
 * An active starts on its full cooldown — or, hard crowd control, with
 * HARD_CC_CHARGES uses (a card that has been worn before keeps the charges it
 * had left); a passive's stat bonus goes onto the hero. An upgrade
 * consumes its component (`playComponent`): the copy the hero wears, whose
 * place it takes; else one in the hand; else — bought for the difference —
 * the copy another of your heroes wears; with none, it goes on as a plain
 * item. A component taken from the hand that was itself bought for the
 * difference brings its own component along. The hero earns EXP_ON_EQUIP the
 * first time it wears this item.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { cardName, itemCard } from '@/cards';
import { activeCooldown, boughtAtDiscount, findCardOnBoard, handCard, isRespawning } from '../query';
import { playComponent, type TakenComponent } from '../legality';
import { attachItem, detachItem, syncVitalitySpike } from '../instances';
import { grantExp } from '../expSystem';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { EXP_ON_EQUIP, HARD_CC_CHARGES } from '../constants';

/** Take `taken` out of play (off its hero, or out of the hand). A component
 *  from the hand that was bought for the difference settles its own price:
 *  its component goes too, kept on it so a same-turn sale can put both back. */
function consume(G: GameState, pid: PlayerID, taken: TakenComponent) {
  const { item, from } = taken;
  if (from) {
    detachItem(from, item);
    syncVitalitySpike(from);
  } else {
    G.players[pid].hand = G.players[pid].hand.filter((c) => c !== item);
  }
  if (!from && boughtAtDiscount(item)) {
    const inner = playComponent(G, pid, item);
    if (inner) {
      consume(G, pid, inner);
      item.replaced = inner.item;
      item.replacedFrom = inner.from?.iid;
    }
  }
}

export function playCard(G: GameState, pid: PlayerID, cardIid: string, heroIid: string) {
  const ps = G.players[pid];
  const card = handCard(G, pid, cardIid)!;
  const hero: CardInstance = findCardOnBoard(G, heroIid)!.card;
  const data = itemCard(card.cardId)!;
  const taken = playComponent(G, pid, card, hero);

  ps.hand = ps.hand.filter((c) => c !== card);
  if (taken) consume(G, pid, taken);
  if (data.type === 'spell') {
    if (data.hardCC) card.charges ??= HARD_CC_CHARGES;
    else card.cooldowns = { [card.cardId]: activeCooldown(hero, data.tier) };
  }
  attachItem(hero, card);
  syncVitalitySpike(hero);
  // Sold back on the turn it was bought, the upgrade gives its component back.
  if (taken && card.boughtOnTurn === G.turnNumber) {
    card.replaced = taken.item;
    card.replacedFrom = taken.from?.iid;
  }

  const took = taken ? ` (it takes ${cardName(taken.item.cardId)}${taken.from && taken.from !== hero ? ` from ${cardName(taken.from.cardId)}` : taken.from ? '' : ' from the hand'})` : '';
  pushLog(G, `P${pid} played ${data.name} on ${cardName(hero.cardId)}${took}.`);
  pushFx(G, { kind: 'cast', castKind: 'equip', by: pid, cardId: card.cardId, iid: hero.iid, targetIid: hero.iid });
  if (!isRespawning(hero) && !(hero.equippedIds ?? []).includes(card.cardId)) {
    (hero.equippedIds ??= []).push(card.cardId);
    grantExp(G, hero, EXP_ON_EQUIP);
  }
}
