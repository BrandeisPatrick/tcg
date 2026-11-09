/**
 * The hand (docs/deck-plan.md; src/engine/actions/hand.ts, deck.ts,
 * legality.ts): what replaced the shop. Every own turn opens with its income
 * (5 souls) and its draw (1 card); a turn has no steps — cards are played, and
 * abilities used, until the attack ends it — and only the player whose turn it
 * is plays. An item goes from the hand onto a hero (bench and corpses
 * included) for its price, or, an upgrade onto the hero wearing its component,
 * for the difference: it evolves, and the component goes to the discard pile.
 * A play sets the item's cooldown, charges, bonus and the first-wearing
 * experience going, and an item Deadlock builds into a bigger one shuffles
 * that upgrade into the deck (the player picks among several). A hero goes
 * from the hand to the bench for free, or into an empty lane. A draw card
 * draws and owes a discard from anywhere in the hand. These are the shop
 * spec's tests carried over to their deck equivalents (a sale's is the
 * discard); the few shop mechanics with none are kept, skipped, saying why.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { upgradesOf } from '@/cards/decks';
import { INVALID, perform, type Action } from '@/engine/engine';
import {
  blocked, discardBlocked, freeBenchSlot, legalActions, placeHeroBlocked, playBlocked, playCost, playTargets,
} from '@/engine/legality';
import { activeCooldown, itemCooldown, itemPrice, netWorth, otherPlayer, slotCap, wornItems } from '@/engine/query';
import { setupGame } from '@/engine/actions/setup';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { drawCards } from '@/engine/deck';
import { resolve } from '@/engine/death';
import {
  DRAW_PER_TURN, EXP_ON_EQUIP, HARD_CC_CHARGES, LANE_INCOME, MAX_HAND, MAX_ITEMS, PRICE,
} from '@/engine/constants';
import { setMatchConfig } from '@/storage/matchConfig';
import {
  configureReadyMatch, freshReadyGame, giveCard, giveItem, makeAttack, makeHero, playItem, playNew, readyClient, stackDeck,
} from './_helpers';

/** P0's turn (engine turn 2) with `souls` to spend. */
function turn(souls = 20): GameState {
  const G = freshReadyGame();
  G.players['0'].souls = souls;
  return G;
}

/** End `pid`'s turn, pass the rival's whole turn, and begin `pid`'s next own
 *  turn: its income lands and it draws. */
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

const play = (card: CardInstance, hero: CardInstance, upgradeId?: string): Action =>
  (upgradeId ? { type: 'playCard', cardIid: card.iid, heroIid: hero.iid, upgradeId } : { type: 'playCard', cardIid: card.iid, heroIid: hero.iid });
const ids = (cards: CardInstance[]) => cards.map((c) => c.cardId);

beforeAll(configureReadyMatch);

