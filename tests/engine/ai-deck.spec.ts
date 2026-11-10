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
import { wornItems } from '@/engine/query';
import { seededRandom } from '@/engine/rng';
import { discardChoice, enumerateAIMoves } from '@/ai/heuristic';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { freshReadyGame, giveCard, giveItem, stackDeck } from './_helpers';

const ctxFor = (pid: PlayerID) => ({ currentPlayer: pid, numPlayers: 2, turn: 2 }) as unknown as Ctx;

/** P0's turn (engine turn 2) with `souls` to spend. */
function turn(souls: number): GameState {
  const G = freshReadyGame();
  G.players['0'].souls = souls;
  return G;
}

/** The AI's best move as an engine action. */
function best(G: GameState, pid: PlayerID = '0'): Action {
  const [m] = enumerateAIMoves(G, ctxFor(pid));
  switch (m.move) {
    case 'playCard': return {
      type: 'playCard', cardIid: m.args[0], heroIid: m.args[1],
      ...(m.args[2] ? { upgradeId: m.args[2] } : {}),
      ...(m.args[3] !== undefined ? { replaceIid: m.args[3] } : {}),
    };
    case 'placeHero': return { type: 'placeHero', cardIid: m.args[0], toActive: m.args[1] === true };
    case 'discard': return { type: 'discard', cardIids: m.args[0] };
    case 'activate': return { type: 'activate', itemIid: m.args[0], targetIid: m.args[1] };
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
    // Lash's build opens on Mystic Slow; Haze's does not list it.
    const card = giveCard(G, '0', 'mystic_slow');
    playOut(G);
    const lash = me.bench.find((h) => h?.cardId === 'hero_lash')!;
    expect(wornItems(lash).map((it) => it.cardId)).toContain('mystic_slow');
    expect(me.hand).not.toContain(card);
  });

  it('evolves an upgrade onto the hero wearing its component, for the difference', () => {
    const G = turn(2);
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

  it('names the upgrade its heroes\' builds want when a play could make several', () => {
    const G = turn(10);
    // Abrams' build takes Fortitude, not Colossus: Extra Health played makes Fortitude.
    G.turnNumber = 3; // P1's turn
    G.players['1'].souls = 10;
    giveCard(G, '1', 'extra_health');
    const made = playOut(G, '1');
    const play = made.find((a) => a.type === 'playCard') as Extract<Action, { type: 'playCard' }> | undefined;
    expect(play).toBeDefined();
    expect(play!.upgradeId).toBe('fortitude');
    expect(G.players['1'].deck.map((c) => c.cardId)).toEqual(['fortitude']);
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
    const worn = ['extended_magazine', 'titanic_magazine', 'active_reload'].map((id) => giveItem(G, haze, id));
    for (const h of me.bench) if (h) ['fortitude', 'healing_nova', 'sharpshooter'].forEach((id) => giveItem(G, h, id));
    return { G, me, haze, worn };
  }
  const swaps = (G: GameState) => enumerateAIMoves(G, ctxFor('0'), false).filter((m) => m.move === 'playCard' && m.args[3] !== undefined);

  it('replaces only the hero\'s least valuable item, and only with a card worth twice its price or more', () => {
    const { G, haze, worn } = fullBoard(20);
    const tier3 = giveCard(G, '0', 'weighted_shots');                       // 8 souls: 4 x the magazine
    expect(legalActions(G, '0').filter((a) => a.type === 'playCard' && a.cardIid === tier3.iid && a.heroIid === haze.iid)).toHaveLength(3);
    const offered = swaps(G).filter((m) => m.args[0] === tier3.iid && m.args[1] === haze.iid);
    expect(offered.map((m) => m.args[3])).toEqual([worn[0].iid]);         // Extended Magazine, tier 1
    // The lookahead takes it: Weighted Shots goes on Haze, the magazine to the discard pile.
    playOut(G);
    expect(wornItems(haze).map((it) => it.cardId)).toEqual(['titanic_magazine', 'active_reload', 'weighted_shots']);
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
  it('casts a ready draw card and pays the discard with the cards worth least to it', () => {
    const G = turn(0);
    const me = G.players['0'];
    // Nothing else worth an ability this turn: every other hero's is spent.
    const dyn = me.bench[0]!;
    for (const h of [me.active, ...me.bench]) if (h && h !== dyn) h.skillUsedThisTurn = true;
    const draw = giveItem(G, dyn, 'improved_cooldown');
    stackDeck(G, '0', ['hero_kelvin', 'glass_cannon']);
    const made = playOut(G);
    expect(made.some((a) => a.type === 'activate' && a.itemIid === draw.iid)).toBe(true);
    expect(made.some((a) => a.type === 'discard')).toBe(true);
    expect(G.pendingDiscard).toBeUndefined();
    // The hero is kept; the tier-4 item it cannot pay for anytime soon goes.
    expect(me.discard.map((c) => c.cardId)).toEqual(['glass_cannon']);
  });

  it('discardChoice keeps heroes, then items its heroes could take, cheaper first; drops items no hero can take', () => {
    const G = turn(4);
    const me = G.players['0'];
    const haze = me.active!;
    for (const h of [haze, ...me.bench]) if (h) giveItem(G, h, 'extended_magazine');
    const hero = giveCard(G, '0', 'hero_kelvin');
    const useless = giveCard(G, '0', 'extended_magazine');          // every hero wears one
    const wanted = giveCard(G, '0', 'mystic_slow');                 // Lash's build
    const dear = giveCard(G, '0', 'boundless_spirit');              // tier 4, far off
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
