/**
 * Playing from the hand (docs/deck-plan.md). `playBlocked`, `placeHeroBlocked`,
 * `chooseActiveBlocked` and `discardBlocked` (legality.ts) have said each may
 * be done; these only do it.
 *
 *  - Equipment (a passive item) goes on one of the player's heroes (the bench
 *    and corpses included) for its price — or, an upgrade onto the hero that
 *    wears its component, for the difference: it evolves, and the component
 *    goes to the discard pile. On a full hero it takes the place of the worn
 *    item the player chose (`replaceIid`), which goes to the discard pile. Its
 *    `bonus` goes on; the hero earns EXP_ON_EQUIP the first time it wears
 *    that item. An upgrade is a card like any other: nothing is made or
 *    shuffled in when its component is played (Patrick, 2026-11-15).
 *  - A spell (an active item) is cast for its price on the target its card
 *    allows, or on nothing: its effect runs in a cast frame whose source is
 *    the side's caster (`spellCaster`: the standing Active), and the card
 *    goes to the discard pile. It is never worn (Patrick, 2026-11-15).
 *  - A hero goes on the bench for free — the slot the player chose, or the
 *    first free one — or straight into an empty Active slot.
 *  - The opening's first Active comes from the deck: the drafted heroes.
 *  - A draw card's discard comes out of the hand.
 */
import type { CardInstance, GameState, PlayerID, SpellCard } from '../types';
import { cardName, itemCard } from '@/cards';
import { findCardOnBoard, handCard, isRespawning, itemPrice, wornItems } from '../query';
import { freeBenchSlot, playCost, spellCaster, upgradeComponent } from '../legality';
import { attachItem, detachItem, syncVitalitySpike } from '../instances';
import { discardFromHand, toDiscard } from '../deck';
import { grantExp } from '../expSystem';
import { resolve } from '../death';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { finishOpening, laneFromDeck } from './setup';
import { EXP_ON_EQUIP } from '../constants';
import { getAbility } from '../registry';
import { nextActionId } from '../ids';
import { withCast } from '../castContext';
import { counterspellNegates } from '../damage';

/** Play the item `cardIid` from `pid`'s hand. Equipment goes on its hero
 *  `heroIid`, paying `playCost`; `replaceIid`, on a full hero, is the worn
 *  item it replaces, which goes to `pid`'s discard pile (the board flies it
 *  there). A spell is cast on `heroIid` — its target, a hero of either side —
 *  or on nothing when it takes none (`castSpell`). */
export function playCard(G: GameState, pid: PlayerID, cardIid: string, heroIid?: string, replaceIid?: string) {
  const ps = G.players[pid];
  const card = handCard(G, pid, cardIid)!;
  const data = itemCard(card.cardId)!;
  if (data.type === 'spell') return castSpell(G, pid, card, data, heroIid);
  const hero: CardInstance = findCardOnBoard(G, heroIid!)!.card;
  const comp = upgradeComponent(hero, card.cardId);
  const replaced = replaceIid === undefined ? undefined : wornItems(hero).find((it) => it.iid === replaceIid);
  const cost = playCost(hero, card.cardId);

  ps.souls -= cost;
  ps.hand = ps.hand.filter((c) => c !== card);
  // An upgrade evolves the component the hero wears: it takes its place, and
  // the component goes to the discard pile.
  if (comp) {
    detachItem(hero, comp);
    toDiscard(G, pid, comp);
  }
  // A full hero: the item the player chose to discard makes room.
  if (replaced) {
    detachItem(hero, replaced);
    toDiscard(G, pid, replaced);
  }
  attachItem(hero, card);
  syncVitalitySpike(hero);

  const evolved = comp ? ` (it evolves ${cardName(comp.cardId)})` : replaced ? ` (${cardName(replaced.cardId)} discarded for it)` : '';
  pushLog(G, `P${pid} played ${data.name} on ${cardName(hero.cardId)}${evolved} (-${cost} soul${cost === 1 ? '' : 's'}).`);
  pushFx(G, { kind: 'cast', castKind: 'equip', by: pid, cardId: card.cardId, iid: hero.iid, targetIid: hero.iid });
  if (!isRespawning(hero) && !(hero.equippedIds ?? []).includes(card.cardId)) {
    (hero.equippedIds ??= []).push(card.cardId);
    grantExp(G, hero, EXP_ON_EQUIP);
  }
  // A card from the hand is shown as it is played, equipment like a spell
  // (the board's reveal: both players see what went on which hero).
  G.action = { id: nextActionId(G), kind: 'item', by: pid, cardId: card.cardId, state: 'begin' };
}