describe('the turn: income, the draw, then play', () => {
  it('every own turn opens with LANE_INCOME souls and DRAW_PER_TURN card from the top of the deck', () => {
    const G = turn(0);
    const [a, b] = stackDeck(G, '0', ['extended_magazine', 'grit']);
    nextOwnTurn(G, '0');
    expect(G.players['0'].souls).toBe(LANE_INCOME);
    expect(DRAW_PER_TURN).toBe(1);
    expect(G.players['0'].hand).toEqual([a]);
    expect(a.zone).toBe('hand');
    expect(G.players['0'].deck).toEqual([b]);
    expect(G.fx.some((e) => e.kind === 'deck' && e.what === 'draw' && e.iid === a.iid)).toBe(true);
    nextOwnTurn(G, '0');
    expect(G.players['0'].hand).toEqual([a, b]);
    expect(G.players['0'].souls).toBe(2 * LANE_INCOME);
  });

  it('an empty deck draws nothing, and nothing else happens', () => {
    const G = turn(0);
    const hp = G.players['0'].active!.hp;
    nextOwnTurn(G, '0');
    expect(G.players['0'].hand).toEqual([]);
    expect(G.players['0'].active!.hp).toBe(hp);
    expect(G.players['0'].souls).toBe(LANE_INCOME);
  });

  it(`a hand holds ${MAX_HAND}: a draw into a full hand is skipped, the card left in the deck`, () => {
    const G = turn(0);
    for (let i = 0; i < MAX_HAND; i++) giveCard(G, '0', 'grit');
    const [top] = stackDeck(G, '0', ['cold_front']);
    expect(drawCards(G, '0', 1)).toEqual([]);
    expect(G.players['0'].hand).toHaveLength(MAX_HAND);
    expect(G.players['0'].deck).toEqual([top]);
    nextOwnTurn(G, '0');
    expect(G.players['0'].hand).toHaveLength(MAX_HAND);
    expect(G.players['0'].deck).toEqual([top]);
  });

  it('through a client: a card in the hand is played from it, and the turn goes on to the attack', () => {
    const c = readyClient();
    const s = c.getState()!;
    const G = structuredClone(s.G) as GameState;
    giveCard(G, '0', 'extended_magazine');
    (c as any).store.dispatch({ type: 'SYNC', state: { ...s, G } });
    let g = c.getState()!.G as GameState;
    const [card] = g.players['0'].hand;
    c.moves.playCard(card.iid, g.players['0'].active!.iid);
    g = c.getState()!.G as GameState;
    expect(g.players['0'].hand).toEqual([]);
    expect(ids(wornItems(g.players['0'].active!))).toEqual(['extended_magazine']);
    expect(g.players['0'].souls).toBe(LANE_INCOME - PRICE[1]);
  });

  it('only the player whose turn it is plays a card or benches a hero — and nobody during the draft', () => {
    const G = turn(20);
    const card = giveCard(G, '1', 'extended_magazine');
    G.players['1'].souls = 20;
    G.players['1'].bench[2] = null;
    const hero = giveCard(G, '1', 'hero_kelvin');
    refusedUntouched(G, '1', play(card, G.players['1'].active!), 'notYourTurn');
    refusedUntouched(G, '1', { type: 'placeHero', cardIid: hero.iid }, 'notYourTurn');
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 5 });
    let drafting: GameState;
    try { drafting = setupGame(); } finally { configureReadyMatch(); }
    expect(drafting.draft).not.toBeNull();
    expect(playBlocked(drafting, '0', 'x', 'y')).toBe('notYourTurn');
    expect(placeHeroBlocked(drafting, '0', 'x')).toBe('notYourTurn');
  });

  it('a promotion owed comes first: no card played, no hero benched', () => {
    const G = turn(20);
    const me = G.players['0'];
    const card = giveCard(G, '0', 'extended_magazine');
    me.active!.hp = 0;
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    refusedUntouched(G, '0', play(card, me.bench[0]!), 'promotionOwed');
    expect(legalActions(G, '0').every((a) => a.type === 'promoteToActive')).toBe(true);
  });
});

