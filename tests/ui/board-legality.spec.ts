import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, HeroCard, PlayerID } from '@/engine/types';
import { INVALID, perform, type Action } from '@/engine/engine';
import {
  activateBlocked, attackBlocked, moveBlocked, playBlocked, playCost, playTargets, skillBlocked,
  type ActivateBlock, type AttackBlock, type ChooseActiveBlock, type DiscardBlock, type MoveBlock, type PlaceBlock, type PlayBlock,
  type PromoteBlock, type SkillBlock,
} from '@/engine/legality';
import { MAX_ITEMS, PRICE, ULT_COST, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { heroData, heroRetreat, itemPrice, kitCost, slotCap, wornItems } from '@/engine/query';
import { addStatus } from '@/engine/statusOps';
import { STATUSES } from '@/statuses';
import { CARDS_BY_ID, ITEMS } from '@/cards';
import { deckProblem, isLegalDeck } from '@/cards/decks';
import { isValidTarget } from '@/ui/board/targeting';
import {
  ACT_OVER, DISCARD_FIRST, actionRefusal, activateBlockReason, attackBlockReason, chooseActiveBlockReason, discardBlockReason,
  moveBlockReason, placeBlockReason, playBlockReason, promoteBlockReason, skillBlockReason,
} from '@/ui/board/heroActions';
import { statusClass } from '@/ui/card/StatusIcon';
import type { PendingPlay } from '@/ui/helpers';
import { freshReadyGame, giveCard, giveItem } from '../engine/_helpers';

// The board lights the heroes an armed skill or active item may be aimed at
// and the heroes a card from the hand may go on, the hand dims what cannot be
// played, and both say why a move was refused, by asking the engine
// (`skillBlocked` / `activateBlocked` / `playBlocked` / `placeHeroBlocked` /
// `blocked`) — never by their own copy of the rules. These pin the UI to the
// engine over the boards a copy would get wrong: a corpse on the rival's
// bench, a hero already wearing the item, a hero at the slot cap, an item
// cooling down or spent, a play the souls do not cover, a skill or an
// ultimate short of its souls, a stunned hero, a move made while a choice is
// owed.

const ME: PlayerID = '0';

/** P0 = Haze (Active), Vindicta / Lash / Paige on the bench, souls to spare,
 *  in the act step of its turn; P1 = Abrams (Active), Dynamo / Kelvin / Seven.
 *  Nobody wears anything. */
function board(): GameState {
  const G = freshReadyGame();
  G.players[ME].souls = 10;
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

/** A card in the hand goes on (no refusal when it is dropped on a hero) for
 *  exactly the heroes the engine would play it onto — the ones `playTargets`
 *  lists, which is what the board lights. */
function expectPlayMatchesEngine(G: GameState, card: CardInstance, label: string) {
  const lit = playTargets(G, ME, card.iid).map((h) => h.iid);
  for (const hero of heroesOf(G)) {
    const a: Action = { type: 'playCard', cardIid: card.iid, heroIid: hero.iid };
    const engine = taken(G, a);
    expect(actionRefusal(G, ME, a) === null, `${label}: ${nameOf(card)} on ${nameOf(hero)}`).toBe(engine);
    expect(lit.includes(hero.iid), `${label}: ${nameOf(card)} lights ${nameOf(hero)}`).toBe(engine);
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

  it('a stunned hero can use neither its skill nor an item it wears, but can still be kitted out from the hand', () => {
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
    const card = giveCard(G, ME, 'extended_magazine');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: lash.iid })).toBeNull();
    expect(playTargets(G, ME, card.iid)).toContain(lash);
  });

  it('a ready skill glows exactly what the engine takes', () => {
    // Paige's Plot Armor is aimed at one of her side's heroes; a corpse of hers is none.
    const G = board();
    const paige = G.players[ME].bench[2]!;
    const vindictaCorpse = G.players[ME].bench[0]!;
    vindictaCorpse.hp = 0; vindictaCorpse.respawnTurnsLeft = 2;
    for (const target of heroesOf(G)) {
      const engine = taken(G, { type: 'useSkill', heroIid: paige.iid, targetIid: target.iid });
      expect(isValidTarget(G, ME, armedSkill(paige), target), nameOf(target)).toBe(engine);
    }
    expect(isValidTarget(G, ME, armedSkill(paige), G.players[ME].active!)).toBe(true);
    expect(isValidTarget(G, ME, armedSkill(paige), G.players['1'].active!)).toBe(false);
    expect(isValidTarget(G, ME, armedSkill(paige), vindictaCorpse)).toBe(false);
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: paige.iid, targetIid: vindictaCorpse.iid })?.text)
      .toBe("Not a valid target for Paige's skill");
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

  it('nothing is a target once the armed card has left the hand: no hero is lit, and a drop is refused', () => {
    const G = board();
    const card = giveCard(G, ME, 'extended_magazine');
    const haze = G.players[ME].active!;
    expect(playTargets(G, ME, card.iid)).toContain(haze);
    G.players[ME].hand = [];
    expect(playTargets(G, ME, card.iid)).toEqual([]);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: haze.iid })).toEqual({
      code: 'notInHand', text: 'That card is not in your hand',
    });
  });
});

