/**
 * The AI and the deck (src/ai/heuristic.ts) — what replaced the AI's shop
 * rules. It plays the deck game by the person's rules: every move it names is
 * one the engine takes; it benches the heroes it draws, puts an item from its
 * hand on the hero whose build lists it, evolves an upgrade onto the hero
 * wearing its component, casts a draw card and pays its discard with the cards
 * worth least to it, and, when a play could make one of several upgrades,
 * names the one its heroes' builds want. Two AIs play a drafted match through
 * a boardgame.io Client to the end without a stall.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { Client } from 'boardgame.io/client';
import type { GameState, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { INVALID, perform, type Action } from '@/engine/engine';
import { blocked, legalActions } from '@/engine/legality';
import { kitCharges, wornItems } from '@/engine/query';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { seededRandom } from '@/engine/rng';
import { oweDiscard } from '@/engine/deck';
import { discardChoice, enumerateAIMoves } from '@/ai/heuristic';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { LANE_INCOME, PRICE } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, spendSkill, stackDeck } from './_helpers';

const ctxFor = (pid: PlayerID) => ({ currentPlayer: pid, numPlayers: 2, turn: 2 }) as unknown as Ctx;

/** P0's turn (engine turn 2) with `souls` to spend. Vindicta's two snipes are spent (`spendSkill`):
 *  these tests are about the hand and the souls, and a free Assassinate would come first.
 *  So is Lash's Grapple (2026-11-17): it swings him in and his free Retreat takes him out
 *  again, two moves that spend nothing but would stand among the ones these tests count. */
function turn(souls: number): GameState {
  const G = freshReadyGame();
  G.players['0'].souls = souls;
  spendSkill(G.players['0'].bench[0]!);
  spendSkill(G.players['0'].bench.find((h) => h?.cardId === 'hero_lash')!);
  return G;
}

/** The AI's best move as an engine action. */
function best(G: GameState, pid: PlayerID = '0'): Action {
  const [m] = enumerateAIMoves(G, ctxFor(pid));
  switch (m.move) {
    case 'playCard': return {
      type: 'playCard', cardIid: m.args[0],
      ...(m.args[1] !== undefined ? { heroIid: m.args[1] } : {}),
      ...(m.args[2] !== undefined ? { replaceIid: m.args[2] } : {}),
    };
    case 'placeHero': return { type: 'placeHero', cardIid: m.args[0], toActive: m.args[1] === true };
    case 'discard': return { type: 'discard', cardIids: m.args[0] };
    case 'useSkill': return { type: 'useSkill', heroIid: m.args[0], targetIid: m.args[1], skillId: m.args[2] };
    case 'moveHero': return { type: 'moveHero', fromSlot: m.args[0], toSlot: m.args[1] };
    case 'attack': return { type: 'attack', targetIid: m.args[0] };
    default: return { type: 'endTurn' };
  }
}

/** Make the AI's best move on G, which the engine must take; returns it. */
function step(G: GameState, pid: PlayerID = '0'): Action {
  const a = best(G, pid);
  expect(blocked(G, pid, a), JSON.stringify(a)).toBeNull();
  if (a.type !== 'endTurn') expect(perform(G, pid, a)).not.toBe(INVALID);
  return a;
}

/** The AI's turn on G, move by move, until it ends it or attacks (which ends
 *  the Act); every move the engine takes. Returns the moves. */
function playOut(G: GameState, pid: PlayerID = '0'): Action[] {
  const made: Action[] = [];
  for (let i = 0; i < 40; i++) {
    const a = step(G, pid);
    made.push(a);
    if (a.type === 'endTurn' || a.type === 'attack') break;
  }
  return made;
}

const saved = getMatchConfig();
afterEach(() => {
  setMatchConfig(saved);
  vi.restoreAllMocks();
});