describe('playing an item: its price, from the hand onto a hero', () => {
  it('onto the Active, a bench hero or a corpse: the card is worn, its bonus on, its price paid', () => {
    const G = turn(20);
    const me = G.players['0'];
    const [haze, vindicta, , paige] = [me.active!, ...me.bench] as CardInstance[];
    paige.hp = 0;
    paige.respawnTurnsLeft = 2;
    const atk = haze.atkMod;
    const mag = playItem(G, '0', giveCard(G, '0', 'extended_magazine'), haze);
    expect(haze.atkMod).toBe(atk + 1);
    expect(mag).toMatchObject({ zone: 'equipment', attachedTo: haze.iid });
    playItem(G, '0', giveCard(G, '0', 'extra_health'), vindicta);
    playItem(G, '0', giveCard(G, '0', 'extra_spirit'), paige);
    expect(me.souls).toBe(20 - 3 * PRICE[1]);
    expect(me.hand).toEqual([]);
  });

  it('a play is no ability and no attack: the hero may still use its skill, and the turn goes on', () => {
    const G = turn(20);
    const lash = G.players['0'].bench[1]!;
    playItem(G, '0', giveCard(G, '0', 'extra_spirit'), lash);
    expect(lash.skillUsedThisTurn).toBe(false);
    expect(G.attackUsed).toBe(false);
    expect(blocked(G, '0', { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid })).toBeNull();
  });

  it('refused once the turn\'s attack is made', () => {
    const G = turn(20);
    const card = giveCard(G, '0', 'extended_magazine');
    makeAttack(G, '0');
    refusedUntouched(G, '0', play(card, G.players['0'].active!), 'actOver');
  });

  it('the refusals, in order — not in the hand, a hero card, no hero of yours, a duplicate, a full hero, too few souls, no such upgrade — change nothing', () => {
    const G = turn(1);
    const me = G.players['0'];
    const haze = me.active!;
    const card = giveCard(G, '0', 'extended_magazine');
    refusedUntouched(G, '0', { type: 'playCard', cardIid: 'nope', heroIid: haze.iid }, 'notInHand');
    const hero = giveCard(G, '0', 'hero_kelvin');
    refusedUntouched(G, '0', play(hero, haze), 'hero');
    refusedUntouched(G, '0', play(card, G.players['1'].active!), 'noHero');
    giveItem(G, haze, 'extended_magazine');
    refusedUntouched(G, '0', play(card, haze), 'duplicate');
    const lash = me.bench[1]!;
    for (const id of ['extra_spirit', 'extra_regen', 'sprint_boots']) giveItem(G, lash, id);
    refusedUntouched(G, '0', play(card, lash), 'full');
    refusedUntouched(G, '0', play(card, me.bench[0]!), 'souls');
    me.souls = 20;
    refusedUntouched(G, '0', play(card, me.bench[0]!, 'fortitude'), 'upgrade');
    expect(attempt(G, '0', play(card, me.bench[0]!, 'titanic_magazine')).result).not.toBe(INVALID);
  });

  it('the cap and the flex slot: a full hero takes no fourth card — unless it evolves one it wears — and with the flex slot it does', () => {
    const G = turn(40);
    const haze = G.players['0'].active!;
    for (const id of ['extended_magazine', 'extra_regen', 'sprint_boots']) giveItem(G, haze, id);
    expect(slotCap(G, '0')).toBe(MAX_ITEMS);
    const spirit = giveCard(G, '0', 'extra_spirit');
    const titanic = giveCard(G, '0', 'titanic_magazine');
    expect(playBlocked(G, '0', spirit.iid, haze.iid)).toBe('full');
    expect(playTargets(G, '0', spirit.iid).map((h) => h.iid)).not.toContain(haze.iid);
    expect(playTargets(G, '0', titanic.iid).map((h) => h.iid)).toContain(haze.iid);
    playItem(G, '0', titanic, haze);                                            // takes the magazine's place
    expect(wornItems(haze)).toHaveLength(MAX_ITEMS);
    G.players['0'].flexSlot = true;
    expect(slotCap(G, '0')).toBe(MAX_ITEMS + 1);
    playItem(G, '0', spirit, haze);
    expect(wornItems(haze)).toHaveLength(MAX_ITEMS + 1);
    const burst = giveCard(G, '0', 'mystic_burst');
    expect(playBlocked(G, '0', burst.iid, haze.iid)).toBe('full');
  });

  it('playTargets: the heroes an item may go on, in board order — the Active, then the bench, corpses included — souls permitting', () => {
    const G = turn(20);
    const me = G.players['0'];
    const [haze, vindicta, lash, paige] = [me.active!, ...me.bench] as CardInstance[];
    paige.hp = 0;
    paige.respawnTurnsLeft = 1;
    const card = giveCard(G, '0', 'extra_health');
    expect(playTargets(G, '0', card.iid)).toEqual([haze, vindicta, lash, paige]);
    giveItem(G, vindicta, 'extra_health');
    for (const id of ['extra_spirit', 'extra_regen', 'sprint_boots']) giveItem(G, lash, id);
    expect(playTargets(G, '0', card.iid)).toEqual([haze, paige]);
    expect(playTargets(G, '0', 'no-such-iid')).toEqual([]);
    expect(playTargets(G, '1', card.iid)).toEqual([]);
    me.souls = PRICE[1] - 1;
    expect(playTargets(G, '0', card.iid)).toEqual([]);
  });

  it('a merged Rem takes no card while she rides her bearer; her bench slot is kept for her', () => {
    const G = turn(20);
    const me = G.players['0'];
    const rem = makeHero('hero_rem', '0', 'equipment', 3);
    rem.attachedTo = me.active!.iid;
    rem.remMergeTurnsLeft = 2;
    me.active!.attached = [rem];
    me.bench[2] = null; // Rem's slot, while she rides on the Active
    const card = giveCard(G, '0', 'extended_magazine');
    expect(playTargets(G, '0', card.iid).map((h) => h.iid)).not.toContain(rem.iid);
    expect(playBlocked(G, '0', card.iid, rem.iid)).toBe('noHero');
    const hero = giveCard(G, '0', 'hero_kelvin');
    expect(freeBenchSlot(me)).toBeUndefined();
    expect(placeHeroBlocked(G, '0', hero.iid)).toBe('benchFull');
  });
});