describe('a card from the hand goes on what the engine says', () => {
  it('onto any hero of yours — a corpse too — and never onto a rival', () => {
    const G = board();
    const card = giveCard(G, ME, 'extended_magazine');
    const corpse = G.players[ME].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expectPlayMatchesEngine(G, card, 'the act step');
    for (const hero of heroesOf(G)) {
      expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: hero.iid }) === null, nameOf(hero)).toBe(hero.ownerId === ME);
    }
    // A card dropped on your own corpse goes on (it was refused when cards were cast); on a rival, never.
    expect(taken(G, { type: 'playCard', cardIid: card.iid, heroIid: corpse.iid })).toBe(true);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: G.players['1'].active!.iid })).toEqual({
      code: 'noHero', text: 'Play it onto one of your heroes',
    });
    G.players[ME].souls = 1;
    expectPlayMatchesEngine(G, card, 'too few souls');
  });

  it('a hero already wearing the item does not light, and the refusal names them; another hero may have one', () => {
    const G = board();
    const card = giveCard(G, ME, 'extended_magazine');
    const haze = G.players[ME].active!;
    giveItem(G, haze, 'extended_magazine');
    expectPlayMatchesEngine(G, card, 'a duplicate');
    expect(playBlocked(G, ME, card.iid, haze.iid)).toBe('duplicate');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: haze.iid })).toEqual({
      code: 'duplicate', text: 'Haze already wears Extended Magazine',
    });
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: G.players[ME].bench[0]!.iid })).toBeNull();
  });

  it('a hero at the slot cap is refused — there is no discard — unless the card upgrades one it wears', () => {
    const G = board();
    const haze = G.players[ME].active!;
    for (const id of ['extended_magazine', 'extra_health', 'extra_regen']) giveItem(G, haze, id);
    expect(wornItems(haze)).toHaveLength(slotCap(G, ME));
    const spirit = giveCard(G, ME, 'extra_spirit');
    expectPlayMatchesEngine(G, spirit, 'a full hero');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: spirit.iid, heroIid: haze.iid })).toEqual({
      code: 'full', text: `Haze wears ${MAX_ITEMS} items`,
    });
    // Titanic Magazine upgrades the Extended Magazine Haze wears: it takes its place.
    const titanic = giveCard(G, ME, 'titanic_magazine');
    expectPlayMatchesEngine(G, titanic, 'an upgrade on a full hero');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: titanic.iid, heroIid: haze.iid })).toBeNull();
  });

  it('a full hero already wearing the item is a duplicate before it is full', () => {
    const G = board();
    const haze = G.players[ME].active!;
    for (const id of ['extended_magazine', 'extra_spirit', 'extra_regen']) giveItem(G, haze, id);
    const card = giveCard(G, ME, 'extended_magazine');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: haze.iid })?.code).toBe('duplicate');
  });

  it('a card played with no hero named is refused for its hero', () => {
    const G = board();
    const card = giveCard(G, ME, 'slowing_hex');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid } as unknown as Action)).toEqual({
      code: 'noHero', text: 'Play it onto one of your heroes',
    });
    expect(taken(G, { type: 'playCard', cardIid: card.iid } as unknown as Action)).toBe(false);
  });
});

