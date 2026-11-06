/**
 * The shop step and the hand (rules §3–§4; src/engine/actions/shop.ts,
 * actions/playCard.ts, legality.ts): every own turn opens on the shop step,
 * where only its moves — buy, sell, moveItem, closeShop — a card played from
 * the hand and `endTurn` are legal, and only for the player whose turn it is;
 * `closeShop` moves the turn on to its act step, where the shop is shut and a
 * card is still played. A card bought goes to the hand (no hero is chosen):
 * its price, less the component's when a free copy of the component is on the
 * buyer's side; a copy claimed by an upgrade bought for the difference cannot
 * be sold. A card played onto a hero (bench and corpses included) consumes its
 * component — the copy the hero wears, else one in the hand, else, bought for
 * the difference, another hero's — and sets its cooldown, charges, bonus and
 * the first-wearing experience going. What a sale refunds (what was paid the
 * same turn, else half), what a same-turn upgrade's sale puts back, and what a
 * move carries.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import { ITEMS, itemCard } from '@/cards';
import { INVALID, perform, type Action } from '@/engine/engine';
import {
  blocked, buyPrice, freeComponents, legalActions, playBlocked, playTargets, sellBlocked, sellRefund,
} from '@/engine/legality';
import { findWornItem, itemPrice, netWorth, otherPlayer, slotCap, wornItems } from '@/engine/query';
import { onSale } from '@/engine/market';
import { setupGame } from '@/engine/actions/setup';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { resolve } from '@/engine/death';
import { EXP_ON_EQUIP, HARD_CC_CHARGES, MAX_ITEMS, PRICE } from '@/engine/constants';
import { setMatchConfig } from '@/storage/matchConfig';
import {
  buyItem, buyToHand, configureReadyMatch, freshReadyGame, giveCard, giveItem, makeAttack, makeHero, playItem, readyClient,
} from './_helpers';

/** P0's shop step (engine turn 2) with `souls` to spend. */
function shop(souls = 20): GameState {
  const G = freshReadyGame({ step: 'shop' });
  G.players['0'].souls = souls;
  return G;
}

/** End `pid`'s turn, pass the rival's whole turn, and begin `pid`'s next own
 *  turn: its income lands and it stands in that turn's shop step. */
function nextOwnTurn(G: GameState, pid: PlayerID) {
  const rival = otherPlayer(pid);
  endTurnEffects(G, pid);
  beginTurn(G, rival, G.turnNumber + 1);
  endTurnEffects(G, rival);
  beginTurn(G, pid, G.turnNumber + 1);
}

/** `a` as `pid`: INVALID or not, and the engine's reason. */
function attempt(G: GameState, pid: PlayerID, a: Action) {
  const why = blocked(G, pid, a);
  return { why, result: perform(G, pid, a) };
}

/** `a` is refused as `pid` with `why`, and the state is left exactly as it was. */
function refusedUntouched(G: GameState, pid: PlayerID, a: Action, why: string) {
  const before = JSON.stringify(G);
  expect(attempt(G, pid, a), JSON.stringify(a)).toEqual({ why, result: INVALID });
  expect(JSON.stringify(G), JSON.stringify(a)).toBe(before);
}

const play = (card: CardInstance, hero: CardInstance): Action => ({ type: 'playCard', cardIid: card.iid, heroIid: hero.iid });
const ids = (cards: CardInstance[]) => cards.map((c) => c.cardId);