describe('an upgrade evolves the item its hero wears', () => {
  it('onto the hero wearing its component: it takes that item\'s place, on a full hero too, for the difference — the component to the discard pile', () => {
    const G = turn(20);
    const haze = G.players['0'].active!;
    const mag = giveItem(G, haze, 'extended_magazine');
    for (const id of ['extra_regen', 'sprint_boots']) giveItem(G, haze, id);
    const atk = haze.atkMod;
    const card = giveCard(G, '0', 'titanic_magazine');
    expect(playCost(haze, 'titanic_magazine')).toBe(PRICE[2] - PRICE[1]);
    playItem(G, '0', card, haze);
    expect(ids(wornItems(haze))).toEqual(['extra_regen', 'sprint_boots', 'titanic_magazine']);
    expect(G.players['0'].souls).toBe(20 - (PRICE[2] - PRICE[1]));
    expect(G.players['0'].discard).toEqual([mag]);
    expect(mag.zone).toBe('discard');
    expect(haze.atkMod).toBe(atk - 1 + 2); // the magazine's +1 off, Titanic's +2 on
  });

  it('onto any other hero it costs its full price and evolves nothing: every copy elsewhere stays', () => {
    const G = turn(20);
    const me = G.players['0'];
    const mag = giveItem(G, me.bench[0]!, 'extended_magazine');
    const inHand = giveCard(G, '0', 'extended_magazine');
    const card = giveCard(G, '0', 'titanic_magazine');
    expect(playCost(me.active!, 'titanic_magazine')).toBe(PRICE[2]);
    playItem(G, '0', card, me.active!);
    expect(G.players['0'].souls).toBe(20 - PRICE[2]);
    expect(wornItems(me.bench[0]!)).toEqual([mag]);
    expect(me.hand).toEqual([inHand]);
    expect(me.discard).toEqual([]);
  });

  it('a chain evolves step by step: Compress → Superior → Transcendent Cooldown, each for the difference', () => {
    const G = turn(40);
    const dyn = G.players['0'].bench[0]!;
    playNew(G, '0', 'improved_cooldown', dyn);
    const souls = G.players['0'].souls;
    playItem(G, '0', giveCard(G, '0', 'superior_cooldown'), dyn);
    expect(G.players['0'].souls).toBe(souls - (PRICE[3] - PRICE[2]));
    playItem(G, '0', giveCard(G, '0', 'transcendent_cooldown'), dyn);
    expect(G.players['0'].souls).toBe(souls - (PRICE[3] - PRICE[2]) - (PRICE[4] - PRICE[3]));
    expect(ids(wornItems(dyn))).toEqual(['transcendent_cooldown']);
    expect(ids(G.players['0'].discard)).toEqual(['improved_cooldown', 'superior_cooldown']);
  });
});