describe('the hand\'s plays are the engine\'s answer', () => {
  it('a hero from the hand goes to the bench for nothing; into the lane only while it is empty', () => {
    const G = board();
    G.players[ME].bench[2] = null;
    const kelvin = giveCard(G, ME, 'hero_kelvin');
    expect(actionRefusal(G, ME, { type: 'placeHero', cardIid: kelvin.iid })).toBeNull();
    expect(actionRefusal(G, ME, { type: 'placeHero', cardIid: kelvin.iid, toActive: true })).toEqual({
      code: 'occupied', text: 'Your Active slot is taken',
    });
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: kelvin.iid, heroIid: G.players[ME].active!.iid })).toEqual({
      code: 'hero', text: 'A hero goes on the bench — tap it in your hand',
    });
    expect(taken(G, { type: 'placeHero', cardIid: kelvin.iid })).toBe(true);
    G.players[ME].bench[2] = giveCard(G, ME, 'hero_seven');
    expect(actionRefusal(G, ME, { type: 'placeHero', cardIid: kelvin.iid })).toEqual({ code: 'benchFull', text: 'Your bench is full' });
  });

  it('a play the souls do not cover says its price — an upgrade onto the hero wearing its part, the difference', () => {
    const G = board();
    G.players[ME].souls = 1;
    const haze = G.players[ME].active!;
    const mag = giveCard(G, ME, 'extended_magazine');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: mag.iid, heroIid: haze.iid })).toEqual({
      code: 'souls', text: 'Need 2 souls — you have 1',
    });
    const titanic = giveCard(G, ME, 'titanic_magazine');
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: titanic.iid, heroIid: haze.iid })?.text).toBe('Need 4 souls — you have 1');
    giveItem(G, haze, 'extended_magazine');
    expect(playCost(haze, 'titanic_magazine')).toBe(PRICE[2] - PRICE[1]);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: titanic.iid, heroIid: haze.iid })).toEqual({
      code: 'souls', text: 'Need 2 souls — you have 1',
    });
    expect(itemPrice('titanic_magazine')).toBe(PRICE[2]);
  });

  it('the hand is the player\'s own, in its own turn: the rival\'s plays are refused', () => {
    const G = board();
    const theirs = G.players['1'];
    theirs.souls = 10;
    theirs.bench[2] = null;
    const held = giveCard(G, '1', 'extra_spirit');
    const hero = giveCard(G, '1', 'hero_kelvin');
    for (const a of [
      { type: 'playCard', cardIid: held.iid, heroIid: theirs.active!.iid },
      { type: 'placeHero', cardIid: hero.iid },
    ] as Action[]) {
      expect(actionRefusal(G, '1', a), a.type).toEqual({ code: 'notYourTurn', text: 'Not your turn' });
      expect(taken(G, a, '1'), a.type).toBe(false);
    }
  });

  it('a draw card\'s discard and the opening\'s first Active say what they need', () => {
    const G = board();
    const card = giveCard(G, ME, 'grit');
    expect(actionRefusal(G, ME, { type: 'discard', cardIids: [card.iid] })).toEqual({ code: 'notOwed', text: 'Nothing to discard' });
    G.pendingDiscard = { pid: ME, count: 1, cardId: 'improved_cooldown' };
    expect(actionRefusal(G, ME, { type: 'discard', cardIids: [] })).toEqual({ code: 'none', text: 'Choose the cards to discard' });
    expect(actionRefusal(G, ME, { type: 'discard', cardIids: [card.iid] })).toBeNull();
    G.pendingDiscard = undefined;
    G.players[ME].active = null;
    G.pendingActive = ME;
    const rem = giveCard(G, ME, 'hero_rem');
    const kelvin = giveCard(G, ME, 'hero_kelvin');
    expect(actionRefusal(G, ME, { type: 'chooseActive', cardIid: rem.iid })).toEqual({ code: 'benchOnly', text: 'That hero can only fight from the bench' });
    expect(actionRefusal(G, ME, { type: 'chooseActive', cardIid: card.iid })).toEqual({ code: 'notHero', text: 'Choose a hero' });
    expect(actionRefusal(G, ME, { type: 'attack' })).toEqual({ code: 'activeOwed', text: 'Put your first Active in the lane' });
    expect(actionRefusal(G, '1', { type: 'chooseActive', cardIid: kelvin.iid })).toBeNull(); // from either seat
  });

  it('a hand move the engine takes is not refused', () => {
    const G = board();
    const me = G.players[ME];
    me.bench[2] = null;
    const held = giveCard(G, ME, 'extra_spirit');
    const hero = giveCard(G, ME, 'hero_kelvin');
    for (const a of [
      { type: 'playCard', cardIid: held.iid, heroIid: me.bench[0]!.iid },
      { type: 'placeHero', cardIid: hero.iid },
      { type: 'endTurn' },
    ] as Action[]) {
      expect(actionRefusal(G, ME, a), a.type).toBeNull();
      expect(taken(G, a), a.type).toBe(true);
    }
  });
});

