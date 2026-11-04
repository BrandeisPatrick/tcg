import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, HeroCard, PlayerID } from '@/engine/types';
import { INVALID, perform, type Action } from '@/engine/engine';
import {
  activateBlocked, attackBlocked, buyBlocked, buyPrice, moveBlocked, skillBlocked,
  type ActivateBlock, type AttackBlock, type MoveBlock, type PromoteBlock, type ShopBlock, type SkillBlock,
} from '@/engine/legality';
import { MAX_ITEMS, PRICE, RETREAT_COST, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { heroData, itemPrice, slotCap, wornItems } from '@/engine/query';
import { onSale } from '@/engine/market';
import { addStatus } from '@/engine/statusOps';
import { STATUSES } from '@/statuses';
import { CARDS_BY_ID, ITEMS } from '@/cards';
import { isValidTarget } from '@/ui/board/targeting';
import {
  ACT_OVER, SHOP_OPEN, actionRefusal, activateBlockReason, attackBlockReason, moveBlockReason, promoteBlockReason,
  shopBlockReason, skillBlockReason,
} from '@/ui/board/heroActions';
import { statusClass } from '@/ui/card/StatusIcon';
import type { PendingPlay } from '@/ui/helpers';
import { freshReadyGame, giveItem } from '../engine/_helpers';

// The board lights the heroes an armed skill or active item may be aimed at,
// the shop sheet greys what cannot be bought, sold or moved, and both say why
// a move was refused, by asking the engine (`skillBlocked` / `activateBlocked`
// / `buyBlocked` / `blocked`) — never by their own copy of the rules. These pin
// the UI to the engine over the boards a copy would get wrong: a corpse on the
// rival's bench, a hero already wearing the item, a hero at the slot cap, an
// item cooling down or spent, a free borrowed ultimate, a stunned hero, a move
// made in the wrong step of the turn.

const ME: PlayerID = '0';

/** P0 = Haze (Active), Vindicta / Lash / Paige on the bench, souls to spare,
 *  in the act step of its turn; P1 = Abrams (Active), Dynamo / Kelvin / Seven.
 *  Nobody wears anything. */
function board(): GameState {
  const G = freshReadyGame();
  G.players[ME].souls = 10;
  return G;
}

/** The same board in P0's shop step, with `souls` to spend. */
function shopBoard(souls = 10): GameState {
  const G = freshReadyGame({ step: 'shop' });
  G.players[ME].souls = souls;
  return G;
}

const heroesOf = (G: GameState): CardInstance[] =>
  (['0', '1'] as PlayerID[]).flatMap((pid) => [G.players[pid].active, ...G.players[pid].bench].filter((c): c is CardInstance => !!c));
const nameOf = (c: CardInstance) => CARDS_BY_ID[c.cardId]?.name ?? c.cardId;
const armedItem = (item: CardInstance): PendingPlay => ({ kind: 'activate', iid: item.iid, title: nameOf(item), desc: '', filter: 'anyBoard' });
const armedSkill = (hero: CardInstance): PendingPlay => ({ kind: 'useSkill', iid: hero.iid, title: nameOf(hero), desc: '', filter: 'anyBoard' });

/** Would the engine's front door take `a` from `pid` as it stands? (A copy, so nothing is spent.) */
function taken(G: GameState, a: Action, pid: PlayerID = ME): boolean {
  return perform(structuredClone(G), pid, a) !== INVALID;
}

/** The UI glows `target` for the armed item exactly when the engine would use
 *  the item on it. */
function expectGlowMatchesEngine(G: GameState, item: CardInstance, label: string) {
  for (const target of heroesOf(G)) {
    const engine = taken(G, { type: 'activate', itemIid: item.iid, targetIid: target.iid });
    expect(isValidTarget(G, ME, armedItem(item), target), `${label}: ${nameOf(item)} on ${nameOf(target)}`).toBe(engine);
  }
}

/** The shop sheet offers `itemId` (no refusal on its Buy button) for exactly
 *  the heroes the engine would buy it for. */
function expectShopMatchesEngine(G: GameState, itemId: string, label: string) {
  for (const hero of heroesOf(G)) {
    const a: Action = { type: 'buy', itemId, heroIid: hero.iid };
    expect(actionRefusal(G, ME, a) === null, `${label}: ${itemId} for ${nameOf(hero)}`).toBe(taken(G, a));
  }
}

describe('the glow on the tiles is the engine\'s answer', () => {
  it('an item for rivals: never a corpse, never an ally', () => {
    const G = board();
    const hex = giveItem(G, G.players[ME].active!, 'slowing_hex'); // any rival
    const corpse = G.players['1'].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expectGlowMatchesEngine(G, hex, 'a corpse on the rival bench');
    expect(isValidTarget(G, ME, armedItem(hex), corpse)).toBe(false);
    expect(isValidTarget(G, ME, armedItem(hex), G.players['1'].active!)).toBe(true);
    expect(isValidTarget(G, ME, armedItem(hex), G.players[ME].active!)).toBe(false);
  });

  it('an item for allies skips your own corpse too — worn on the bench, it reaches the Active', () => {
    const G = board();
    const rite = giveItem(G, G.players[ME].bench[0]!, 'healing_rite'); // ally hero
    const down = G.players[ME].bench[2]!;
    down.hp = 0; down.respawnTurnsLeft = 1;
    expectGlowMatchesEngine(G, rite, 'a corpse on your own bench');
    expect(isValidTarget(G, ME, armedItem(rite), down)).toBe(false);
    expect(isValidTarget(G, ME, armedItem(rite), G.players[ME].active!)).toBe(true);
  });

  it('an Active-only item reaches the rival Active and nothing else', () => {
    const G = board();
    const barrel = giveItem(G, G.players[ME].active!, 'rusted_barrel');
    expectGlowMatchesEngine(G, barrel, 'enemy Active');
    expect(heroesOf(G).filter((h) => isValidTarget(G, ME, armedItem(barrel), h)).map((h) => h.iid)).toEqual([G.players['1'].active!.iid]);
  });

  it('an item the engine will not use glows nothing, and the refusal says why: passive, cooling down, out of charges, its bearer\'s ability spent', () => {
    const G = board();
    const me = G.players[ME];
    const foe = G.players['1'].active!;
    const magazine = giveItem(G, me.active!, 'extended_magazine');
    const cooling = giveItem(G, me.active!, 'cold_front', { cooldown: 1 });
    const spent = giveItem(G, me.bench[0]!, 'knockdown');
    spent.charges = 0;
    const lash = me.bench[1]!;
    const barrel = giveItem(G, lash, 'rusted_barrel');
    expect(perform(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: foe.iid })).not.toBe(INVALID); // Lash's one ability of the turn
    for (const [item, code, text] of [
      [magazine, 'passive', 'A passive item: always on'],
      [cooling, 'cooldown', 'Ready in 1 turn'],
      [spent, 'charges', 'No charges left'],
      [barrel, 'used', 'Used its skill this turn'],
    ] as const) {
      expectGlowMatchesEngine(G, item, code);
      expect(heroesOf(G).some((h) => isValidTarget(G, ME, armedItem(item), h)), code).toBe(false);
      expect(actionRefusal(G, ME, { type: 'activate', itemIid: item.iid, targetIid: foe.iid })).toEqual({ code, text });
    }
  });

  it('a stunned hero can use neither its skill nor an item it wears, but can still be kitted out in the shop', () => {
    const G = board();
    const lash = G.players[ME].bench[1]!; // skill: any rival
    const hex = giveItem(G, lash, 'slowing_hex');
    addStatus(G, lash, 'stun', 1, 1);
    expect(skillBlocked(G, ME, lash)).toBe('status');
    expect(activateBlocked(G, ME, hex.iid)).toBe('status');
    for (const target of heroesOf(G)) {
      expect(isValidTarget(G, ME, armedSkill(lash), target), nameOf(target)).toBe(false);
      expect(isValidTarget(G, ME, armedItem(hex), target), nameOf(target)).toBe(false);
    }
    const stunned = { code: 'status', text: 'Cannot use abilities (status)' };
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })).toEqual(stunned);
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: hex.iid, targetIid: G.players['1'].active!.iid })).toEqual(stunned);
    G.step = 'shop';
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: lash.iid })).toBeNull();
  });

  it('a ready skill glows exactly what the engine takes', () => {
    const G = board();
    const lash = G.players[ME].bench[1]!;
    const dynamoCorpse = G.players['1'].bench[0]!;
    dynamoCorpse.hp = 0; dynamoCorpse.respawnTurnsLeft = 2;
    for (const target of heroesOf(G)) {
      const engine = taken(G, { type: 'useSkill', heroIid: lash.iid, targetIid: target.iid });
      expect(isValidTarget(G, ME, armedSkill(lash), target), nameOf(target)).toBe(engine);
    }
    expect(isValidTarget(G, ME, armedSkill(lash), dynamoCorpse)).toBe(false);
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: dynamoCorpse.iid })?.text)
      .toBe("Not a valid target for Lash's skill");
  });

  it('nothing is a target while nothing is armed, or once the armed item is no longer worn', () => {
    const G = board();
    const haze = G.players[ME].active!;
    const hex = giveItem(G, haze, 'slowing_hex');
    expect(isValidTarget(G, ME, null, G.players['1'].active!)).toBe(false);
    expect(isValidTarget(G, ME, armedItem(hex), G.players['1'].active!)).toBe(true);
    haze.attached = (haze.attached ?? []).filter((it) => it.iid !== hex.iid);
    expect(isValidTarget(G, ME, armedItem(hex), G.players['1'].active!)).toBe(false);
  });
});