describe('playing an item that Deadlock upgrades makes the upgrade', () => {
  it('one upgrade: a fresh card of it is shuffled into the deck', () => {
    const G = turn(20);
    stackDeck(G, '0', ['grit', 'grit', 'grit']);
    expect(upgradesOf('improved_cooldown')).toEqual(['superior_cooldown']);
    playNew(G, '0', 'improved_cooldown', G.players['0'].active!);
    const deck = G.players['0'].deck;
    expect(deck).toHaveLength(4);
    expect(ids(deck).filter((id) => id === 'superior_cooldown')).toHaveLength(1);
    const made = deck.find((c) => c.cardId === 'superior_cooldown')!;
    expect(made).toMatchObject({ zone: 'deck', ownerId: '0' });
    expect(G.fx.some((e) => e.kind === 'deck' && e.what === 'upgrade' && e.iid === made.iid)).toBe(true);
  });

  it('several: the player picks one, and only that one is made', () => {
    const G = turn(20);
    expect(upgradesOf('extra_health')).toEqual(expect.arrayContaining(['fortitude', 'colossus']));
    const card = giveCard(G, '0', 'extra_health');
    // Each choice is an action of its own on the legal list.
    const listed = legalActions(G, '0').filter((a) => a.type === 'playCard' && a.cardIid === card.iid && a.heroIid === G.players['0'].active!.iid);
    expect(listed.map((a) => (a as { upgradeId?: string }).upgradeId).sort()).toEqual([...upgradesOf('extra_health')].sort());
    playItem(G, '0', card, G.players['0'].active!, 'fortitude');
    expect(ids(G.players['0'].deck)).toEqual(['fortitude']);
  });

  it('each copy played makes one; an item that builds into nothing makes none; an evolve makes the next step\'s', () => {
    const G = turn(40);
    const me = G.players['0'];
    playNew(G, '0', 'extended_magazine', me.active!);
    playNew(G, '0', 'extended_magazine', me.bench[0]!);
    expect(me.deck).toHaveLength(2);
    playNew(G, '0', 'toxic_bullets', me.bench[1]!);
    expect(upgradesOf('toxic_bullets')).toEqual([]);
    expect(me.deck).toHaveLength(2);
    playNew(G, '0', 'superior_cooldown', me.bench[2]!);
    expect(ids(me.deck)).toContain('transcendent_cooldown');
  });
});

describe('heroes from the hand', () => {
  it('a hero goes to the first free bench slot for nothing; the lane takes one straight in only while it is empty', () => {
    const G = turn(0);
    const me = G.players['0'];
    me.bench[1] = null;
    const kelvin = giveCard(G, '0', 'hero_kelvin');
    expect(placeHeroBlocked(G, '0', kelvin.iid, true)).toBe('occupied');
    expect(attempt(G, '0', { type: 'placeHero', cardIid: kelvin.iid }).result).not.toBe(INVALID);
    expect(me.bench[1]).toBe(kelvin);
    expect(kelvin).toMatchObject({ zone: 'bench', slot: 2 });
    expect(me.souls).toBe(0);
    const seven = giveCard(G, '0', 'hero_seven');
    refusedUntouched(G, '0', { type: 'placeHero', cardIid: seven.iid }, 'benchFull');
    // An empty lane (a fallen Active gone to the hand): a hero goes straight in.
    me.active = null;
    expect(attempt(G, '0', { type: 'placeHero', cardIid: seven.iid, toActive: true }).result).not.toBe(INVALID);
    expect(me.active).toBe(seven);
    expect(seven.zone).toBe('active');
  });

  it('a bench-only hero never takes the lane; an item is no hero to place', () => {
    const G = turn(0);
    G.players['0'].active = null;
    G.players['0'].bench[2] = null;
    const rem = giveCard(G, '0', 'hero_rem');
    const item = giveCard(G, '0', 'grit');
    expect(placeHeroBlocked(G, '0', rem.iid, true)).toBe('benchOnly');
    expect(placeHeroBlocked(G, '0', rem.iid)).toBeNull();
    expect(placeHeroBlocked(G, '0', item.iid)).toBe('notHero');
  });

  it('a hero benched while the lane is open steps up: an AI seat at once, the human seat is asked', () => {
    const G = turn(0);
    const me = G.players['0'];
    const p1 = G.players['1'];
    p1.active = null;
    p1.bench = [null, null, null];
    G.turnNumber = 3; // P1's turn
    const abrams = giveCard(G, '1', 'hero_abrams');
    perform(G, '1', { type: 'placeHero', cardIid: abrams.iid });
    expect(p1.active).toBe(abrams);                    // the AI seat promoted it
    G.turnNumber = 2;
    me.active = null;
    me.bench = [null, null, null];
    const haze = giveCard(G, '0', 'hero_haze');
    perform(G, '0', { type: 'placeHero', cardIid: haze.iid });
    expect(me.bench[0]).toBe(haze);
    expect(G.pendingPromotion).toBe('0');
  });
});