describe('what an ability costs is the engine\'s answer: kitCost', () => {
  it('a skill short of its souls is refused, and the line says what it costs', () => {
    const G = board();
    const paige = G.players[ME].bench[2]!; // Plot Armor: 2 souls
    const use: Action = { type: 'useSkill', heroIid: paige.iid, targetIid: paige.iid };
    expect(kitCost(paige)).toBe(2);
    G.players[ME].souls = 1;
    expect(skillBlocked(G, ME, paige, paige.iid)).toBe('souls');
    expect(actionRefusal(G, ME, use)).toEqual({ code: 'souls', text: 'Need 2 souls' });
    expect(taken(G, use)).toBe(false);
    G.players[ME].souls = 2;
    expect(actionRefusal(G, ME, use)).toBeNull();
    expect(taken(G, use)).toBe(true);
  });

  it('a hero\'s own ultimate is locked below Level 2, and says so; at it, it costs its size\'s souls', () => {
    const G = board();
    G.players[ME].souls = 0;
    const haze = G.players[ME].active!;
    const use: Action = { type: 'useSkill', heroIid: haze.iid, skillId: 'eff_ult_haze' };
    expect(actionRefusal(G, ME, use)).toEqual({ code: 'locked', text: `Unlocks at Level ${ULT_UNLOCK_LEVEL}` });
    expect(taken(G, use)).toBe(false);
    haze.level = ULT_UNLOCK_LEVEL;
    // Bullet Dance is a large ultimate: 12 souls.
    expect(kitCost(haze, 'eff_ult_haze')).toBe(ULT_COST.large);
    expect(actionRefusal(G, ME, use)).toEqual({ code: 'souls', text: `Need ${ULT_COST.large} souls` });
    expect(taken(G, use)).toBe(false);
    G.players[ME].souls = ULT_COST.large;
    expect(actionRefusal(G, ME, use)).toBeNull();
    expect(taken(G, use)).toBe(true);
  });

  it('an ultimate is never dealt, so never a card in a hand or a deck: it is a kit ability, no item', () => {
    const G = board();
    expect(itemPrice('ult_abrams')).toBe(0);
    expect(isLegalDeck(Array(16).fill('ult_abrams'))).toBe(false);
    expect(deckProblem(['ult_abrams'])).toBe('notItem');
    expect(G.players[ME].hand).toEqual([]);
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

  it('a retreat without the souls says what it costs: the leaving hero\'s printed retreat', () => {
    const G = board();
    const price = heroRetreat(G.players[ME].active!); // Haze: 1
    expect(price).toBe(1);
    G.players[ME].souls = price - 1;
    expect(moveBlocked(G, ME, 1, 0)).toBe('souls');
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual({
      code: 'souls', text: `Need ${price} soul${price === 1 ? '' : 's'}`,
    });
  });

  it('a second retreat in a turn says one a turn', () => {
    const G = board();
    G.retreatUsed = true;
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual({ code: 'retreated', text: 'One Retreat a turn' });
  });

  it('anything but ending the turn after the attack says the attack ended the turn — a card from the hand too', () => {
    const G = board();
    G.attackUsed = true;
    const lash = G.players[ME].bench[1]!;
    const rite = giveItem(G, G.players[ME].bench[0]!, 'healing_rite');
    const card = giveCard(G, ME, 'extended_magazine');
    const over = { code: 'actOver', text: 'The attack ended your turn' };
    expect(ACT_OVER).toBe(over.text);
    expect(actionRefusal(G, ME, { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })).toEqual(over);
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: rite.iid, targetIid: G.players[ME].active!.iid })).toEqual(over);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: G.players[ME].active!.iid })).toEqual(over);
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toEqual(over);
    expect(actionRefusal(G, ME, { type: 'attack' })?.code).toBe('used');
    expect(actionRefusal(G, ME, { type: 'endTurn' })).toBeNull();
  });

  it('while a draw card\'s discard is owed, everything else says to discard first', () => {
    const G = board();
    const me = G.players[ME];
    const foe = G.players['1'].active!;
    const lash = me.bench[1]!;
    const front = giveItem(G, me.bench[0]!, 'cold_front');
    const card = giveCard(G, ME, 'extended_magazine');
    G.pendingDiscard = { pid: ME, count: 1, cardId: 'improved_cooldown' };
    const acts: Action[] = [
      { type: 'attack' },
      { type: 'useSkill', heroIid: lash.iid, targetIid: foe.iid },
      { type: 'activate', itemIid: front.iid, targetIid: foe.iid },
      { type: 'moveHero', fromSlot: 1, toSlot: 0 },
      { type: 'playCard', cardIid: card.iid, heroIid: lash.iid },
      { type: 'endTurn' },
    ];
    expect(DISCARD_FIRST).toBe('Discard first');
    for (const a of acts) {
      expect(actionRefusal(G, ME, a), a.type).toEqual({ code: 'discardOwed', text: DISCARD_FIRST });
      expect(taken(G, a), a.type).toBe(false);
    }
    // Paid, the same moves are the turn's to make.
    expect(perform(G, ME, { type: 'discard', cardIids: [card.iid] })).not.toBe(INVALID);
    for (const a of acts.slice(0, 4)) expect(actionRefusal(G, ME, a), a.type).toBeNull();
  });

  it('while a promotion is owed, everything else waits for it — a hero from the hand too', () => {
    const G = board();
    const rite = giveItem(G, G.players[ME].bench[1]!, 'healing_rite');
    const card = giveCard(G, ME, 'healing_rite');
    const active = G.players[ME].active!;
    active.hp = 0; active.respawnTurnsLeft = 3; active.statuses = [];
    G.pendingPromotion = ME;
    const wait = { code: 'promotionOwed', text: 'Choose who steps up first' };
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: rite.iid, targetIid: G.players[ME].bench[0]!.iid })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: G.players[ME].bench[0]!.iid })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'endTurn' })).toEqual(wait);
    expect(actionRefusal(G, ME, { type: 'promoteToActive', benchIid: G.players[ME].bench[0]!.iid })).toBeNull();
    const hero = giveCard(G, ME, 'hero_kelvin');
    expect(actionRefusal(G, ME, { type: 'placeHero', cardIid: hero.iid })).toEqual(wait);
  });

  it('a move the engine takes is not refused', () => {
    const G = board();
    const rite = giveItem(G, G.players[ME].bench[0]!, 'healing_rite');
    const card = giveCard(G, ME, 'healing_rite');
    expect(actionRefusal(G, ME, { type: 'activate', itemIid: rite.iid, targetIid: G.players[ME].active!.iid })).toBeNull();
    expect(actionRefusal(G, ME, { type: 'playCard', cardIid: card.iid, heroIid: G.players[ME].active!.iid })).toBeNull();
    expect(actionRefusal(G, ME, { type: 'moveHero', fromSlot: 1, toSlot: 0 })).toBeNull();
    expect(attackBlocked(G, ME)).toBeNull();
    expect(actionRefusal(G, ME, { type: 'attack' })).toBeNull();
  });
});