describe('the AI plays its hand', () => {
  it('benches a hero it draws, for nothing', () => {
    const G = turn(0);
    G.players['0'].bench[2] = null;
    const kelvin = giveCard(G, '0', 'hero_kelvin');
    playOut(G);
    expect(G.players['0'].bench[2]).toBe(kelvin);
  });

  it('fills an empty lane from its hand before anything else', () => {
    const G = turn(0);
    G.players['0'].active = null;
    const kelvin = giveCard(G, '0', 'hero_kelvin');
    expect(best(G)).toEqual({ type: 'placeHero', cardIid: kelvin.iid, toActive: true });
  });

  it('puts an item on the hero whose build lists it, paying its price', () => {
    const G = turn(10);
    const me = G.players['0'];
    // Lash's build opens on Kinetic Dash (2026-11-17); Haze's does not list it.
    const card = giveCard(G, '0', 'kinetic_dash');
    playOut(G);
    // (He may have stepped in by then, for his Ground Strike.)
    const lash = [me.active, ...me.bench].find((h) => h?.cardId === 'hero_lash')!;
    expect(wornItems(lash).map((it) => it.cardId)).toContain('kinetic_dash');
    expect(me.hand).not.toContain(card);
  });

  it('puts a charge item only on a hero whose skill holds charges', () => {
    // Nobody on this side has a charged skill (Yamato stands in for Vindicta, whose Assassinate
    // holds charges): Extra Charge would do nothing, so it stays in the hand.
    const none = turn(10);
    none.players['0'].bench[0] = makeInstance(allocatorOf(none), 'hero_yamato', '0', 'bench', 1);
    spendSkill(none.players['0'].bench[0]!);
    const kept = giveCard(none, '0', 'extra_charge');
    playOut(none);
    expect(none.players['0'].hand).toContain(kept);
    for (const h of [none.players['0'].active, ...none.players['0'].bench]) {
      if (h) expect(wornItems(h).map((it) => it.cardId)).not.toContain('extra_charge');
    }
    // Kelvin's Frost Grenade holds 2 charges: with him on the bench the card goes on him.
    const G = turn(10);
    const me = G.players['0'];
    const kelvin = makeInstance(allocatorOf(G), 'hero_kelvin', '0', 'bench', 1);
    me.bench[0] = kelvin;
    const card = giveCard(G, '0', 'extra_charge');
    playOut(G);
    expect(wornItems(kelvin).map((it) => it.cardId)).toContain('extra_charge');
    expect(me.hand).not.toContain(card);
    expect(kitCharges(kelvin)?.max).toBe(3);
  });

  it('evolves an upgrade onto the hero wearing its component, for the difference', () => {
    // The difference and no more (1 since prices halved, 2026-11-16): with the full price
    // (2) in hand the AI may as well put Titanic Magazine on a second hero, a fair choice.
    const G = turn(PRICE[2] - PRICE[1]);
    const me = G.players['0'];
    // The souls are the upgrade's: no skill bids for them (Paige's Plot Armor would, at 2).
    for (const h of [me.active, ...me.bench]) if (h) h.skillUsedThisTurn = true;
    const haze = me.active!;
    giveItem(G, haze, 'extended_magazine');
    giveCard(G, '0', 'titanic_magazine');
    playOut(G);
    expect(wornItems(haze).map((it) => it.cardId)).toEqual(['titanic_magazine']);
    expect(G.players['0'].souls).toBe(0);
  });

  it('plays no item it cannot pay for', () => {
    const G = turn(1);
    giveCard(G, '0', 'glass_cannon');
    const made = playOut(G);
    expect(made.some((a) => a.type === 'playCard')).toBe(false);
  });

  it('a play makes no upgrade: Extra Health goes on a hero, and nothing is shuffled into the deck', () => {
    const G = turn(10);
    // Until 2026-11-15 a play of Extra Health made Fortitude or Colossus for the deck.
    G.turnNumber = 3; // P1's turn
    G.players['1'].souls = 10;
    const card = giveCard(G, '1', 'extra_health');
    const made = playOut(G, '1');
    const play = made.find((a) => a.type === 'playCard') as Extract<Action, { type: 'playCard' }> | undefined;
    expect(play).toBeDefined();
    expect(play).toEqual({ type: 'playCard', cardIid: card.iid, heroIid: play!.heroIid });
    expect(G.players['1'].deck).toEqual([]);
  });
});