describe('what a play sets going', () => {
  it('an active starts on its full cooldown (its own, for a draw card), hard crowd control with its charges; a passive has neither', () => {
    const G = turn(80);
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const front = playNew(G, '0', 'cold_front', haze);                          // tier 2
    const aura = playNew(G, '0', 'heroic_aura', vindicta);                      // tier 3
    expect([front.cooldowns, aura.cooldowns]).toEqual([{ cold_front: 2 }, { heroic_aura: 3 }]);
    const knock = playNew(G, '0', 'knockdown', lash);
    expect([knock.charges, knock.cooldowns]).toEqual([HARD_CC_CHARGES, undefined]);
    const health = playNew(G, '0', 'extra_health', lash);
    expect([health.charges, health.cooldowns]).toEqual([undefined, undefined]);
    const draw = playNew(G, '0', 'superior_cooldown', me.bench[2]!);           // tier 3, its own 2
    expect(draw.cooldowns).toEqual({ superior_cooldown: 2 });
    expect(activeCooldown(me.bench[2]!, 3, 2)).toBe(2);
  });

  it('the bonus goes on with the Vitality spike synced', () => {
    const G = turn(20);
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'extra_regen');
    giveItem(G, haze, 'sprint_boots');
    const [max, hp] = [haze.hpMax, haze.hp];
    playNew(G, '0', 'extra_health', haze);                                     // the third Vitality item
    expect(haze.vitalitySpike).toBe(true);
    expect([haze.hpMax, haze.hp]).toEqual([max + 3, hp + 3]);
  });

  it('a hero earns EXP_ON_EQUIP the first time it wears an item — not for a second copy, or as a corpse', () => {
    const G = turn(40);
    const me = G.players['0'];
    const [haze, vindicta, paige] = [me.active!, me.bench[0]!, me.bench[2]!];
    const exp = () => [haze.exp, vindicta.exp, paige.exp];
    expect(exp()).toEqual([0, 0, 0]);
    const held = giveCard(G, '0', 'extra_health');
    expect(exp()).toEqual([0, 0, 0]);                                           // a card in the hand earns nothing
    playItem(G, '0', held, haze);
    expect(exp()).toEqual([EXP_ON_EQUIP, 0, 0]);
    playNew(G, '0', 'fortitude', haze);                                        // evolved: a new item
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, 0, 0]);
    playNew(G, '0', 'extra_health', haze);                                     // a second Extra Health: nothing
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, 0, 0]);
    playNew(G, '0', 'extra_health', vindicta);                                 // Vindicta's own first
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, EXP_ON_EQUIP, 0]);
    paige.hp = 0;
    paige.respawnTurnsLeft = 2;
    playNew(G, '0', 'extra_spirit', paige);                                    // a corpse earns nothing
    expect(exp()).toEqual([2 * EXP_ON_EQUIP, EXP_ON_EQUIP, 0]);
    expect(paige.equippedIds ?? []).toEqual([]);
  });
});