describe('the shop step', () => {
  beforeAll(configureReadyMatch);

  it('every turn opens on the shop step, closeShop moves it to the act step, and endTurn is legal in either', () => {
    const client = readyClient({ shop: true });
    const st = () => client.getState()!;
    expect(st().G.step).toBe('shop');
    expect(st().ctx.currentPlayer).toBe('0');
    client.moves.closeShop();
    expect(st().G.step).toBe('act');
    const id = st()._stateID;
    client.moves.closeShop(); // shut already: refused
    expect(st()._stateID).toBe(id);
    client.moves.endTurn();
    expect([st().ctx.currentPlayer, st().G.step]).toEqual(['1', 'shop']);
    client.moves.endTurn(); // straight out of the shop: legal
    expect([st().ctx.currentPlayer, st().G.step, st().G.turnNumber]).toEqual(['0', 'shop', 3]);
    expect(st().G.players['0'].souls).toBe(8); // nothing spent on its first turn: both incomes banked
    client.stop();
  });

  it('through a client: a card bought lands in the hand and is played from it, in the shop step and in the act', () => {
    const client = readyClient({ shop: true });
    const st = () => client.getState()!;
    client.moves.buy('extended_magazine');
    const [mag] = st().G.players['0'].hand;
    expect(mag).toMatchObject({ cardId: 'extended_magazine', zone: 'hand', ownerId: '0', boughtOnTurn: 1, paid: PRICE[1] });
    expect(st().G.players['0'].souls).toBe(4 - PRICE[1]);
    client.moves.buy('extra_health');
    const haze = st().G.players['0'].active!;
    client.moves.playCard(mag.iid, haze.iid);
    expect(ids(wornItems(st().G.players['0'].active!))).toEqual(['extended_magazine']);
    client.moves.closeShop();
    const health = st().G.players['0'].hand[0];
    client.moves.playCard(health.iid, st().G.players['0'].bench[0]!.iid);
    expect([st().G.step, st().G.players['0'].hand]).toEqual(['act', []]);
    expect(ids(wornItems(st().G.players['0'].bench[0]!))).toEqual(['extra_health']);
    client.stop();
  });

  it('beginTurn reopens the shop, whatever step the last turn ended in', () => {
    const G = shop();
    G.step = 'act';
    nextOwnTurn(G, '0');
    expect(G.step).toBe('shop');
  });

  it('in the shop step only the shop\'s moves, a card played and endTurn are legal: an act move is refused with shopOpen', () => {
    const G = shop(4);
    const me = G.players['0'];
    const foe = G.players['1'].active!;
    const lash = me.bench[1]!;
    const front = giveItem(G, me.bench[0]!, 'cold_front');
    const held = giveCard(G, '0', 'extra_health');
    for (const a of [
      { type: 'attack' },
      { type: 'useSkill', heroIid: lash.iid, targetIid: foe.iid },
      { type: 'activate', itemIid: front.iid, targetIid: foe.iid },
      { type: 'moveHero', fromSlot: 1, toSlot: 0 },
    ] as Action[]) refusedUntouched(G, '0', a, 'shopOpen');
    for (const a of [
      { type: 'buy', itemId: 'extra_spirit' },
      { type: 'sell', itemIid: front.iid },
      { type: 'sell', itemIid: held.iid },
      { type: 'moveItem', itemIid: front.iid, toHeroIid: lash.iid },
      play(held, lash),
      { type: 'closeShop' },
      { type: 'endTurn' },
    ] as Action[]) expect(blocked(G, '0', a), a.type).toBeNull();

    // The list, in order: the buys the souls cover (market order), the hand's sales, each worn
    // item's sale and moves, each hand card played onto each hero it may go on, closeShop, endTurn.
    const listed = legalActions(G, '0');
    for (const a of listed) expect(blocked(G, '0', a), JSON.stringify(a)).toBeNull();
    const heroes = [me.active!, ...me.bench].map((h) => h!.iid);
    const kinds = listed.map((a) => a.type).filter((t, i, all) => t !== all[i - 1]);
    expect(kinds).toEqual(['buy', 'sell', 'moveItem', 'playCard', 'closeShop', 'endTurn']);
    const buys = listed.flatMap((a) => (a.type === 'buy' ? [a.itemId] : []));
    expect(buys).toEqual(G.market.filter((id) => itemPrice(id) <= 4));
    expect(buys.every((id) => onSale(G, id))).toBe(true);
    expect(listed.filter((a) => a.type === 'sell').map((a) => (a as { itemIid: string }).itemIid)).toEqual([held.iid, front.iid]);
    expect(listed.filter((a) => a.type === 'moveItem').map((a) => (a as { toHeroIid: string }).toHeroIid)).toEqual(heroes.filter((h) => h !== me.bench[0]!.iid));
    expect(listed.filter((a) => a.type === 'playCard')).toEqual(heroes.map((heroIid) => ({ type: 'playCard', cardIid: held.iid, heroIid })));
  });

  it('in the act step the shop is shut — buy, sell, moveItem and closeShop are refused with notShop — and a card is still played', () => {
    const G = shop();
    const me = G.players['0'];
    const worn = giveItem(G, me.active!, 'extra_health');
    const held = giveCard(G, '0', 'extra_spirit');
    G.step = 'act';
    for (const a of [
      { type: 'buy', itemId: 'extra_spirit' },
      { type: 'sell', itemIid: worn.iid },
      { type: 'sell', itemIid: held.iid },
      { type: 'moveItem', itemIid: worn.iid, toHeroIid: me.bench[0]!.iid },
      { type: 'closeShop' },
    ] as Action[]) refusedUntouched(G, '0', a, 'notShop');
    const listed = legalActions(G, '0');
    expect(listed.some((a) => ['buy', 'sell', 'moveItem', 'closeShop'].includes(a.type))).toBe(false);
    // The act step lists the plays after the attack, the items, the skills and the retreats.
    const plays = listed.filter((a) => a.type === 'playCard');
    expect(plays).toEqual([me.active!, ...me.bench].map((h) => play(held, h!)));
    expect(listed.slice(-plays.length - 1, -1)).toEqual(plays);
    expect(blocked(G, '0', { type: 'endTurn' })).toBeNull();
  });

  it('only the player whose turn it is may shop or play a card — and nobody during the draft', () => {
    const G = shop();
    G.players['1'].souls = 20;
    const theirs = G.players['1'].active!;
    const worn = giveItem(G, theirs, 'extra_health');
    const held = giveCard(G, '1', 'extra_spirit');
    for (const a of [
      { type: 'buy', itemId: 'extra_spirit' },
      { type: 'sell', itemIid: worn.iid },
      { type: 'sell', itemIid: held.iid },
      { type: 'moveItem', itemIid: worn.iid, toHeroIid: G.players['1'].bench[0]!.iid },
      play(held, theirs),
      { type: 'closeShop' },
    ] as Action[]) refusedUntouched(G, '1', a, 'notYourTurn');
    expect(legalActions(G, '1').some((a) => ['buy', 'sell', 'moveItem', 'playCard', 'closeShop'].includes(a.type))).toBe(false);
    G.step = 'act';
    refusedUntouched(G, '1', play(held, theirs), 'notYourTurn');

    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 3 });
    try {
      const draft = setupGame();
      expect(draft.draft).not.toBeNull();
      expect(draft.step).toBe('shop');
      expect(draft.players['0'].hand).toEqual([]);
      for (const pid of ['0', '1'] as const) {
        expect(blocked(draft, pid, { type: 'closeShop' })).toBe('notYourTurn');
        expect(blocked(draft, pid, { type: 'buy', itemId: 'extra_spirit' })).toBe('notYourTurn');
        expect(playBlocked(draft, pid, 'any', 'any')).toBe('notYourTurn');
      }
    } finally {
      configureReadyMatch();
    }
  });

  it('a promotion owed comes first, in the shop step too: no buy and no card played', () => {
    const G = shop();
    const held = giveCard(G, '0', 'extra_health');
    G.players['0'].active!.hp = 0;
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    refusedUntouched(G, '0', { type: 'buy', itemId: 'extra_health' }, 'promotionOwed');
    refusedUntouched(G, '0', play(held, G.players['0'].bench[0]!), 'promotionOwed');
    expect(blocked(G, '0', { type: 'closeShop' })).toBe('promotionOwed');
    expect(blocked(G, '0', { type: 'promoteToActive', benchIid: G.players['0'].bench[0]!.iid })).toBeNull();
  });
});