describe('the AI saves for a dear card (Patrick, 2026-11-15: "the AI does not save… this needs to be solved")', () => {
  // P0: Haze (Active, no skill), Vindicta, Lash and Paige. Skills cost no
  // souls, so what spends them is a card played or a Retreat. Toxic Bullets is
  // tier 3: 4 souls since prices halved (2026-11-16; it was 8), two turns of
  // the lane. The AI saves for tier 3 and up (SAVE_TIER): a tier-2 card is
  // one turn's income now.
  const spends = (made: Action[]) => made.filter((a) => a.type === 'playCard' || a.type === 'moveHero');

  it('keeps its souls for a tier-3 card it can pay for next turn: no cheap card first', () => {
    const held = PRICE[3] - LANE_INCOME; // the lane pays the rest next turn
    const G = turn(held);
    giveCard(G, '0', 'toxic_bullets');
    giveCard(G, '0', 'extended_magazine'); // tier 1: it could pay for this now
    expect(spends(playOut(G))).toEqual([]);
    expect(G.players['0'].souls).toBe(held);
  });

  it('with the souls for it, plays the tier-3 card first: nothing cheaper takes its souls', () => {
    const G = turn(PRICE[3]);
    const me = G.players['0'];
    const toxic = giveCard(G, '0', 'toxic_bullets');
    const mag = giveCard(G, '0', 'extended_magazine');
    const made = playOut(G);
    // Its first spend (a skill, which costs no souls, may come before it).
    expect(spends(made)[0]).toMatchObject({ type: 'playCard', cardIid: toxic.iid });
    expect(me.souls).toBe(0);
    expect(me.hand).toEqual([mag]);
  });

  it('a tier-2 card is no saving goal since prices halved (it is one turn of the lane): a cheaper card is not held back for it, and it is played once paid for', () => {
    // Until 2026-11-16 a tier-2 card cost 4 and the AI saved a turn for it.
    expect(PRICE[2]).toBe(LANE_INCOME);
    const short = turn(PRICE[2] - 1);
    giveCard(short, '0', 'swift_striker');
    giveCard(short, '0', 'extended_magazine');
    expect(spends(playOut(short)).length).toBeGreaterThan(0);
    const paid = turn(PRICE[2]);
    const striker = giveCard(paid, '0', 'swift_striker');
    expect(playOut(paid).some((a) => a.type === 'playCard' && a.cardIid === striker.iid)).toBe(true);
    expect(paid.players['0'].souls).toBe(0);
  });

  it('the higher tier is the goal: with a tier-2 it could pay for now and a tier-3 a turn off, it holds for the tier-3', () => {
    const G = turn(PRICE[2]);
    giveCard(G, '0', 'swift_striker');
    giveCard(G, '0', 'toxic_bullets');
    expect(spends(playOut(G))).toEqual([]);
    expect(G.players['0'].souls).toBe(PRICE[2]);
  });

  it('with only tier-1 cards in hand there is nothing to save for: it spends as the look says', () => {
    const G = turn(6);
    giveCard(G, '0', 'extended_magazine');
    expect(spends(playOut(G)).length).toBeGreaterThan(0);
    expect(G.players['0'].souls).toBeLessThan(6);
  });

  it('a card further off than three turns of income is no goal yet: it spends', () => {
    const G = turn(1);
    giveCard(G, '0', 'glass_cannon'); // tier 4, 8 souls: 7 short, past three turns of income (6)
    giveCard(G, '0', 'extended_magazine');
    expect(spends(playOut(G)).length).toBeGreaterThan(0);
    expect(G.players['0'].souls).toBeLessThan(1);
  });

  it('an upgrade onto the hero wearing its component counts at the difference: it saves 1 toward Sharpshooter\'s 2, then evolves it', () => {
    const stage = (souls: number) => {
      const G = turn(souls);
      const vindicta = G.players['0'].bench.find((h) => h?.cardId === 'hero_vindicta')!;
      giveItem(G, vindicta, 'long_range');
      const sharp = giveCard(G, '0', 'sharpshooter'); // tier 3; 4 − Long Range's 2 on Vindicta
      return { G, vindicta, sharp };
    };
    const saving = stage(1);
    // No card, and the goal is still paid for next turn. A spend that leaves it as
    // near is no spend against it: with 1 soul and a lane paying 2, Haze's 1-soul
    // Retreat to bring Lash in for his Ground Strike (2026-11-17) still leaves 2.
    expect(spends(playOut(saving.G)).filter((a) => a.type === 'playCard')).toEqual([]);
    expect(saving.G.players['0'].souls + LANE_INCOME).toBeGreaterThanOrEqual(PRICE[3] - PRICE[2]);
    const paid = stage(PRICE[3] - PRICE[2]);
    const made = playOut(paid.G);
    expect(made.find((a) => a.type === 'playCard')).toMatchObject({ type: 'playCard', cardIid: paid.sharp.iid, heroIid: paid.vindicta.iid });
    expect(wornItems(paid.vindicta).map((it) => it.cardId)).toEqual(['sharpshooter']);
  });

  it('its skills cost no souls, so it still uses them while it saves', () => {
    const held = PRICE[3] - LANE_INCOME;
    const G = turn(held);
    giveCard(G, '0', 'toxic_bullets');
    const made = playOut(G);
    expect(made.some((a) => a.type === 'useSkill')).toBe(true);
    expect(spends(made)).toEqual([]);
    expect(G.players['0'].souls).toBe(held);
  });

  it('a kill is still worth the souls: it pays Haze\'s Retreat to bring in the hero whose swing finishes the rival Active, though it delays the card', () => {
    const held = PRICE[3] - LANE_INCOME; // the Retreat's soul puts Toxic Bullets a turn further off
    const G = turn(held);
    giveCard(G, '0', 'toxic_bullets');
    const rival = G.players['1'].active!;
    rival.hp = rival.hpMax = 2;                     // Haze swings for 1 at a whole hero; Vindicta, behind her, for 2
    // No skill of the bench's takes the kill first.
    for (const h of G.players['0'].bench) if (h) h.skillUsedThisTurn = true;
    const made = playOut(G);
    expect(made.some((a) => a.type === 'moveHero')).toBe(true);
    expect(G.record['0'].kills).toBe(1);
    expect(G.players['0'].souls).toBeLessThan(held + 1); // the Retreat's soul gone, the kill's bounty in
  });
});

