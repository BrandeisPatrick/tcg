/**
 * Playing from the hand (docs/deck-plan.md). `playBlocked`, `placeHeroBlocked`,
 * `chooseActiveBlocked` and `discardBlocked` (legality.ts) have said each may
 * be done; these only do it.
 *
 *  - An item goes on one of the player's heroes (the bench and corpses
 *    included) for its price — or, an upgrade onto the hero that wears its
 *    component, for the difference: it evolves, and the component goes to the
 *    discard pile. An active starts on its full cooldown (`activeCooldown`)
 *    or, hard crowd control, with HARD_CC_CHARGES; a passive's `bonus` goes on;
 *    the hero earns EXP_ON_EQUIP the first time it wears that item. Playing an
 *    item Deadlock builds into a bigger one makes that upgrade and shuffles it
 *    into the deck (the player's pick, when there are several).
 *  - A hero goes on the bench for free (or straight into an empty Active slot).
 *  - The opening's first Active comes from the hand.
 *  - A draw card's discard comes out of the hand.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '../types';
import { cardName, itemCard } from '@/cards';
import { upgradesOf } from '@/cards/decks';
import { activeCooldown, findCardOnBoard, handCard, isRespawning } from '../query';
import { freeBenchSlot, playCost, upgradeComponent } from '../legality';
import { attachItem, detachItem, syncVitalitySpike } from '../instances';
import { discardFromHand, shuffleIntoDeck, toDiscard } from '../deck';
import { grantExp } from '../expSystem';
import { resolve } from '../death';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { EXP_ON_EQUIP, HARD_CC_CHARGES } from '../constants';

/** Put the item `cardIid` from `pid`'s hand on its hero `heroIid`, paying
 *  `playCost`; `upgradeId` picks the upgrade it makes when it makes one of
 *  several (left out: the first). */
export function playCard(G: GameState, pid: PlayerID, cardIid: string, heroIid: string, upgradeId?: CardId) {
  const ps = G.players[pid];
  const card = handCard(G, pid, cardIid)!;
  const hero: CardInstance = findCardOnBoard(G, heroIid)!.card;
  const data = itemCard(card.cardId)!;
  const comp = upgradeComponent(hero, card.cardId);
  const cost = playCost(hero, card.cardId);

  ps.souls -= cost;
  ps.hand = ps.hand.filter((c) => c !== card);
  // An upgrade evolves the component the hero wears: it takes its place, and
  // the component goes to the discard pile.
  if (comp) {
    detachItem(hero, comp);
    toDiscard(G, pid, comp);
  }
  if (data.type === 'spell') {
    if (data.hardCC) card.charges ??= HARD_CC_CHARGES;
    else card.cooldowns = { [card.cardId]: activeCooldown(hero, data.tier, data.cooldown) };
  }
  attachItem(hero, card);
  syncVitalitySpike(hero);

  const evolved = comp ? ` (it evolves ${cardName(comp.cardId)})` : '';
  pushLog(G, `P${pid} played ${data.name} on ${cardName(hero.cardId)}${evolved} (-${cost} soul${cost === 1 ? '' : 's'}).`);
  pushFx(G, { kind: 'cast', castKind: 'equip', by: pid, cardId: card.cardId, iid: hero.iid, targetIid: hero.iid });
  if (!isRespawning(hero) && !(hero.equippedIds ?? []).includes(card.cardId)) {
    (hero.equippedIds ??= []).push(card.cardId);
    grantExp(G, hero, EXP_ON_EQUIP);
  }

  // Each copy played makes one upgrade, shuffled into the deck.
  const ups = upgradesOf(card.cardId);
  if (ups.length > 0) shuffleIntoDeck(G, pid, upgradeId && ups.includes(upgradeId) ? upgradeId : ups[0]);
}

/** Put the hero `cardIid` from `pid`'s hand in its first free bench slot —
 *  or, `toActive`, in its empty Active slot. Free. The state-based pass
 *  follows: a hero benched while the lane is open is promoted to it (an AI
 *  seat's at once; the human seat is asked). */
export function placeHero(G: GameState, pid: PlayerID, cardIid: string, toActive = false) {
  const ps = G.players[pid];
  const card = handCard(G, pid, cardIid)!;
  ps.hand = ps.hand.filter((c) => c !== card);
  if (toActive) {
    ps.active = card;
    card.zone = 'active';
    card.slot = 0;
    pushLog(G, `P${pid} put ${cardName(card.cardId)} in the lane.`);
  } else {
    const slot = freeBenchSlot(ps)!;
    ps.bench[slot - 1] = card;
    card.zone = 'bench';
    card.slot = slot;
    pushLog(G, `P${pid} benched ${cardName(card.cardId)}.`);
  }
  resolve(G);
}

/** The opening: the hero `cardIid`, from the hand of the seat that owes its
 *  first Active, takes the lane. Whose it is comes from the card. */
export function chooseActive(G: GameState, cardIid: string) {
  const pid = G.pendingActive!;
  const ps = G.players[pid];
  const card = handCard(G, pid, cardIid)!;
  ps.hand = ps.hand.filter((c) => c !== card);
  ps.active = card;
  card.zone = 'active';
  card.slot = 0;
  G.pendingActive = undefined;
  pushLog(G, `P${pid} put ${cardName(card.cardId)} in the lane.`);
}

/** A draw card's discard: the hand cards `cardIids` of `pid` go to its
 *  discard pile. */
export function discard(G: GameState, pid: PlayerID, cardIids: readonly string[]) {
  discardFromHand(G, pid, cardIids);
}