describe('buying: the card goes to the hand', () => {
  it('pays the price and puts the card in the hand, its purchase recorded — no hero is chosen, nothing is worn yet', () => {
    const G = shop(20);
    const me = G.players['0'];
    const haze = me.active!;
    const before = JSON.stringify([me.active, me.bench]);

    const health = buyToHand(G, '0', 'extra_health');               // tier 1: 2 souls
    expect(me.souls).toBe(18);
    expect(health).toMatchObject({ zone: 'hand', ownerId: '0', boughtOnTurn: 2, paid: 2, attachedTo: undefined, attached: [] });
    expect(health.cooldowns).toBeUndefined();
    const front = buyToHand(G, '0', 'cold_front');                  // tier 2 active: 4 souls, no cooldown in the hand
    const knock = buyToHand(G, '0', 'knockdown');                   // tier 3 hard crowd control: 8 souls, no charges in the hand
    expect(me.souls).toBe(6);
    expect([front.cooldowns, front.charges, knock.cooldowns, knock.charges]).toEqual([undefined, undefined, undefined, undefined]);
    expect(me.hand).toEqual([health, front, knock]);
    expect(JSON.stringify([me.active, me.bench])).toBe(before);     // no hero touched: no bonus, no experience
    expect(haze.exp).toBe(0);
    expect(G.fx).toEqual([]);
    expect(G.log.at(-1)!.text).toBe('P0 bought Knockdown (-8 souls).');
  });

  it('duplicates in the hand are allowed: the same item bought twice is two cards', () => {
    const G = shop(20);
    const a = buyToHand(G, '0', 'extended_magazine');
    const b = buyToHand(G, '0', 'extended_magazine');
    expect(a.iid).not.toBe(b.iid);
    expect(ids(G.players['0'].hand)).toEqual(['extended_magazine', 'extended_magazine']);
    expect(G.players['0'].souls).toBe(16);
  });

  it('the refusals, in order — not your turn, the shop closed, no such item, not on sale, too few souls — change nothing', () => {
    const G = shop(1);
    const off = ITEMS.find((i) => !onSale(G, i.id))!.id;
    G.players['1'].souls = 99;
    refusedUntouched(G, '1', { type: 'buy', itemId: off }, 'notYourTurn');       // before anything else
    for (const [itemId, why] of [
      ['no_such_item', 'noItem'], ['hero_dynamo', 'noItem'], ['ult_abrams', 'noItem'],
      [off, 'notOnSale'],                                                          // off sale, and too dear too
      ['extended_magazine', 'souls'],
    ] as [CardId, string][]) refusedUntouched(G, '0', { type: 'buy', itemId }, why);
    G.step = 'act';
    refusedUntouched(G, '0', { type: 'buy', itemId: 'no_such_item' }, 'notShop'); // the step before the item
    expect(G.players['0'].souls).toBe(1);
  });

  it('an upgrade costs the difference while a free copy of its component is on the buyer\'s side — worn by any hero in a slot, or in the hand', () => {
    const full = PRICE[2];
    const less = PRICE[2] - PRICE[1];
    expect(itemCard('titanic_magazine')!.upgradesFrom).toBe('extended_magazine');
    const G = shop(20);
    const me = G.players['0'];
    expect(buyPrice(G, '0', 'titanic_magazine')).toBe(full);                    // no copy: the full price
    const worn = giveItem(G, me.bench[1]!, 'extended_magazine');               // a bench hero wears one
    expect(buyPrice(G, '0', 'titanic_magazine')).toBe(less);
    me.bench[1]!.hp = 0; me.bench[1]!.respawnTurnsLeft = 2;                   // a corpse's counts too
    expect(buyPrice(G, '0', 'titanic_magazine')).toBe(less);
    me.bench[1]!.attached = [];
    expect(buyPrice(G, '0', 'titanic_magazine')).toBe(full);
    giveItem(G, G.players['1'].active!, 'extended_magazine');                  // the rival's is not on its side
    expect(buyPrice(G, '0', 'titanic_magazine')).toBe(full);
    const held = buyToHand(G, '0', 'extended_magazine');                       // a copy in the hand
    expect(buyPrice(G, '0', 'titanic_magazine')).toBe(less);
    const titanic = buyToHand(G, '0', 'titanic_magazine');
    expect(titanic.paid).toBe(less);
    expect(me.souls).toBe(20 - PRICE[1] - less);
    expect([worn.cardId, held.cardId]).toEqual(['extended_magazine', 'extended_magazine']);
  });

  it('a merged Rem\'s items are copies on the side: they price an upgrade, and its play consumes hers', () => {
    const G = shop(20);
    const me = G.players['0'];
    const rem = makeHero('hero_rem', '0', 'equipment');
    rem.attachedTo = me.active!.iid;
    rem.remMergeTurnsLeft = 2;
    me.active!.attached = [rem];
    me.bench[2] = null; // Rem's slot, while she rides on the Active
    const mag = giveItem(G, rem, 'extended_magazine');
    expect(freeComponents(G, '0', 'extended_magazine')).toBe(1);
    expect(buyPrice(G, '0', 'titanic_magazine')).toBe(PRICE[2] - PRICE[1]);
    const titanic = buyItem(G, '0', 'titanic_magazine', me.bench[0]!);        // onto Vindicta, who wears none
    expect(titanic.replaced).toBe(mag);
    expect(wornItems(rem)).toEqual([]);
  });

  it('a claim: an upgrade bought for the difference claims its copy — a second upgrade against the one copy pays full price', () => {
    const G = shop(40);
    const me = G.players['0'];
    giveItem(G, me.bench[0]!, 'extra_spirit');
    expect(freeComponents(G, '0', 'extra_spirit')).toBe(1);
    const improved = buyToHand(G, '0', 'improved_spirit');                     // over the worn Extra Spirit
    expect(improved.paid).toBe(PRICE[2] - PRICE[1]);
    expect(freeComponents(G, '0', 'extra_spirit')).toBe(0);
    expect(buyPrice(G, '0', 'improved_spirit')).toBe(PRICE[2]);               // the same upgrade again: full price
    expect(buyPrice(G, '0', 'surge_of_power')).toBe(PRICE[3]);                // another upgrade of it: full price too
    const surge = buyToHand(G, '0', 'surge_of_power');
    expect(surge.paid).toBe(PRICE[3]);
    // A second copy frees a discount again.
    buyToHand(G, '0', 'extra_spirit');
    expect(freeComponents(G, '0', 'extra_spirit')).toBe(1);
    expect(buyPrice(G, '0', 'surge_of_power')).toBe(PRICE[3] - PRICE[1]);
  });

  it('a claimed copy cannot be sold — sell or play the upgrade first; an unclaimed copy beside it can', () => {
    const G = shop(40);
    const me = G.players['0'];
    const vindicta = me.bench[0]!;
    const worn = giveItem(G, vindicta, 'extended_magazine');
    const titanic = buyToHand(G, '0', 'titanic_magazine');                    // claims the worn magazine
    expect(sellBlocked(G, '0', worn.iid)).toBe('claimed');
    refusedUntouched(G, '0', { type: 'sell', itemIid: worn.iid }, 'claimed');
    expect(legalActions(G, '0').some((a) => a.type === 'sell' && a.itemIid === worn.iid)).toBe(false);
    // A second copy: one of the two may go, then the other is the claimed one.
    const spare = buyToHand(G, '0', 'extended_magazine');
    expect(sellBlocked(G, '0', worn.iid)).toBeNull();
    expect(sellBlocked(G, '0', spare.iid)).toBeNull();
    expect(perform(G, '0', { type: 'sell', itemIid: spare.iid })).not.toBe(INVALID);
    expect(sellBlocked(G, '0', worn.iid)).toBe('claimed');
    // The upgrade sold: the claim is gone.
    expect(perform(G, '0', { type: 'sell', itemIid: titanic.iid })).not.toBe(INVALID);
    expect(sellBlocked(G, '0', worn.iid)).toBeNull();
    // …or played: its play consumes the copy, and nothing is left to claim.
    const again = buyToHand(G, '0', 'titanic_magazine');
    playItem(G, '0', again, me.active!);
    expect(findWornItem(G, worn.iid)).toBeNull();
    expect(freeComponents(G, '0', 'extended_magazine')).toBe(0);
  });
});