describe('the AI and a full hero (Patrick, 2026-11-09: a full hero swaps an item)', () => {
  /** P0's turn, every hero full: Haze wears Extended Magazine (tier 1) and two tier-2
   *  items, the bench three tier-3 items each, so only Haze could take a card in place
   *  of a cheap one. Abilities spent, so the souls are the hand's. */
  function fullBoard(souls: number) {
    const G = turn(souls);
    const me = G.players['0'];
    for (const h of [me.active, ...me.bench]) if (h) h.skillUsedThisTurn = true;
    const haze = me.active!;
    const worn = ['extended_magazine', 'titanic_magazine', 'swift_striker'].map((id) => giveItem(G, haze, id));
    for (const h of me.bench) if (h) ['fortitude', 'toxic_bullets', 'sharpshooter'].forEach((id) => giveItem(G, h, id));
    return { G, me, haze, worn };
  }
  const swaps = (G: GameState) => enumerateAIMoves(G, ctxFor('0'), false).filter((m) => m.move === 'playCard' && m.args[2] !== undefined);

  it('replaces only the hero\'s least valuable item, and only with a card worth twice its price or more', () => {
    const { G, haze, worn } = fullBoard(20);
    const tier3 = giveCard(G, '0', 'weighted_shots');                       // 8 souls: 4 x the magazine
    expect(legalActions(G, '0').filter((a) => a.type === 'playCard' && a.cardIid === tier3.iid && a.heroIid === haze.iid)).toHaveLength(3);
    const offered = swaps(G).filter((m) => m.args[0] === tier3.iid && m.args[1] === haze.iid);
    expect(offered.map((m) => m.args[2])).toEqual([worn[0].iid]);         // Extended Magazine, tier 1
    // The lookahead takes it: Weighted Shots goes on Haze, the magazine to the discard pile.
    playOut(G);
    expect(wornItems(haze).map((it) => it.cardId)).toEqual(['titanic_magazine', 'swift_striker', 'weighted_shots']);
    expect(G.players['0'].discard.map((c) => c.cardId)).toEqual(['extended_magazine']);
  });

  it('never trades a worn item for a card of its own tier', () => {
    const { G } = fullBoard(20);
    giveCard(G, '0', 'extra_regen');                                         // tier 1, as the magazine
    expect(swaps(G)).toEqual([]);
    const made = playOut(G);
    expect(made.some((a) => a.type === 'playCard')).toBe(false);
  });
});