describe('the shop sheet\'s buttons are the engine\'s answer', () => {
  it('an item is bought for any hero of yours — a corpse too — and never for a rival', () => {
    const G = shopBoard();
    const corpse = G.players[ME].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expectShopMatchesEngine(G, 'extended_magazine', 'any hero');
    for (const hero of heroesOf(G)) {
      expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: hero.iid }) === null, nameOf(hero)).toBe(hero.ownerId === ME);
    }
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: G.players['1'].active!.iid })).toEqual({
      code: 'noHero', text: 'That is not one of your heroes',
    });
  });

  it('a hero already wearing the item is refused, and the refusal names them; another hero may have one', () => {
    const G = shopBoard();
    const haze = G.players[ME].active!;
    giveItem(G, haze, 'extended_magazine');
    expectShopMatchesEngine(G, 'extended_magazine', 'a duplicate');
    expect(buyBlocked(G, ME, 'extended_magazine', haze.iid)).toBe('duplicate');
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: haze.iid })).toEqual({
      code: 'duplicate', text: 'Haze already wears Extended Magazine',
    });
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: G.players[ME].bench[0]!.iid })).toBeNull();
  });

  it('a hero at the slot cap is refused — sell one first — unless the item upgrades one it wears', () => {
    const G = shopBoard();
    const haze = G.players[ME].active!;
    for (const id of ['extended_magazine', 'extra_health', 'extra_regen']) giveItem(G, haze, id);
    expect(wornItems(haze)).toHaveLength(slotCap(G, ME));
    expectShopMatchesEngine(G, 'extra_spirit', 'a full hero');
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extra_spirit', heroIid: haze.iid })).toEqual({
      code: 'full', text: `Haze wears ${MAX_ITEMS} items — sell one first`,
    });
    // Titanic Magazine upgrades the Extended Magazine Haze wears: it takes its place.
    expectShopMatchesEngine(G, 'titanic_magazine', 'an upgrade on a full hero');
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'titanic_magazine', heroIid: haze.iid })).toBeNull();
  });

  it('a full hero already wearing the item is a duplicate before it is full', () => {
    const G = shopBoard();
    const haze = G.players[ME].active!;
    for (const id of ['extended_magazine', 'extra_spirit', 'extra_regen']) giveItem(G, haze, id);
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: haze.iid })?.code).toBe('duplicate');
  });

  it('an item this match does not sell is named; one the souls do not cover says its price — an upgrade\'s is the difference', () => {
    const G = shopBoard(1);
    const haze = G.players[ME].active!;
    const off = ITEMS.find((i) => !onSale(G, i.id))!;
    expect(actionRefusal(G, ME, { type: 'buy', itemId: off.id, heroIid: haze.iid })).toEqual({
      code: 'notOnSale', text: `${off.name} is not on sale this match`,
    });
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: haze.iid })).toEqual({
      code: 'souls', text: 'Need 2 souls — you have 1',
    });
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'titanic_magazine', heroIid: haze.iid })?.text).toBe('Need 4 souls — you have 1');
    giveItem(G, haze, 'extended_magazine');
    expect(buyPrice(haze, 'titanic_magazine')).toBe(PRICE[2] - PRICE[1]);
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'titanic_magazine', heroIid: haze.iid })).toEqual({
      code: 'souls', text: 'Need 2 souls — you have 1',
    });
  });

  it('the shop is the player\'s own, in its own turn: the rival\'s shop moves are refused', () => {
    const G = shopBoard();
    const theirs = G.players['1'];
    theirs.souls = 10;
    const worn = giveItem(G, theirs.active!, 'extra_health');
    for (const a of [
      { type: 'buy', itemId: 'extended_magazine', heroIid: theirs.active!.iid },
      { type: 'sell', itemIid: worn.iid },
      { type: 'moveItem', itemIid: worn.iid, toHeroIid: theirs.bench[0]!.iid },
      { type: 'closeShop' },
    ] as Action[]) {
      expect(actionRefusal(G, '1', a), a.type).toEqual({ code: 'notYourTurn', text: 'Not your turn' });
      expect(taken(G, a, '1'), a.type).toBe(false);
    }
  });

  it('past the shop step the shop is shut until the next turn', () => {
    const G = board();
    const haze = G.players[ME].active!;
    const worn = giveItem(G, haze, 'extra_health');
    for (const a of [
      { type: 'buy', itemId: 'extended_magazine', heroIid: haze.iid },
      { type: 'sell', itemIid: worn.iid },
      { type: 'moveItem', itemIid: worn.iid, toHeroIid: G.players[ME].bench[0]!.iid },
      { type: 'closeShop' },
    ] as Action[]) {
      expect(actionRefusal(G, ME, a), a.type).toEqual({ code: 'notShop', text: 'The shop is closed until your next turn' });
      expect(taken(G, a), a.type).toBe(false);
    }
  });

  it('selling and moving: an item not yours, the hero that wears it, a hero that wears one, a full hero, a rival', () => {
    const G = shopBoard();
    const me = G.players[ME];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const health = giveItem(G, haze, 'extra_health');
    giveItem(G, vindicta, 'extra_health');
    for (const id of ['extra_regen', 'sprint_boots', 'grit']) giveItem(G, lash, id);
    const theirs = giveItem(G, G.players['1'].active!, 'extra_spirit');
    const move = (toHeroIid: string) => actionRefusal(G, ME, { type: 'moveItem', itemIid: health.iid, toHeroIid });
    expect(actionRefusal(G, ME, { type: 'sell', itemIid: theirs.iid })).toEqual({ code: 'notWorn', text: 'Not one of your items' });
    expect(move(haze.iid)).toEqual({ code: 'same', text: 'It is already on Haze' });
    expect(move(vindicta.iid)).toEqual({ code: 'duplicate', text: 'Vindicta already wears Extra Health' });
    expect(move(lash.iid)).toEqual({ code: 'full', text: `Lash wears ${MAX_ITEMS} items — sell one first` });
    expect(move(G.players['1'].bench[0]!.iid)).toEqual({ code: 'noHero', text: 'That is not one of your heroes' });
  });

  it('a shop move the engine takes is not refused', () => {
    const G = shopBoard();
    const me = G.players[ME];
    const worn = giveItem(G, me.active!, 'extra_health');
    for (const a of [
      { type: 'buy', itemId: 'extended_magazine', heroIid: me.active!.iid },
      { type: 'sell', itemIid: worn.iid },
      { type: 'moveItem', itemIid: worn.iid, toHeroIid: me.bench[2]!.iid },
      { type: 'closeShop' },
      { type: 'endTurn' },
    ] as Action[]) {
      expect(actionRefusal(G, ME, a), a.type).toBeNull();
      expect(taken(G, a), a.type).toBe(true);
    }
  });
});