describe('playing a card from the hand', () => {
  it('onto the Active, a bench hero or a corpse: the card is worn, its bonus on, nothing paid — in the shop step and in the act step', () => {
    const G = shop(20);
    const me = G.players['0'];
    const [haze, lash, paige] = [me.active!, me.bench[1]!, me.bench[2]!];
    paige.hp = 0;
    paige.respawnTurnsLeft = 2;
    const [hazeMax, hazeHp, lashSpirit, paigeMax] = [haze.hpMax, haze.hp, lash.spiritMod, paige.hpMax];
    const health = buyToHand(G, '0', 'extra_health');
    const spirit = buyToHand(G, '0', 'improved_spirit');
    const spare = buyToHand(G, '0', 'extra_health');
    const souls = me.souls;

    expect(playItem(G, '0', health, haze)).toBe(health);                       // the shop step
    expect(health).toMatchObject({ zone: 'equipment', attachedTo: haze.iid, ownerId: '0', boughtOnTurn: 2, paid: 2 });
    expect([haze.hpMax, haze.hp]).toEqual([hazeMax + 2, hazeHp + 2]);
    expect(G.log.at(-1)!.text).toBe('P0 played Extra Health on Haze.');
    expect(perform(G, '0', { type: 'closeShop' })).not.toBe(INVALID);
    playItem(G, '0', spirit, lash);                                             // the act step
    expect(lash.spiritMod).toBe(lashSpirit + 2);
    playItem(G, '0', spare, paige);                                             // a corpse may be kitted out
    expect([paige.hpMax, paige.hp]).toEqual([paigeMax + 2, 0]);
    expect(me.souls).toBe(souls);                                               // the play is free
    expect(me.hand).toEqual([]);
    expect(G.fx.filter((e) => e.kind === 'cast' && e.castKind === 'equip').map((e) => (e as { iid?: string }).iid)).toEqual([haze.iid, lash.iid, paige.iid]);
  });

  it('a play is no ability and no attack: the hero may still use its skill, and the Act goes on', () => {
    const G = shop(20);
    const me = G.players['0'];
    const lash = me.bench[1]!;
    const card = buyToHand(G, '0', 'extra_spirit');
    perform(G, '0', { type: 'closeShop' });
    playItem(G, '0', card, lash);
    expect([lash.skillUsedThisTurn, G.attackUsed, G.step]).toEqual([false, false, 'act']);
    expect(blocked(G, '0', { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })).toBeNull();
    expect(blocked(G, '0', { type: 'attack' })).toBeNull();
  });

  it('refused once the turn\'s attack is made', () => {
    const G = shop(20);
    const card = buyToHand(G, '0', 'extra_spirit');
    perform(G, '0', { type: 'closeShop' });
    G.players['1'].active!.hp = G.players['1'].active!.hpMax = 50; // nobody falls
    makeAttack(G, '0');
    refusedUntouched(G, '0', play(card, G.players['0'].active!), 'actOver');
    expect(legalActions(G, '0')).toEqual([{ type: 'endTurn' }]);
  });

  it('the refusals, in order — not in the hand, no hero of yours, a duplicate, a full hero — change nothing', () => {
    const G = shop(20);
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const card = buyToHand(G, '0', 'extra_health');
    const worn = giveItem(G, haze, 'extra_health');
    const theirs = giveCard(G, '1', 'extra_spirit');
    for (const [cardIid, heroIid, why] of [
      ['no-such-iid', 'no-such-iid', 'notInHand'],                // the card before the hero
      [worn.iid, vindicta.iid, 'notInHand'],                      // a worn item is moved, not played
      [theirs.iid, vindicta.iid, 'notInHand'],                    // the rival's card
      [card.iid, G.players['1'].active!.iid, 'noHero'],
      [card.iid, 'no-such-iid', 'noHero'],
      [card.iid, worn.iid, 'noHero'],                             // an item is no hero
      [card.iid, haze.iid, 'duplicate'],
    ] as [string, string, string][]) refusedUntouched(G, '0', { type: 'playCard', cardIid, heroIid }, why);
    giveItem(G, haze, 'extra_regen');
    giveItem(G, haze, 'sprint_boots');
    expect(playBlocked(G, '0', card.iid, haze.iid)).toBe('duplicate');          // a duplicate before it is full
    for (const id of ['extra_spirit', 'extra_regen', 'sprint_boots']) giveItem(G, vindicta, id);
    refusedUntouched(G, '0', play(card, vindicta), 'full');
  });

  it('the cap and the flex slot: a full hero takes no fourth card — unless it upgrades one it wears — and with the flex slot it does', () => {
    const G = shop(40);
    const haze = G.players['0'].active!;
    for (const id of ['extended_magazine', 'extra_regen', 'sprint_boots']) giveItem(G, haze, id);
    expect(slotCap(G, '0')).toBe(MAX_ITEMS);
    const spirit = buyToHand(G, '0', 'extra_spirit');
    const titanic = buyToHand(G, '0', 'titanic_magazine');
    expect(playBlocked(G, '0', spirit.iid, haze.iid)).toBe('full');
    expect(playTargets(G, '0', spirit.iid).map((h) => h.iid)).not.toContain(haze.iid);
    expect(playTargets(G, '0', titanic.iid).map((h) => h.iid)).toContain(haze.iid);
    playItem(G, '0', titanic, haze);                                            // takes the magazine's place
    expect(wornItems(haze)).toHaveLength(MAX_ITEMS);
    G.players['0'].flexSlot = true;
    expect(slotCap(G, '0')).toBe(MAX_ITEMS + 1);
    playItem(G, '0', spirit, haze);
    expect(wornItems(haze)).toHaveLength(MAX_ITEMS + 1);
    const burst = buyToHand(G, '0', 'mystic_burst');
    expect(playBlocked(G, '0', burst.iid, haze.iid)).toBe('full');
  });

  it('playTargets: the heroes a card may go on, in board order — the Active, then the bench, corpses included', () => {
    const G = shop(20);
    const me = G.players['0'];
    const [haze, vindicta, lash, paige] = [me.active!, ...me.bench] as CardInstance[];
    paige.hp = 0;
    paige.respawnTurnsLeft = 1;
    const card = buyToHand(G, '0', 'extra_health');
    expect(playTargets(G, '0', card.iid)).toEqual([haze, vindicta, lash, paige]);
    giveItem(G, vindicta, 'extra_health');
    for (const id of ['extra_spirit', 'extra_regen', 'sprint_boots']) giveItem(G, lash, id);
    expect(playTargets(G, '0', card.iid)).toEqual([haze, paige]);
    expect(playTargets(G, '0', 'no-such-iid')).toEqual([]);
    expect(playTargets(G, '1', card.iid)).toEqual([]);
  });
});