// The wording has a line for every code the engine can answer with. Each record
// below is keyed by the engine's own union, so a code added there is a compile
// error here until it is worded.
describe('every block code has words', () => {
  const skill: Record<SkillBlock, true> = { noSkill: true, trigger: true, actOver: true, down: true, locked: true, used: true, status: true, cooldown: true, souls: true, hp: true, target: true };
  const attack: Record<AttackBlock, true> = { turn1: true, used: true, noActive: true, cannot: true, noTarget: true, target: true };
  const activate: Record<ActivateBlock, true> = { noItem: true, passive: true, actOver: true, down: true, used: true, status: true, charges: true, cooldown: true, target: true };
  const play: Record<PlayBlock, true> = { notYourTurn: true, notInHand: true, hero: true, noHero: true, duplicate: true, full: true, souls: true, upgrade: true };
  const place: Record<PlaceBlock, true> = { notYourTurn: true, notInHand: true, notHero: true, occupied: true, benchOnly: true, benchFull: true };
  const choose: Record<ChooseActiveBlock, true> = { notOwed: true, notInHand: true, notHero: true, benchOnly: true };
  const discard: Record<DiscardBlock, true> = { notOwed: true, none: true, tooMany: true, repeat: true, notInHand: true };
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

  it('heroes from the hand, the first Active and the discard', () => {
    for (const code of Object.keys(place) as PlaceBlock[]) expect(placeBlockReason(code).length, code).toBeGreaterThan(0);
    for (const code of Object.keys(choose) as ChooseActiveBlock[]) expect(chooseActiveBlockReason(code).length, code).toBeGreaterThan(0);
    for (const code of Object.keys(discard) as DiscardBlock[]) expect(discardBlockReason(code).length, code).toBeGreaterThan(0);
  });

  it('cards played from the hand, with and without the card and the hero named', () => {
    for (const code of Object.keys(play) as PlayBlock[]) {
      expect(playBlockReason(code).length, code).toBeGreaterThan(0);
      expect(playBlockReason(code, { item: 'Extended Magazine', hero: 'Haze', slots: MAX_ITEMS, cost: 2, have: 1 }).length, code).toBeGreaterThan(0);
    }
    expect(playBlockReason('souls', { cost: 4, have: 1 })).toBe('Need 4 souls — you have 1');
    for (const code of ['duplicate', 'full'] as const) {
      expect(playBlockReason(code, { item: 'Extended Magazine', hero: 'Haze' }), code).toContain('Haze');
    }
    expect(playBlockReason('duplicate', { item: 'Extended Magazine', hero: 'Haze' })).toContain('Extended Magazine');
  });

  it('swaps and promotions', () => {
    for (const code of Object.keys(move) as MoveBlock[]) expect(moveBlockReason(code).length, code).toBeGreaterThan(0);
    for (const code of Object.keys(promote) as PromoteBlock[]) expect(promoteBlockReason(code).length, code).toBeGreaterThan(0);
  });

  it('a skill on cooldown says how many turns are left, and a skill held back by another ability says which', () => {
    const lash = board().players[ME].bench[1]!; // one skill: Ground Strike
    expect(skillBlockReason('souls')).toBe('Not enough souls'); // no hero to ask: no number
    expect(skillBlockReason('souls', lash)).toBe('Need 3 souls');
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
      growth: { atk: 1, hp: 1, spirit: 1 }, retreat: 1,
      profile: { role: 'Controller', mix: { tank: 1, damage: 1, control: 3, support: 0 }, reach: 'many', curve: 'mid' },
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