describe('what an ability costs is the engine\'s answer: nothing', () => {
  it('a borrowed ultimate (Sinclair\'s copy) is free: usable with no souls', () => {
    const G = board();
    G.players[ME].souls = 0;
    const haze = G.players[ME].active!;
    haze.borrowedUlt = 'eff_ult_abrams';
    const use: Action = { type: 'useSkill', heroIid: haze.iid, skillId: 'eff_ult_abrams' };
    expect(skillBlocked(G, ME, haze, undefined, 'eff_ult_abrams')).toBeNull();
    expect(actionRefusal(G, ME, use)).toBeNull();
    expect(taken(G, use)).toBe(true);
  });

  it('a hero\'s own ultimate is locked below Level 2, and says so; at it, it is free', () => {
    const G = board();
    G.players[ME].souls = 0;
    const haze = G.players[ME].active!;
    const use: Action = { type: 'useSkill', heroIid: haze.iid, skillId: 'eff_ult_haze' };
    expect(actionRefusal(G, ME, use)).toEqual({ code: 'locked', text: `Unlocks at Level ${ULT_UNLOCK_LEVEL}` });
    expect(taken(G, use)).toBe(false);
    haze.level = ULT_UNLOCK_LEVEL;
    expect(actionRefusal(G, ME, use)).toBeNull();
    expect(taken(G, use)).toBe(true);
  });

  it('an ultimate is never bought: it is a kit ability, no item', () => {
    const G = shopBoard();
    const haze = G.players[ME].active!;
    const buy: Action = { type: 'buy', itemId: 'ult_abrams', heroIid: haze.iid };
    expect(itemPrice('ult_abrams')).toBe(0);
    expect(buyBlocked(G, ME, 'ult_abrams', haze.iid)).toBe('noItem');
    expect(actionRefusal(G, ME, buy)).toEqual({ code: 'noItem', text: 'No such item' });
    expect(taken(G, buy)).toBe(false);
  });
});