describe('an upgrade played consumes its component', () => {
  it('the copy the target hero wears: the upgrade takes its place — on a full hero too', () => {
    const G = shop(20);
    const me = G.players['0'];
    const haze = me.active!;
    const atk = haze.atkMod;
    const mag = giveItem(G, haze, 'extended_magazine');                        // +1 Bullet Power
    giveItem(G, haze, 'extra_health');
    giveItem(G, haze, 'extra_regen');
    const titanic = buyToHand(G, '0', 'titanic_magazine');                    // +2 Bullet Power, for the difference
    expect(me.souls).toBe(20 - (PRICE[2] - PRICE[1]));
    playItem(G, '0', titanic, haze);
    expect(ids(wornItems(haze))).toEqual(['extra_health', 'extra_regen', 'titanic_magazine']);
    expect(findWornItem(G, mag.iid)).toBeNull();
    expect(haze.atkMod).toBe(atk + 2);
    expect(titanic).toMatchObject({ paid: PRICE[2] - PRICE[1], replaced: mag });
    expect(titanic.replacedFrom).toBe(haze.iid);
  });

  it('in that order: the target\'s own copy before one in the hand, one in the hand before another hero\'s', () => {
    const G = shop(40);
    const me = G.players['0'];
    const [haze, vindicta, lash, paige] = [me.active!, ...me.bench] as CardInstance[];
    const onHaze = giveItem(G, haze, 'extended_magazine');
    const onVin = giveItem(G, vindicta, 'extended_magazine');
    const held = buyToHand(G, '0', 'extended_magazine');                       // three free copies
    const [a, b, c] = [1, 2, 3].map(() => buyToHand(G, '0', 'titanic_magazine'));
    expect([a.paid, b.paid, c.paid]).toEqual([2, 2, 2]);                       // one claim on each
    playItem(G, '0', a, haze);                                                  // a copy in the hand and on Vindicta too
    expect([a.replaced, a.replacedFrom]).toEqual([onHaze, haze.iid]);
    expect(me.hand).toEqual([held, b, c]);
    playItem(G, '0', b, lash);                                                  // Lash wears none: the hand's, not Vindicta's
    expect([b.replaced, b.replacedFrom]).toEqual([held, undefined]);
    expect(wornItems(vindicta)).toEqual([onVin]);
    playItem(G, '0', c, paige);                                                 // none left in the hand: Vindicta's
    expect([c.replaced, c.replacedFrom]).toEqual([onVin, vindicta.iid]);
    expect(me.souls).toBe(40 - PRICE[1] - 3 * (PRICE[2] - PRICE[1]));
  });

  it('else a copy in the hand — one bought at full price before one bought for the difference', () => {
    const G = shop(40);
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const extra = giveItem(G, vindicta, 'extra_spirit');
    const cheap = buyToHand(G, '0', 'improved_spirit');                       // over Vindicta's Extra Spirit
    const dear = buyToHand(G, '0', 'improved_spirit');                        // the copy is claimed: full price
    expect([cheap.paid, dear.paid]).toEqual([PRICE[2] - PRICE[1], PRICE[2]]);
    const boundless = buyToHand(G, '0', 'boundless_spirit');                  // two free copies in the hand
    expect(boundless.paid).toBe(PRICE[4] - PRICE[2]);
    const spirit = haze.spiritMod;
    playItem(G, '0', boundless, haze);
    expect(me.hand).toEqual([cheap]);                                           // the full-price copy went
    expect(boundless.replaced).toBe(dear);
    expect(boundless.replacedFrom).toBeUndefined();
    expect(dear.replaced).toBeUndefined();                                      // bought at full price: it settles nothing
    expect(wornItems(vindicta)).toEqual([extra]);
    expect(haze.spiritMod).toBe(spirit + 5);
    expect(G.log.at(-1)!.text).toBe('P0 played Boundless Spirit on Haze (it takes Improved Spirit from the hand).');
  });

  it('a copy from the hand bought for the difference settles its own component too: the copy another hero wears', () => {
    const G = shop(40);
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const extra = giveItem(G, vindicta, 'extra_spirit');
    const vinSpirit = vindicta.spiritMod;
    const improved = buyToHand(G, '0', 'improved_spirit');                    // 2, against Vindicta's Extra Spirit
    const boundless = buyToHand(G, '0', 'boundless_spirit');                  // 12, against the Improved Spirit
    expect(me.souls).toBe(40 - 2 - 12);
    playItem(G, '0', boundless, haze);
    expect(me.hand).toEqual([]);
    expect(wornItems(vindicta)).toEqual([]);                                    // the settlement took her Extra Spirit
    expect(vindicta.spiritMod).toBe(vinSpirit - 1);
    expect(boundless.replaced).toBe(improved);
    expect(boundless.replacedFrom).toBeUndefined();
    expect(improved.replaced).toBe(extra);                                      // kept on the consumed card
    expect(improved.replacedFrom).toBe(vindicta.iid);
    // Sold back the same turn, both come back: the Improved Spirit to the hand it came from, the
    // Extra Spirit onto Vindicta — and with them the claim.
    expect(perform(G, '0', { type: 'sell', itemIid: boundless.iid })).not.toBe(INVALID);
    expect(me.souls).toBe(40 - 2);
    expect(me.hand).toEqual([improved]);
    expect(improved).toMatchObject({ zone: 'hand', attachedTo: undefined, replaced: undefined, replacedFrom: undefined });
    expect(wornItems(vindicta)).toEqual([extra]);
    expect(vindicta.spiritMod).toBe(vinSpirit);
    expect(sellBlocked(G, '0', extra.iid)).toBe('claimed');
  });

  it('else — only for a card bought for the difference — the copy another of the player\'s heroes wears', () => {
    const G = shop(40);
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const mag = giveItem(G, vindicta, 'extended_magazine');
    const vinAtk = vindicta.atkMod;
    const cheap = buyToHand(G, '0', 'titanic_magazine');                      // claims Vindicta's magazine
    const dear = buyToHand(G, '0', 'titanic_magazine');                       // full price
    playItem(G, '0', dear, haze);                                              // full price: it reaches no other hero's copy
    expect(dear.replaced).toBeUndefined();
    expect(wornItems(vindicta)).toEqual([mag]);
    playItem(G, '0', cheap, lash);                                             // bought for the difference: it does
    expect(wornItems(vindicta)).toEqual([]);
    expect(vindicta.atkMod).toBe(vinAtk - 1);
    expect(cheap.replaced).toBe(mag);
    expect(cheap.replacedFrom).toBe(vindicta.iid);
    expect(G.log.at(-1)!.text).toBe('P0 played Titanic Magazine on Lash (it takes Extended Magazine from Vindicta).');
  });

  it('else none: it goes on as a plain item, and every copy elsewhere stays', () => {
    const G = shop(20);
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const mag = giveItem(G, vindicta, 'extended_magazine');
    const reward = giveCard(G, '0', 'titanic_magazine');                      // a Story reward: not bought at all
    playItem(G, '0', reward, haze);
    expect(wornItems(vindicta)).toEqual([mag]);
    expect(reward.replaced).toBeUndefined();
    // A card bought on an earlier turn consumes its component, but keeps nothing to give back.
    const older = giveCard(G, '0', 'improved_spirit', { turn: 1, paid: PRICE[2] });
    const extra = giveCard(G, '0', 'extra_spirit');
    playItem(G, '0', older, vindicta);
    expect(G.players['0'].hand).toEqual([]);
    expect(older.replaced).toBeUndefined();
    expect(extra.zone).toBe('hand');                                           // consumed: in no hand and on no hero
    expect(findWornItem(G, extra.iid)).toBeNull();
  });
});