describe('the draw cards: draw, then discard from anywhere in the hand', () => {
  /** P0's Active wearing the draw card `id`, ready; the deck stacked with `deck`. */
  function ready(id: string, deck: string[]) {
    const G = turn(0);
    const item = giveItem(G, G.players['0'].active!, id);
    const stacked = stackDeck(G, '0', deck);
    return { G, item, stacked };
  }

  it('Compress Cooldown: draw 2, owe 1; casting is free; it then waits 2 turns', () => {
    const { G, item, stacked } = ready('improved_cooldown', ['grit', 'cold_front', 'extra_health']);
    const keep = giveCard(G, '0', 'toxic_bullets');
    expect(attempt(G, '0', { type: 'activate', itemIid: item.iid }).result).not.toBe(INVALID);
    expect(G.players['0'].souls).toBe(0);
    expect(G.players['0'].hand).toEqual([keep, stacked[0], stacked[1]]);
    expect(G.pendingDiscard).toEqual({ pid: '0', count: 1, cardId: 'improved_cooldown' });
    expect(itemCooldown(item)).toBe(2);
    // The discard may be any card of the hand, not only a new one.
    expect(attempt(G, '0', { type: 'discard', cardIids: [keep.iid] }).result).not.toBe(INVALID);
    expect(G.pendingDiscard).toBeUndefined();
    expect(G.players['0'].discard).toEqual([keep]);
    expect(G.players['0'].hand).toEqual([stacked[0], stacked[1]]);
  });

  it('Superior Cooldown draws 4 and owes 2; Transcendent draws 8 and owes 4', () => {
    for (const [id, draw, owe] of [['superior_cooldown', 4, 2], ['transcendent_cooldown', 8, 4]] as const) {
      const { G, item } = ready(id, Array.from({ length: 9 }, () => 'grit'));
      perform(G, '0', { type: 'activate', itemIid: item.iid });
      expect(G.players['0'].hand, id).toHaveLength(draw);
      expect(G.pendingDiscard, id).toMatchObject({ pid: '0', count: owe });
      expect(itemCooldown(item), id).toBe(2);
    }
  });

  it('while the discard is owed nothing else is legal; it may be paid a card at a time', () => {
    const { G, item } = ready('superior_cooldown', ['grit', 'grit', 'grit', 'grit']);
    perform(G, '0', { type: 'activate', itemIid: item.iid });
    const hand = G.players['0'].hand;
    refusedUntouched(G, '0', { type: 'attack' }, 'discardOwed');
    refusedUntouched(G, '0', { type: 'endTurn' }, 'discardOwed');
    expect(legalActions(G, '0').every((a) => a.type === 'discard')).toBe(true);
    expect(legalActions(G, '0')).toHaveLength(hand.length);
    perform(G, '0', { type: 'discard', cardIids: [hand[0].iid] });
    expect(G.pendingDiscard?.count).toBe(1);
    perform(G, '0', { type: 'discard', cardIids: [G.players['0'].hand[0].iid] });
    expect(G.pendingDiscard).toBeUndefined();
    expect(blocked(G, '0', { type: 'endTurn' })).toBeNull();
  });

  it('the discard\'s refusals, in order — none owed, none named, too many, a card twice, one not in the hand — change nothing', () => {
    const { G, item } = ready('improved_cooldown', ['grit', 'grit']);
    expect(discardBlocked(G, '0', [])).toBe('notOwed');
    perform(G, '0', { type: 'activate', itemIid: item.iid });
    const [a, b] = G.players['0'].hand;
    refusedUntouched(G, '1', { type: 'discard', cardIids: [a.iid] }, 'notOwed');
    refusedUntouched(G, '0', { type: 'discard', cardIids: [] }, 'none');
    refusedUntouched(G, '0', { type: 'discard', cardIids: [a.iid, b.iid] }, 'tooMany');
    G.pendingDiscard!.count = 2;
    refusedUntouched(G, '0', { type: 'discard', cardIids: [a.iid, a.iid] }, 'repeat');
    refusedUntouched(G, '0', { type: 'discard', cardIids: ['nope'] }, 'notInHand');
  });

  it('a draw into a full hand is skipped, and the discard never asks for more than the hand holds', () => {
    const { G, item } = ready('improved_cooldown', ['grit', 'grit']);
    for (let i = 0; i < MAX_HAND - 1; i++) giveCard(G, '0', 'grit');
    perform(G, '0', { type: 'activate', itemIid: item.iid });
    expect(G.players['0'].hand).toHaveLength(MAX_HAND);         // one drawn, one skipped
    expect(G.players['0'].deck).toHaveLength(1);
    expect(G.pendingDiscard?.count).toBe(1);
    const empty = ready('superior_cooldown', ['grit']);
    perform(empty.G, '0', { type: 'activate', itemIid: empty.item.iid });
    expect(empty.G.players['0'].hand).toHaveLength(1);
    expect(empty.G.pendingDiscard?.count).toBe(1);               // owed 2, the hand holds 1
  });
});