describe('the AI and its draw cards', () => {
  it('plays the draw card it can pay for (Golden Goose Egg, 2026-11-16) and draws its 2', () => {
    const G = turn(2); // the egg's price
    const me = G.players['0'];
    // Nothing else to do this turn: every hero's ability is spent.
    for (const h of [me.active, ...me.bench]) if (h) h.skillUsedThisTurn = true;
    const draw = giveCard(G, '0', 'golden_goose_egg');
    stackDeck(G, '0', ['hero_kelvin', 'glass_cannon']);
    const made = playOut(G);
    expect(made.some((a) => a.type === 'playCard' && a.cardIid === draw.iid)).toBe(true);
    expect(G.pendingDiscard).toBeUndefined();
    expect(me.deck).toHaveLength(0);
    expect(me.discard.map((c) => c.cardId)).toEqual(['golden_goose_egg']);
  });

  it('pays a discard owed with the card worth least to it (the engine\'s step; no card owes one since 2026-11-16)', () => {
    const G = turn(0);
    const me = G.players['0'];
    for (const h of [me.active, ...me.bench]) if (h) h.skillUsedThisTurn = true;
    giveCard(G, '0', 'hero_kelvin');
    giveCard(G, '0', 'glass_cannon');
    oweDiscard(G, '0', 1, 'golden_goose_egg');
    const made = playOut(G);
    expect(made.some((a) => a.type === 'discard')).toBe(true);
    expect(G.pendingDiscard).toBeUndefined();
    // The tier-4 item it cannot pay for anytime soon goes; the hero is kept.
    expect(me.discard.map((c) => c.cardId)).toEqual(['glass_cannon']);
  });

  it('discardChoice keeps heroes, then items its heroes could take, cheaper first; drops items no hero can take', () => {
    const G = turn(1); // Spiritual Overflow (8 since prices halved) is then past three turns of income
    const me = G.players['0'];
    const haze = me.active!;
    for (const h of [haze, ...me.bench]) if (h) giveItem(G, h, 'extended_magazine');
    const hero = giveCard(G, '0', 'hero_kelvin');
    const useless = giveCard(G, '0', 'extended_magazine');          // every hero wears one
    const wanted = giveCard(G, '0', 'kinetic_dash');                // Lash's build (2026-11-17)
    const dear = giveCard(G, '0', 'spiritual_overflow');            // tier 4, far off, in no build here
    const order = discardChoice(G, '0', 4);
    expect(order[0]).toBe(useless.iid);
    expect(order.slice(0, 3)).not.toContain(hero.iid);
    expect(discardChoice(G, '0', 2)).toEqual([useless.iid, dear.iid]);
    expect(discardChoice(G, '0', 1)).not.toContain(wanted.iid);
  });
});

describe('AI against AI through a boardgame.io Client', () => {
  it('a drafted match never stalls: every move the AI names is taken, heroes go to the bench, items are played, and the match ends', () => {
    // (Seed 11 stood here before the hero rebuild; it now ends on engine turn 7
    // with P0 never drawing a hero, so nothing is benched: 12 takes its place.)
    for (const seed of [12, 202, 3003]) {
      setMatchConfig({ heroPreferences: [null, null, null, null], seed, humanSeat: null });
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed)); // the draft's jitter reads it
      const client = Client({ game: DeadlockGame, numPlayers: 2 });
      client.start();
      let st = client.getState()!;
      let moves = 0;
      let plays = 0;
      let benched = 0;
      let turnMoves = 0;
      let turn = st.ctx.turn;
      while (!st.ctx.gameover && moves < 3000) {
        const G = st.G as GameState;
        const choice = enumerateAIMoves(G, st.ctx)[0];
        expect(choice, `seed ${seed}: no move at engine turn ${G.turnNumber}`).toBeDefined();
        const id = st._stateID;
        (client.moves as Record<string, (...args: unknown[]) => void>)[choice.move](...choice.args);
        const next = client.getState()!;
        expect(next._stateID, `seed ${seed}: ${choice.move}(${JSON.stringify(choice.args)}) refused at engine turn ${G.turnNumber}`).toBeGreaterThan(id);
        if (choice.move === 'playCard') plays++;
        if (choice.move === 'placeHero') benched++;
        moves++;
        if (next.ctx.turn !== turn) {
          turn = next.ctx.turn;
          turnMoves = 0;
        } else {
          turnMoves++;
          expect(turnMoves, `seed ${seed}: a turn that does not end`).toBeLessThan(60);
        }
        st = next;
      }
      expect(st.ctx.gameover?.winner, `seed ${seed}: no winner after ${moves} moves`).toBeDefined();
      expect((st.G as GameState).turnNumber).toBeLessThanOrEqual(40);
      expect(plays, `seed ${seed}`).toBeGreaterThan(0);
      expect(benched, `seed ${seed}`).toBeGreaterThan(0);
      client.stop();
      vi.restoreAllMocks();
    }
  });
});