describe('what a play sets going', () => {
  it('an active starts on its full cooldown (less the Cooldown family), hard crowd control with its charges; a passive has neither', () => {
    const G = shop(80);
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const front = buyItem(G, '0', 'cold_front', haze);                          // tier 2
    const aura = buyItem(G, '0', 'heroic_aura', vindicta);                      // tier 3
    expect([front.cooldowns, aura.cooldowns]).toEqual([{ cold_front: 2 }, { heroic_aura: 3 }]);
    const knock = buyItem(G, '0', 'knockdown', lash);
    expect([knock.charges, knock.cooldowns]).toEqual([HARD_CC_CHARGES, undefined]);
    const health = buyItem(G, '0', 'extra_health', lash);
    expect([health.charges, health.cooldowns]).toEqual([undefined, undefined]);
    giveItem(G, me.bench[2]!, 'superior_cooldown');                            // a turn off its actives' cooldowns
    const fire = buyItem(G, '0', 'alchemical_fire', me.bench[2]!);
    expect(fire.cooldowns).toEqual({ alchemical_fire: 2 });
  });

  it('the bonus goes on with the Vitality spike synced', () => {
    const G = shop(20);
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'extra_regen');
    giveItem(G, haze, 'sprint_boots');
    const [max, hp] = [haze.hpMax, haze.hp];
    buyItem(G, '0', 'extra_health', haze);                                     // the third Vitality item
    expect(haze.vitalitySpike).toBe(true);
    expect([haze.hpMax, haze.hp]).toEqual([max + 3, hp + 3]);
  });

  it('a hero earns EXP_ON_EQUIP the first time it wears an item — not for a re-buy, a move, or as a corpse', () => {
    const G = shop(40);
    const me = G.players['0'];
    const [haze, vindicta, paige] = [me.active!, me.bench[0]!, me.bench[2]!];
    const exp = () => [haze.exp, vindicta.exp, paige.exp];
    expect(exp()).toEqual([0, 0, 0]);

    const held = buyToHand(G, '0', 'extra_health');
    expect(exp()).toEqual([0, 0, 0]);                                           // a card in the hand earns nothing
    const first = playItem(G, '0', held, haze);
    expect(exp()).toEqual([EXP_ON_EQUIP, 0, 0]);
    perform(G, '0', { type: 'sell', itemIid: first.iid });
    buyItem(G, '0', 'extra_health', haze);                                     // bought back: nothing more
    expect(exp()).toEqual([EXP_ON_EQUIP, 0, 0]);

    const spirit = buyItem(G, '0', 'extra_spirit', haze);
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, 0, 0]);
    perform(G, '0', { type: 'moveItem', itemIid: spirit.iid, toHeroIid: vindicta.iid });
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, 0, 0]);                            // moved in: nothing
    buyItem(G, '0', 'extra_health', vindicta);                                 // Vindicta's own first Extra Health
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, EXP_ON_EQUIP, 0]);

    paige.hp = 0;
    paige.respawnTurnsLeft = 2;
    buyItem(G, '0', 'extra_spirit', paige);                                    // a corpse earns nothing
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, EXP_ON_EQUIP, 0]);
    expect(paige.equippedIds ?? []).toEqual([]);
  });
});