describe('the shop\'s other moves have no deck equivalent', () => {
  // Claims priced an upgrade bought for the difference against a copy elsewhere on
  // the side; a deck play only ever evolves the item its own hero wears.
  it.skip('a claim: an upgrade bought for the difference claims its copy (no deck equivalent: no buying)', () => {});
  // Moving a worn item between heroes was a shop move; worn items stay where they are put.
  it.skip('moving an item to another hero (no deck equivalent: items are not moved)', () => {});
  // A same-turn sale gave the component an upgrade consumed back; nothing is sold now.
  it.skip('an upgrade sold on its buy turn puts its component back (no deck equivalent: no selling)', () => {});
});

describe('a Story reward: cards in the hand from the start', () => {
  it('setup puts the reward\'s cards in the player\'s hand, on top of the opening hand — nothing worn — to be played like any other', () => {
    setMatchConfig({
      heroPreferences: [null, null, null, null],
      seed: 3,
      story: {
        playerHeroes: ['hero_haze', 'hero_vindicta'],
        enemyHeroes: ['hero_abrams'],
        enemyBuff: { atk: 0, hp: 0 },
        playerItems: ['extra_health', 'no_such_item', 'cold_front', 'extra_health'],
        playerDeck: [],
        enemyDeck: [],
        openingHand: 0,
      },
    });
    try {
      const G = setupGame();
      const me = G.players['0'];
      expect(ids(me.hand)).toEqual(['extra_health', 'cold_front', 'extra_health']); // a duplicate too; no item, nothing
      for (const c of me.hand) {
        expect(c).toMatchObject({ zone: 'hand', ownerId: '0', attachedTo: undefined });
        expect([c.cooldowns, c.charges]).toEqual([undefined, undefined]);
      }
      expect(G.players['1'].hand).toEqual([]);
      expect([me.active, ...me.bench].flatMap((h) => (h ? wornItems(h) : []))).toEqual([]);
      expect(G.log.map((l) => l.text)).toContain('P0 starts with Cold Front in hand.');
      // Played on the first turn like any card, for its price: its cooldown starts then.
      me.souls = 10;
      const front = me.hand[1];
      expect(perform(G, '0', { type: 'playCard', cardIid: front.iid, heroIid: me.active!.iid })).not.toBe(INVALID);
      expect(front.cooldowns).toEqual({ cold_front: 2 });
      expect(me.souls).toBe(10 - itemPrice('cold_front'));
    } finally {
      configureReadyMatch();
    }
  });
});

describe('net worth counts the hand', () => {
  it('souls, plus the list price of every worn item and every item in the hand — a hero card at nothing', () => {
    const G = turn(20);
    const me = G.players['0'];
    giveItem(G, me.bench[0]!, 'extended_magazine');
    expect(netWorth(G, '0')).toBe(20 + PRICE[1]);
    const titanic = giveCard(G, '0', 'titanic_magazine');
    expect(netWorth(G, '0')).toBe(20 + PRICE[1] + PRICE[2]);
    playItem(G, '0', titanic, me.bench[0]!);                                    // evolves the magazine: 2 souls
    expect(netWorth(G, '0')).toBe(18 + PRICE[2]);
    giveCard(G, '0', 'boundless_spirit');
    giveCard(G, '0', 'hero_kelvin');
    expect(netWorth(G, '0')).toBe(18 + PRICE[2] + PRICE[4]);
  });
});