describe('a refused move is said, with the engine\'s own code', () => {
  it('an item aimed at a corpse is refused for its target', () => {
    const G = board();
    const hex = giveItem(G, G.players[ME].active!, 'slowing_hex');
    const corpse = G.players['1'].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: hex.iid, targetIid: corpse.iid })).toEqual({
      code: 'target', text: 'Not a valid target for Slowing Hex',
    });
  });

  it('an item that needs a target, used with none named, is refused for its target; one that takes none goes without', () => {
    const G = board();
    const hex = giveItem(G, G.players[ME].active!, 'slowing_hex');
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: hex.iid })?.code).toBe('target');
    const grit = giveItem(G, G.players[ME].bench[0]!, 'grit');
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: grit.iid })).toBeNull();
  });

  it('a retreat without the souls says what it costs', () => {
    const G = board();
    G.players[ME].souls = RETREAT_COST - 1;
    expect(moveBlocked(G, ME, 1, 0)).toBe('souls');
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual({
      code: 'souls', text: `Need ${RETREAT_COST} soul${RETREAT_COST === 1 ? '' : 's'}`,
    });
  });

  it('a second retreat in a turn says one a turn', () => {
    const G = board();
    G.retreatUsed = true;
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual({ code: 'retreated', text: 'One Retreat a turn' });
  });

  it('anything but ending the turn after the attack says the attack ended the turn', () => {
    const G = board();
    G.attackUsed = true;
    const lash = G.players[ME].bench[1]!;
    const rite = giveItem(G, G.players[ME].bench[0]!, 'healing_rite');
    const over = { code: 'actOver', text: 'The attack ended your turn' };
    expect(ACT_OVER).toBe(over.text);
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })).toEqual(over);
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: rite.iid, targetIid: G.players[ME].active!.iid })).toEqual(over);
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual(over);
    expect(actionRefusal(G, ME, { type: 'attack' })?.code).toBe('used');
    expect(actionRefusal(G, ME, { type: 'endTurn' })).toBeNull();
  });

  it('while the shop is open, an act move says to close it first', () => {
    const G = shopBoard();
    const me = G.players[ME];
    const foe = G.players['1'].active!;
    const lash = me.bench[1]!;
    const front = giveItem(G, me.bench[0]!, 'cold_front');
    const acts: Action[] = [
      { type: 'attack' },
      { type: 'useSkill', heroIid: lash.iid, targetIid: foe.iid },
      { type: 'activate', itemIid: front.iid, targetIid: foe.iid },
      { type: 'moveHero', fromSlot: 1, toSlot: 0 },
    ];
    expect(SHOP_OPEN).toBe('Close the shop first');
    for (const a of acts) {
      expect(actionRefusal(G, ME, a), a.type).toEqual({ code: 'shopOpen', text: SHOP_OPEN });
      expect(taken(G, a), a.type).toBe(false);
    }
    expect(actionRefusal(G, ME, { type: 'endTurn' })).toBeNull();
    // Closed, the same moves are the act's to make.
    expect(perform(G, ME, { type: 'closeShop' })).not.toBe(INVALID);
    for (const a of acts) expect(actionRefusal(G, ME, a), a.type).toBeNull();
  });

  it('while a promotion is owed, everything else waits for it — in the shop step too', () => {
    const G = board();
    const rite = giveItem(G, G.players[ME].bench[1]!, 'healing_rite');
    const active = G.players[ME].active!;
    active.hp = 0; active.respawnTurnsLeft = 3; active.statuses = [];
    G.pendingPromotion = ME;
    const wait = { code: 'promotionOwed', text: 'Choose who steps up first' };
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: rite.iid, targetIid: G.players[ME].bench[0]!.iid })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'endTurn' })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'promoteToActive', benchIid: G.players[ME].bench[0]!.iid })).toBeNull();
    G.step = 'shop';
    expect(actionRefusal(G, ME, { type: 'buy', itemId: 'extended_magazine', heroIid: G.players[ME].bench[0]!.iid })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'promoteToActive', benchIid: G.players[ME].bench[0]!.iid })).toBeNull();
  });

  it('a move the engine takes is not refused', () => {
    const G = board();
    const rite = giveItem(G, G.players[ME].bench[0]!, 'healing_rite');
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: rite.iid, targetIid: G.players[ME].active!.iid })).toBeNull();
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toBeNull();
    expect(attackBlocked(G, ME)).toBeNull();
    expect(actionRefusal(G, ME, { type: 'attack' })).toBeNull();
  });
});