describe('selling', () => {
  it('a card in the hand sells: for what was paid on its buy turn, for half later — and a Story reward for half', () => {
    const G = shop(20);
    const me = G.players['0'];
    const front = buyToHand(G, '0', 'cold_front');
    const later = buyToHand(G, '0', 'improved_spirit');
    expect(me.souls).toBe(12);
    expect(sellRefund(G, front)).toBe(PRICE[2]);
    expect(perform(G, '0', { type: 'sell', itemIid: front.iid })).not.toBe(INVALID);
    expect([me.souls, me.hand]).toEqual([16, [later]]);
    expect(G.log.at(-1)!.text).toBe('P0 sold Cold Front from the hand (+4 souls).');
    nextOwnTurn(G, '0');
    const souls = me.souls;
    expect(sellRefund(G, later)).toBe(PRICE[2] / 2);
    perform(G, '0', { type: 'sell', itemIid: later.iid });
    expect(me.souls).toBe(souls + PRICE[2] / 2);
    const reward = giveCard(G, '0', 'heroic_aura');
    expect(sellRefund(G, reward)).toBe(PRICE[3] / 2);
    perform(G, '0', { type: 'sell', itemIid: reward.iid });
    expect([me.souls, me.hand]).toEqual([souls + PRICE[2] / 2 + PRICE[3] / 2, []]);
  });

  it('a worn item sold on its purchase turn refunds what was paid, and its bonus goes with it', () => {
    const G = shop(20);
    const lash = G.players['0'].bench[1]!;
    const spirit = lash.spiritMod;
    const item = buyItem(G, '0', 'improved_spirit', lash);
    expect(G.players['0'].souls).toBe(16);
    expect(sellRefund(G, item)).toBe(PRICE[2]);
    expect(attempt(G, '0', { type: 'sell', itemIid: item.iid }).result).not.toBe(INVALID);
    expect(G.players['0'].souls).toBe(20);
    expect(lash.spiritMod).toBe(spirit);
    expect(findWornItem(G, item.iid)).toBeNull();
  });

  it('an upgrade sold on its buy turn puts its component back on the hero that wore it — unless it was moved since', () => {
    const G = shop(2);
    const me = G.players['0'];
    const haze = me.active!;
    const atk = haze.atkMod;
    const mag = giveItem(G, haze, 'extended_magazine');
    const titanic = buyItem(G, '0', 'titanic_magazine', haze);
    perform(G, '0', { type: 'sell', itemIid: titanic.iid });
    expect(me.souls).toBe(2);                                                  // the difference back
    expect(wornItems(haze)).toEqual([mag]);                                    // and the magazine, as it was
    expect(haze.atkMod).toBe(atk + 1);
    expect(G.log.at(-1)!.text).toBe('P0 sold Titanic Magazine from Haze (+2 souls); Extended Magazine is back.');

    // Moved first, the upgrade no longer undoes: the sale refunds what was paid, and that is all.
    const again = buyItem(G, '0', 'titanic_magazine', haze);
    perform(G, '0', { type: 'moveItem', itemIid: again.iid, toHeroIid: me.bench[0]!.iid });
    expect([again.replaced, again.replacedFrom]).toEqual([undefined, undefined]);
    perform(G, '0', { type: 'sell', itemIid: again.iid });
    expect(me.souls).toBe(2);
    expect(wornItems(haze)).toEqual([]);
    expect(me.hand).toEqual([]);
  });

  it('the component goes back to the other hero it came from — or, that hero full or wearing a copy, to the hand', () => {
    const setup = () => {
      const G = shop(40);
      const me = G.players['0'];
      const [haze, vindicta] = [me.active!, me.bench[0]!];
      const mag = giveItem(G, vindicta, 'extended_magazine');
      const titanic = buyItem(G, '0', 'titanic_magazine', haze);              // takes Vindicta's magazine
      expect(titanic.replacedFrom).toBe(vindicta.iid);
      return { G, me, haze, vindicta, mag, titanic };
    };
    {
      const { G, me, vindicta, mag, titanic } = setup();
      const atk = vindicta.atkMod;
      perform(G, '0', { type: 'sell', itemIid: titanic.iid });
      expect(wornItems(vindicta)).toEqual([mag]);
      expect(vindicta.atkMod).toBe(atk + 1);
      expect(me.hand).toEqual([]);
    }
    {
      const { G, me, vindicta, mag, titanic } = setup();
      for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(G, vindicta, id);
      perform(G, '0', { type: 'sell', itemIid: titanic.iid });
      expect(me.hand).toEqual([mag]);
      expect(mag).toMatchObject({ zone: 'hand', attachedTo: undefined, ownerId: '0' });
      expect(wornItems(vindicta)).toHaveLength(MAX_ITEMS);
    }
    {
      const { G, me, vindicta, mag, titanic } = setup();
      const copy = giveItem(G, vindicta, 'extended_magazine');
      perform(G, '0', { type: 'sell', itemIid: titanic.iid });
      expect(me.hand).toEqual([mag]);
      expect(wornItems(vindicta)).toEqual([copy]);
    }
  });

  it('a component restored to the hand drops its cooldown (its play sets it going again) but keeps the charges it had left', () => {
    const G = shop(40);
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const grit = giveItem(G, vindicta, 'grit', { cooldown: 1 });               // an active, still cooling down
    const ward = buyItem(G, '0', 'guardian_ward', haze);                       // over Vindicta's Grit
    expect(ward.replaced).toBe(grit);
    for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(G, vindicta, id);
    perform(G, '0', { type: 'sell', itemIid: ward.iid });
    expect(me.hand).toEqual([grit]);
    expect([grit.cooldowns, grit.charges]).toEqual([undefined, undefined]);
    playItem(G, '0', grit, me.bench[1]!);
    expect(grit.cooldowns).toEqual({ grit: 2 });

    // A spent hard crowd-control item does not come back recharged.
    const H = shop(40);
    const p = H.players['0'];
    const [hz, vin, lash] = [p.active!, p.bench[0]!, p.bench[1]!];
    const hex = giveItem(H, vin, 'slowing_hex');
    hex.charges = 1;
    H.market.push('vortex_web');
    const web = buyItem(H, '0', 'vortex_web', hz);                             // over Vindicta's Slowing Hex, for the difference
    expect(web.replaced).toBe(hex);
    for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(H, vin, id);
    perform(H, '0', { type: 'sell', itemIid: web.iid });
    expect(p.hand).toEqual([hex]);
    expect(hex.charges).toBe(1);
    playItem(H, '0', hex, lash);
    expect(hex.charges).toBe(1);
  });

  it('a component that came from the hand goes back to the hand, its purchase record with it', () => {
    const G = shop(20);
    const me = G.players['0'];
    const haze = me.active!;
    const mag = buyToHand(G, '0', 'extended_magazine');
    const titanic = buyToHand(G, '0', 'titanic_magazine');
    playItem(G, '0', titanic, haze);
    expect(me.hand).toEqual([]);
    expect(titanic.replaced).toBe(mag);
    expect(titanic.replacedFrom).toBeUndefined();
    perform(G, '0', { type: 'sell', itemIid: titanic.iid });
    expect(me.hand).toEqual([mag]);
    expect(mag).toMatchObject({ zone: 'hand', boughtOnTurn: 2, paid: PRICE[1] });
    expect(wornItems(haze)).toEqual([]);
    perform(G, '0', { type: 'sell', itemIid: mag.iid });
    expect(me.souls).toBe(20);                                                 // every soul back
  });

  it('sold on a later turn, an item refunds half its price, rounded down — an upgrade gives nothing back then', () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const id = ITEMS.find((i) => i.tier === tier)!.id;
      const G = shop();
      const item = giveItem(G, G.players['0'].active!, id);         // worn from before this turn
      expect(sellRefund(G, item), id).toBe(Math.floor(PRICE[tier] / 2));
    }
    const G = shop(4);
    const me = G.players['0'];
    const haze = me.active!;
    giveItem(G, haze, 'extended_magazine');
    const titanic = buyItem(G, '0', 'titanic_magazine', haze);
    nextOwnTurn(G, '0');
    const souls = me.souls;
    expect(titanic.replaced).toBeUndefined();                       // dropped when its turn ended
    expect(titanic.replacedFrom).toBeUndefined();
    expect(sellRefund(G, titanic)).toBe(PRICE[2] / 2);
    perform(G, '0', { type: 'sell', itemIid: titanic.iid });
    expect(me.souls).toBe(souls + PRICE[2] / 2);
    expect(wornItems(haze)).toEqual([]);
    expect(me.hand).toEqual([]);
  });

  it('only a card in your hand or an item one of your heroes wears can be sold', () => {
    const G = shop();
    const theirs = giveItem(G, G.players['1'].active!, 'extra_health');
    const theirCard = giveCard(G, '1', 'extra_spirit');
    for (const iid of [theirs.iid, theirCard.iid, 'no-such-iid', G.players['0'].active!.iid]) {
      refusedUntouched(G, '0', { type: 'sell', itemIid: iid }, 'notOwned');
    }
  });
});