/** Cast the spell `card` from `pid`'s hand for its price: it leaves the hand,
 *  its onPlay abilities run in a cast frame whose source is the side's caster
 *  (`spellCaster` — its gear reacts to the damage, and the FX leave from it),
 *  aimed at `targetIid` when the spell takes a target, and the card goes to
 *  the discard pile. Aimed at an enemy hero carrying Counterspell it does
 *  nothing (`counterspellNegates`): its price is paid and the card is gone.
 *  The reveal it starts is an item's (`G.action`). */
function castSpell(G: GameState, pid: PlayerID, card: CardInstance, data: SpellCard, targetIid?: string) {
  const ps = G.players[pid];
  const caster = spellCaster(G, pid)!;
  const cost = itemPrice(card.cardId);
  const filter = getAbility(data.abilities[0])?.target ?? 'noTarget';
  const target = filter !== 'noTarget' && targetIid ? findCardOnBoard(G, targetIid)?.card : undefined;

  ps.souls -= cost;
  ps.hand = ps.hand.filter((c) => c !== card);
  pushLog(G, `P${pid} played ${data.name}${target ? ` on ${cardName(target.cardId)}` : ''} (-${cost} soul${cost === 1 ? '' : 's'}).`);
  // The cast event goes out first, so the effects that follow read as this
  // spell's: the bolt leaves the caster, then the hits land.
  pushFx(G, { kind: 'cast', castKind: 'spell', by: pid, cardId: card.cardId, iid: caster.iid, targetIid: target?.iid });
  if (!counterspellNegates(G, pid, target, data.name)) {
    withCast(caster, 'spell', () => {
      for (const id of data.abilities) {
        const ability = getAbility(id);
        if (ability?.trigger === 'onPlay') ability.run(G, { movingPlayer: pid }, { source: card, target });
      }
    });
  }
  toDiscard(G, pid, card);

  resolve(G);
  G.action = { id: nextActionId(G), kind: 'item', by: pid, cardId: card.cardId, state: 'begin' };
}

/** Put the hero `cardIid` from `pid`'s hand in a bench slot — `slot`, or
 *  its first free one — or, `toActive`, in its empty Active slot. Free. The
 *  board flies it there (`place`). The state-based pass follows: a hero
 *  benched while the lane is open is promoted to it (an AI seat's at once;
 *  the human seat is asked). */
export function placeHero(G: GameState, pid: PlayerID, cardIid: string, toActive = false, slot?: 1 | 2 | 3) {
  const ps = G.players[pid];
  const card = handCard(G, pid, cardIid)!;
  ps.hand = ps.hand.filter((c) => c !== card);
  if (toActive) {
    ps.active = card;
    card.zone = 'active';
    card.slot = 0;
    pushLog(G, `P${pid} put ${cardName(card.cardId)} in the lane.`);
    pushFx(G, { kind: 'deck', what: 'place', pid, iid: card.iid, cardId: card.cardId, slot: 0 });
  } else {
    const at = slot ?? freeBenchSlot(ps)!;
    ps.bench[at - 1] = card;
    card.zone = 'bench';
    card.slot = at;
    pushLog(G, `P${pid} benched ${cardName(card.cardId)}.`);
    pushFx(G, { kind: 'deck', what: 'place', pid, iid: card.iid, cardId: card.cardId, slot: at });
  }
  resolve(G);
}

/** The opening: the hero `cardIid`, one of the drafted heroes in the deck
 *  of the seat that owes its first Active, takes the lane — and the rest of
 *  the opening follows (`finishOpening`: the AI's own pick, the shuffles,
 *  the deal). Whose it is comes from the card. */
export function chooseActive(G: GameState, cardIid: string) {
  const pid = G.pendingActive!;
  const card = G.players[pid].deck.find((c) => c.iid === cardIid)!;
  G.pendingActive = undefined;
  laneFromDeck(G, pid, card);
  finishOpening(G);
}

/** A draw card's discard: the hand cards `cardIids` of `pid` go to its
 *  discard pile. */
export function discard(G: GameState, pid: PlayerID, cardIids: readonly string[]) {
  discardFromHand(G, pid, cardIids);
}
