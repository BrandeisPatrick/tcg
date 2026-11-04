/**
 * The shop step (rules §3–§4; src/engine/actions/shop.ts, legality.ts):
 * every own turn opens on it, only its moves — buy, sell, moveItem,
 * closeShop — and `endTurn` are legal in it, and only for the player whose
 * turn it is; `closeShop` moves the turn on to its act step, where the shop is
 * shut. What a purchase costs (an upgrade: the difference), what a sale
 * refunds (what was paid the same turn, else half), what a move carries
 * (bonus, cooldown, charges) and the experience a first wearing pays.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { CardId, GameState, PlayerID } from '@/engine/types';
import { ITEMS, itemCard } from '@/cards';
import { INVALID, perform, type Action } from '@/engine/engine';
import { blocked, buyBlocked, buyPrice, legalActions, sellRefund } from '@/engine/legality';
import { findWornItem, itemPrice, otherPlayer, slotCap, wornItems } from '@/engine/query';
import { onSale } from '@/engine/market';
import { setupGame } from '@/engine/actions/setup';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { resolve } from '@/engine/death';
import { EXP_ON_EQUIP, MAX_ITEMS, PRICE } from '@/engine/constants';
import { setMatchConfig } from '@/storage/matchConfig';
import { buyItem, configureReadyMatch, freshReadyGame, giveItem, readyClient } from './_helpers';

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

  it('beginTurn reopens the shop, whatever step the last turn ended in', () => {
    const G = shop();
    G.step = 'act';
    nextOwnTurn(G, '0');
    expect(G.step).toBe('shop');
  });

  it('in the shop step only the shop\'s moves and endTurn are legal: an act move is refused with shopOpen', () => {
    const G = shop(4);
    const me = G.players['0'];
    const foe = G.players['1'].active!;
    const lash = me.bench[1]!;
    const front = giveItem(G, me.bench[0]!, 'cold_front');
    for (const a of [
      { type: 'attack' },
      { type: 'useSkill', heroIid: lash.iid, targetIid: foe.iid },
      { type: 'activate', itemIid: front.iid, targetIid: foe.iid },
      { type: 'moveHero', fromSlot: 1, toSlot: 0 },
    ] as Action[]) {
      const before = JSON.stringify(G);
      expect(attempt(G, '0', a), a.type).toEqual({ why: 'shopOpen', result: INVALID });
      expect(JSON.stringify(G), a.type).toBe(before);
    }
    for (const a of [
      { type: 'buy', itemId: 'extra_health', heroIid: me.active!.iid },
      { type: 'sell', itemIid: front.iid },
      { type: 'moveItem', itemIid: front.iid, toHeroIid: lash.iid },
      { type: 'closeShop' },
      { type: 'endTurn' },
    ] as Action[]) expect(blocked(G, '0', a), a.type).toBeNull();

    // The list: the buys the souls cover, for each hero; each worn item's sale and moves; then closeShop, endTurn.
    const listed = legalActions(G, '0');
    expect(new Set(listed.map((a) => a.type))).toEqual(new Set(['buy', 'sell', 'moveItem', 'closeShop', 'endTurn']));
    expect(listed.slice(-2)).toEqual([{ type: 'closeShop' }, { type: 'endTurn' }]);
    const heroes = [me.active!, ...me.bench].map((h) => h!.iid);
    for (const a of listed) {
      expect(blocked(G, '0', a), JSON.stringify(a)).toBeNull();
      if (a.type === 'buy') {
        expect(onSale(G, a.itemId)).toBe(true);
        expect(itemPrice(a.itemId)).toBeLessThanOrEqual(4);
        expect(heroes).toContain(a.heroIid);
      }
    }
    const wantBuys = G.market.flatMap((id) => heroes.filter((h) => buyBlocked(G, '0', id, h) === null).map((h) => `${id}>${h}`));
    expect(listed.flatMap((a) => (a.type === 'buy' ? [`${a.itemId}>${a.heroIid}`] : []))).toEqual(wantBuys);
    expect(listed.filter((a) => a.type === 'moveItem').map((a) => (a as { toHeroIid: string }).toHeroIid)).toEqual(heroes.filter((h) => h !== me.bench[0]!.iid));
  });

  it('in the act step the shop is shut: buy, sell, moveItem and closeShop are refused with notShop', () => {
    const G = shop();
    const me = G.players['0'];
    const worn = giveItem(G, me.active!, 'extra_health');
    G.step = 'act';
    for (const a of [
      { type: 'buy', itemId: 'extra_spirit', heroIid: me.active!.iid },
      { type: 'sell', itemIid: worn.iid },
      { type: 'moveItem', itemIid: worn.iid, toHeroIid: me.bench[0]!.iid },
      { type: 'closeShop' },
    ] as Action[]) expect(attempt(G, '0', a), a.type).toEqual({ why: 'notShop', result: INVALID });
    expect(legalActions(G, '0').some((a) => ['buy', 'sell', 'moveItem', 'closeShop'].includes(a.type))).toBe(false);
    expect(blocked(G, '0', { type: 'endTurn' })).toBeNull();
  });

  it('only the player whose turn it is may shop — and nobody during the draft', () => {
    const G = shop();
    G.players['1'].souls = 20;
    const theirs = G.players['1'].active!;
    const worn = giveItem(G, theirs, 'extra_health');
    for (const a of [
      { type: 'buy', itemId: 'extra_spirit', heroIid: theirs.iid },
      { type: 'sell', itemIid: worn.iid },
      { type: 'moveItem', itemIid: worn.iid, toHeroIid: G.players['1'].bench[0]!.iid },
      { type: 'closeShop' },
    ] as Action[]) expect(attempt(G, '1', a), a.type).toEqual({ why: 'notYourTurn', result: INVALID });
    expect(legalActions(G, '1').some((a) => ['buy', 'sell', 'moveItem', 'closeShop'].includes(a.type))).toBe(false);

    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 3 });
    try {
      const draft = setupGame();
      expect(draft.draft).not.toBeNull();
      expect(draft.step).toBe('shop');
      for (const pid of ['0', '1'] as const) expect(blocked(draft, pid, { type: 'closeShop' })).toBe('notYourTurn');
    } finally {
      configureReadyMatch();
    }
  });

  it('a promotion owed comes first, in the shop step too', () => {
    const G = shop();
    G.players['0'].active!.hp = 0;
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    expect(blocked(G, '0', { type: 'buy', itemId: 'extra_health', heroIid: G.players['0'].bench[0]!.iid })).toBe('promotionOwed');
    expect(blocked(G, '0', { type: 'closeShop' })).toBe('promotionOwed');
    expect(blocked(G, '0', { type: 'promoteToActive', benchIid: G.players['0'].bench[0]!.iid })).toBeNull();
  });
});

describe('buying', () => {
  it('buys an item on sale for the Active, a bench hero or a corpse: paid for, worn at once, its bonus on', () => {
    const G = shop(20);
    const me = G.players['0'];
    const haze = me.active!;
    const lash = me.bench[1]!;
    const paige = me.bench[2]!;
    paige.hp = 0;
    paige.respawnTurnsLeft = 2;
    const [hazeMax, hazeHp, lashSpirit, paigeMax] = [haze.hpMax, haze.hp, lash.spiritMod, paige.hpMax];

    const health = buyItem(G, '0', 'extra_health', haze);           // tier 1: 2 souls, +2 HP
    expect(me.souls).toBe(18);
    expect([haze.hpMax, haze.hp]).toEqual([hazeMax + 2, hazeHp + 2]);
    expect(health).toMatchObject({ zone: 'equipment', attachedTo: haze.iid, ownerId: '0', boughtOnTurn: 2, paid: 2 });

    buyItem(G, '0', 'improved_spirit', lash);                       // tier 2: 4 souls, +2 Spirit
    expect(me.souls).toBe(14);
    expect(lash.spiritMod).toBe(lashSpirit + 2);

    buyItem(G, '0', 'extra_health', paige);                         // a corpse may be kitted out
    expect(me.souls).toBe(12);
    expect([paige.hpMax, paige.hp]).toEqual([paigeMax + 2, 0]);
    expect(G.fx.filter((e) => e.kind === 'cast' && e.castKind === 'equip').map((e) => (e as { iid?: string }).iid)).toEqual([haze.iid, lash.iid, paige.iid]);
    expect(G.log.at(-1)!.text).toContain('Extra Health');
  });

  it('the refusals — no such item, not on sale, no hero of yours, a duplicate, a full hero, too few souls — change nothing', () => {
    const G = shop(20);
    const me = G.players['0'];
    const haze = me.active!;
    giveItem(G, haze, 'extra_health');
    const off = ITEMS.find((i) => !onSale(G, i.id))!.id;
    const cases: [CardId, string, string][] = [
      ['no_such_item', haze.iid, 'noItem'],
      ['hero_dynamo', haze.iid, 'noItem'],
      [off, haze.iid, 'notOnSale'],
      ['extra_spirit', G.players['1'].active!.iid, 'noHero'],
      ['extra_spirit', 'no-such-iid', 'noHero'],
      ['extra_health', haze.iid, 'duplicate'],
    ];
    for (const [itemId, heroIid, why] of cases) {
      const before = JSON.stringify(G);
      expect(attempt(G, '0', { type: 'buy', itemId, heroIid }), `${itemId} for ${heroIid}`).toEqual({ why, result: INVALID });
      expect(JSON.stringify(G)).toBe(before);
    }
    giveItem(G, haze, 'extra_regen');
    giveItem(G, haze, 'sprint_boots');
    expect(wornItems(haze)).toHaveLength(MAX_ITEMS);
    expect(slotCap(G, '0')).toBe(MAX_ITEMS);
    expect(attempt(G, '0', { type: 'buy', itemId: 'extra_spirit', heroIid: haze.iid }).why).toBe('full');
    me.souls = 1;
    expect(attempt(G, '0', { type: 'buy', itemId: 'extra_spirit', heroIid: me.bench[0]!.iid })).toEqual({ why: 'souls', result: INVALID });
    expect(me.souls).toBe(1);
  });

  it('the flex slot: a side that has it wears a fourth item', () => {
    const G = shop(20);
    const haze = G.players['0'].active!;
    for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(G, haze, id);
    expect(buyBlocked(G, '0', 'extra_spirit', haze.iid)).toBe('full');
    G.players['0'].flexSlot = true;
    expect(slotCap(G, '0')).toBe(MAX_ITEMS + 1);
    buyItem(G, '0', 'extra_spirit', haze);
    expect(wornItems(haze)).toHaveLength(4);
    expect(buyBlocked(G, '0', 'mystic_burst', haze.iid)).toBe('full');
  });

  it('an upgrade of a worn component costs the difference and takes its place — on a full hero too', () => {
    const G = shop(2);
    const me = G.players['0'];
    const haze = me.active!;
    const atk = haze.atkMod;
    const mag = giveItem(G, haze, 'extended_magazine');            // tier 1, +1 Bullet Power
    giveItem(G, haze, 'extra_health');
    giveItem(G, haze, 'extra_regen');
    expect(itemCard('titanic_magazine')!.upgradesFrom).toBe('extended_magazine');
    expect(buyPrice(haze, 'titanic_magazine')).toBe(PRICE[2] - PRICE[1]);
    expect(buyPrice(me.bench[0]!, 'titanic_magazine')).toBe(PRICE[2]); // no component worn: the full price

    const titanic = buyItem(G, '0', 'titanic_magazine', haze);       // tier 2, +2 Bullet Power
    expect(me.souls).toBe(0);
    expect(wornItems(haze).map((it) => it.cardId)).toEqual(['extra_health', 'extra_regen', 'titanic_magazine']);
    expect(findWornItem(G, mag.iid)).toBeNull();
    expect(haze.atkMod).toBe(atk + 2);
    expect(titanic).toMatchObject({ paid: 2, replaced: mag });
  });
});

describe('selling', () => {
  it('sold on its purchase turn, an item refunds what was paid, and its bonus goes with it', () => {
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

  it('an upgrade sold back on its purchase turn gives its component back — unless it was moved since', () => {
    const G = shop(2);
    const me = G.players['0'];
    const haze = me.active!;
    const atk = haze.atkMod;
    const mag = giveItem(G, haze, 'extended_magazine');
    const titanic = buyItem(G, '0', 'titanic_magazine', haze);
    perform(G, '0', { type: 'sell', itemIid: titanic.iid });
    expect(me.souls).toBe(2);                                       // the difference back
    expect(wornItems(haze)).toEqual([mag]);                         // and the magazine, as it was
    expect(haze.atkMod).toBe(atk + 1);

    // Moved first, the upgrade no longer undoes: the sale refunds what was paid, and that is all.
    const again = buyItem(G, '0', 'titanic_magazine', haze);
    perform(G, '0', { type: 'moveItem', itemIid: again.iid, toHeroIid: me.bench[0]!.iid });
    perform(G, '0', { type: 'sell', itemIid: again.iid });
    expect(me.souls).toBe(2);
    expect(wornItems(haze)).toEqual([]);
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
    expect(sellRefund(G, titanic)).toBe(PRICE[2] / 2);
    perform(G, '0', { type: 'sell', itemIid: titanic.iid });
    expect(me.souls).toBe(souls + PRICE[2] / 2);
    expect(wornItems(haze)).toEqual([]);
    expect(titanic.replaced).toBeUndefined();                       // dropped when its turn ended
  });

  it('only an item one of your heroes wears can be sold', () => {
    const G = shop();
    const theirs = giveItem(G, G.players['1'].active!, 'extra_health');
    expect(attempt(G, '0', { type: 'sell', itemIid: theirs.iid })).toEqual({ why: 'notWorn', result: INVALID });
    expect(attempt(G, '0', { type: 'sell', itemIid: 'no-such-iid' })).toEqual({ why: 'notWorn', result: INVALID });
    expect(attempt(G, '0', { type: 'sell', itemIid: G.players['0'].active!.iid }).why).toBe('notWorn'); // a hero is no item
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

  it('refuses the hero that wears it, a hero that wears one, a full hero, an item not yours, a hero not yours', () => {
    const G = shop();
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const health = giveItem(G, haze, 'extra_health');
    giveItem(G, vindicta, 'extra_health');
    for (const id of ['extra_regen', 'sprint_boots', 'grit']) giveItem(G, lash, id);
    const theirs = giveItem(G, G.players['1'].active!, 'extra_spirit');
    const cases: [string, string, string][] = [
      [health.iid, haze.iid, 'same'],
      [health.iid, vindicta.iid, 'duplicate'],
      [health.iid, lash.iid, 'full'],
      [theirs.iid, haze.iid, 'notWorn'],
      [health.iid, G.players['1'].bench[0]!.iid, 'noHero'],
    ];
    for (const [itemIid, toHeroIid, why] of cases) {
      const before = JSON.stringify(G);
      expect(attempt(G, '0', { type: 'moveItem', itemIid, toHeroIid }), why).toEqual({ why, result: INVALID });
      expect(JSON.stringify(G)).toBe(before);
    }
  });
});

describe('experience for wearing an item', () => {
  it('a hero earns EXP_ON_EQUIP the first time it wears an item — not for a rebuy, a move, or as a corpse', () => {
    const G = shop(40);
    const me = G.players['0'];
    const [haze, vindicta, paige] = [me.active!, me.bench[0]!, me.bench[2]!];
    const exp = () => [haze.exp, vindicta.exp, paige.exp];
    expect(exp()).toEqual([0, 0, 0]);

    const first = buyItem(G, '0', 'extra_health', haze);
    expect(exp()).toEqual([EXP_ON_EQUIP, 0, 0]);
    perform(G, '0', { type: 'sell', itemIid: first.iid });
    buyItem(G, '0', 'extra_health', haze);                          // bought back: nothing more
    expect(exp()).toEqual([EXP_ON_EQUIP, 0, 0]);

    const spirit = buyItem(G, '0', 'extra_spirit', haze);
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, 0, 0]);
    perform(G, '0', { type: 'moveItem', itemIid: spirit.iid, toHeroIid: vindicta.iid });
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, 0, 0]);                // moved in: nothing
    buyItem(G, '0', 'extra_health', vindicta);                      // Vindicta's own first Extra Health
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, EXP_ON_EQUIP, 0]);

    paige.hp = 0;
    paige.respawnTurnsLeft = 2;
    buyItem(G, '0', 'extra_spirit', paige);                         // a corpse earns nothing
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, EXP_ON_EQUIP, 0]);
  });
});