// The wording has a line for every code the engine can answer with. Each record
// below is keyed by the engine's own union, so a code added there is a compile
// error here until it is worded.
describe('every block code has words', () => {
  const skill: Record<SkillBlock, true> = { noSkill: true, actOver: true, down: true, locked: true, used: true, status: true, cooldown: true, hp: true, target: true };
  const attack: Record<AttackBlock, true> = { turn1: true, used: true, noActive: true, cannot: true, noTarget: true, target: true };
  const activate: Record<ActivateBlock, true> = { noItem: true, passive: true, actOver: true, down: true, used: true, status: true, charges: true, cooldown: true, target: true };
  const shop: Record<ShopBlock, true> = { notYourTurn: true, notShop: true, noItem: true, notOnSale: true, noHero: true, duplicate: true, full: true, souls: true, notWorn: true, same: true };
  const move: Record<MoveBlock, true> = { same: true, actOver: true, empty: true, benchOnly: true, down: true, rooted: true, retreated: true, souls: true, illegal: true };
  const promote: Record<PromoteBlock, true> = { notOnBench: true, notOwed: true, down: true, benchOnly: true };

  it('skills: all but noSkill (nothing to say: there is no skill to offer)', () => {
    for (const code of Object.keys(skill) as SkillBlock[]) {
      if (code === 'noSkill') expect(skillBlockReason(code)).toBe('');
      else expect(skillBlockReason(code).length, code).toBeGreaterThan(0);
    }
  });

  it('attacks', () => {
    for (const code of Object.keys(attack) as AttackBlock[]) expect(attackBlockReason(code, null).length, code).toBeGreaterThan(0);
  });

  it('active items, with and without the item and its bearer named', () => {
    const G = board();
    const haze = G.players[ME].active!;
    const front = giveItem(G, haze, 'cold_front', { cooldown: 2 });
    for (const code of Object.keys(activate) as ActivateBlock[]) {
      expect(activateBlockReason(code).length, code).toBeGreaterThan(0);
      expect(activateBlockReason(code, front, haze).length, code).toBeGreaterThan(0);
    }
  });

  it('shop moves, with and without the item, the hero and the price named', () => {
    for (const code of Object.keys(shop) as ShopBlock[]) {
      expect(shopBlockReason(code).length, code).toBeGreaterThan(0);
      expect(shopBlockReason(code, { item: 'Extended Magazine', hero: 'Haze', cost: 2, have: 1, slots: MAX_ITEMS }).length, code).toBeGreaterThan(0);
    }
    // The ones about a hero name the hero; the ones about an item name the item.
    for (const code of ['duplicate', 'full', 'same'] as const) {
      expect(shopBlockReason(code, { item: 'Extended Magazine', hero: 'Haze' }), code).toContain('Haze');
    }
    for (const code of ['duplicate', 'notOnSale'] as const) {
      expect(shopBlockReason(code, { item: 'Extended Magazine', hero: 'Haze' }), code).toContain('Extended Magazine');
    }
  });

  it('swaps and promotions', () => {
    for (const code of Object.keys(move) as MoveBlock[]) expect(moveBlockReason(code).length, code).toBeGreaterThan(0);
    for (const code of Object.keys(promote) as PromoteBlock[]) expect(promoteBlockReason(code).length, code).toBeGreaterThan(0);
  });

  it('a skill on cooldown says how many turns are left, and a skill held back by another ability says which', () => {
    const lash = board().players[ME].bench[1]!; // one skill: Ground Strike
    const skillId = heroData(lash)!.skills[0];
    expect(skillBlockReason('cooldown')).toBe('On cooldown'); // no hero to ask: no number
    expect(skillBlockReason('cooldown', { ...lash, cooldowns: { [skillId]: 2 } })).toBe('Ready in 2 turns');
    expect(skillBlockReason('cooldown', { ...lash, cooldowns: { [skillId]: 1 } }, skillId)).toBe('Ready in 1 turn');
    expect(skillBlockReason('used', lash)).toBe('Already used');
    expect(skillBlockReason('used', { ...lash, lastSkillUsed: skillId }, skillId)).toBe('Already used');
    // Skill, ultimate and active items share the one ability a turn, and the line says which was used.
    expect(skillBlockReason('used', { ...lash, lastSkillUsed: 'eff_ult_lash' }, skillId)).toBe('Used its ultimate this turn');
    expect(skillBlockReason('used', { ...lash, lastSkillUsed: skillId }, 'eff_ult_lash')).toBe('Used its skill this turn');
    expect(skillBlockReason('used', { ...lash, lastSkillUsed: 'cold_front' }, skillId)).toBe('Used Cold Front this turn');
    // No hero of the roster has two skills: a throwaway one carries Lash's and Kelvin's.
    const twin: HeroCard = {
      id: 'hero_ui_twin', name: 'Twin', type: 'hero', rarity: 3, atk: 2, hp: 8,
      skills: ['skill_lash', 'skill_kelvin'], signature: ['extra_spirit', 'mystic_burst'],
    };
    CARDS_BY_ID[twin.id] = twin;
    try {
      const both = { ...lash, cardId: twin.id };
      expect(skillBlockReason('used', { ...both, lastSkillUsed: 'skill_kelvin' }, 'skill_lash')).toBe('Used its other skill this turn');
    } finally {
      delete CARDS_BY_ID[twin.id];
    }
  });

  it('an item on cooldown says how many turns are left, and an item held back by its bearer\'s other ability says which', () => {
    const G = board();
    const lash = G.players[ME].bench[1]!;
    const front = giveItem(G, lash, 'cold_front', { cooldown: 2 });
    expect(activateBlockReason('cooldown')).toBe('On cooldown'); // no item to ask: no number
    expect(activateBlockReason('cooldown', front)).toBe('Ready in 2 turns');
    expect(activateBlockReason('cooldown', { ...front, cooldowns: { cold_front: 1 } })).toBe('Ready in 1 turn');
    expect(activateBlockReason('used', front, lash)).toBe('Already used');
    expect(activateBlockReason('used', front, { ...lash, lastSkillUsed: 'cold_front' })).toBe('Already used');
    expect(activateBlockReason('used', front, { ...lash, lastSkillUsed: 'skill_lash' })).toBe('Used its skill this turn');
    expect(activateBlockReason('used', front, { ...lash, lastSkillUsed: 'eff_ult_lash' })).toBe('Used its ultimate this turn');
    expect(activateBlockReason('used', front, { ...lash, lastSkillUsed: 'grit' })).toBe('Used Grit this turn');
  });
});

describe('a status chip wears the colour its definition says', () => {
  it('buffs above 0, debuffs below, the rest neutral — sleep and reverb are debuffs', () => {
    for (const s of STATUSES) {
      expect(statusClass(s.id), s.id).toBe(s.hvalue > 0 ? 'buff' : s.hvalue < 0 ? 'debuff' : 'utility');
    }
    expect(statusClass('sleep')).toBe('debuff');
    expect(statusClass('reverb')).toBe('debuff');
    expect(statusClass('shield')).toBe('buff');
    expect(statusClass('siphon_drain')).toBe('utility');
  });
});