describe('moving an item', () => {
  it('moves it to another of your heroes with its bonus, its cooldown and its charges — and no experience', () => {
    const G = shop();
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const health = giveItem(G, haze, 'extra_health');
    const front = giveItem(G, haze, 'cold_front', { cooldown: 2 });
    const knock = giveItem(G, haze, 'knockdown');
    knock.charges = 1;
    const [hazeMax, vinMax, vinHp] = [haze.hpMax, vindicta.hpMax, vindicta.hp];
    const exps = [haze, vindicta, lash].map((h) => h.exp);

    perform(G, '0', { type: 'moveItem', itemIid: health.iid, toHeroIid: vindicta.iid });
    expect([haze.hpMax, haze.hp]).toEqual([hazeMax - 2, hazeMax - 2]);
    expect([vindicta.hpMax, vindicta.hp]).toEqual([vinMax + 2, vinHp + 2]);
    perform(G, '0', { type: 'moveItem', itemIid: front.iid, toHeroIid: vindicta.iid });
    perform(G, '0', { type: 'moveItem', itemIid: knock.iid, toHeroIid: lash.iid });

    expect(findWornItem(G, front.iid)).toMatchObject({ bearer: vindicta, item: { cooldowns: { cold_front: 2 } } });
    expect(findWornItem(G, knock.iid)).toMatchObject({ bearer: lash, item: { charges: 1 } });
    expect(health.attachedTo).toBe(vindicta.iid);
    expect(wornItems(haze)).toEqual([]);
    expect([haze, vindicta, lash].map((h) => h.exp)).toEqual(exps);
    expect(me.souls).toBe(20);
  });

  it('refuses the hero that wears it, a hero that wears one, a full hero, an item not yours or not worn, a hero not yours', () => {
    const G = shop();
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const health = giveItem(G, haze, 'extra_health');
    giveItem(G, vindicta, 'extra_health');
    for (const id of ['extra_regen', 'sprint_boots', 'grit']) giveItem(G, lash, id);
    const theirs = giveItem(G, G.players['1'].active!, 'extra_spirit');
    const held = giveCard(G, '0', 'extra_spirit');
    const cases: [string, string, string][] = [
      [health.iid, haze.iid, 'same'],
      [health.iid, vindicta.iid, 'duplicate'],
      [health.iid, lash.iid, 'full'],
      [theirs.iid, haze.iid, 'notWorn'],
      [held.iid, haze.iid, 'notWorn'],                               // a card in the hand is played, not moved
      [health.iid, G.players['1'].bench[0]!.iid, 'noHero'],
    ];
    for (const [itemIid, toHeroIid, why] of cases) refusedUntouched(G, '0', { type: 'moveItem', itemIid, toHeroIid }, why);
  });
});

describe('a Story reward: cards in the hand from the start', () => {
  it('setup puts the reward\'s cards in the player\'s hand — free, no purchase recorded, nothing worn — to be played like any other', () => {
    setMatchConfig({
      heroPreferences: [null, null, null, null],
      seed: 3,
      story: {
        playerHeroes: ['hero_haze', 'hero_vindicta'],
        enemyHeroes: ['hero_abrams'],
        enemyBuff: { atk: 0, hp: 0 },
        playerItems: ['extra_health', 'no_such_item', 'cold_front', 'extra_health'],
      },
    });
    try {
      const G = setupGame();
      const me = G.players['0'];
      expect(ids(me.hand)).toEqual(['extra_health', 'cold_front', 'extra_health']); // a duplicate too; no item, nothing
      for (const c of me.hand) {
        expect(c).toMatchObject({ zone: 'hand', ownerId: '0', attachedTo: undefined });
        expect([c.boughtOnTurn, c.paid, c.cooldowns, c.charges]).toEqual([undefined, undefined, undefined, undefined]);
      }
      expect(G.players['1'].hand).toEqual([]);
      expect([me.active, ...me.bench].flatMap((h) => (h ? wornItems(h) : []))).toEqual([]);
      expect(G.log.map((l) => l.text)).toContain('P0 starts with Cold Front in hand.');
      // Played on the first turn like a bought card: its cooldown starts then; sold, it brings half.
      const front = me.hand[1];
      expect(perform(G, '0', { type: 'playCard', cardIid: front.iid, heroIid: me.active!.iid })).not.toBe(INVALID);
      expect(front.cooldowns).toEqual({ cold_front: 2 });
      expect(sellRefund(G, me.hand[0])).toBe(PRICE[1] / 2);
    } finally {
      configureReadyMatch();
    }
  });
});

describe('net worth counts the hand', () => {
  it('souls, plus the list price of every worn item and every card in the hand', () => {
    const G = shop(20);
    const me = G.players['0'];
    giveItem(G, me.bench[0]!, 'extended_magazine');
    expect(netWorth(G, '0')).toBe(20 + PRICE[1]);
    const titanic = buyToHand(G, '0', 'titanic_magazine');                    // 2 souls for a card listed at 4
    expect(netWorth(G, '0')).toBe(18 + PRICE[1] + PRICE[2]);
    playItem(G, '0', titanic, me.active!);                                      // the magazine is consumed
    expect(netWorth(G, '0')).toBe(18 + PRICE[2]);
    giveCard(G, '0', 'boundless_spirit');
    expect(netWorth(G, '0')).toBe(18 + PRICE[2] + PRICE[4]);
  });
});
