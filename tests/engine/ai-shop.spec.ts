/**
 * The AI and the shop (src/ai/heuristic.ts). In the shop step it names one
 * move by rule, not by lookahead: a card in its hand is played at once onto
 * the hero it bought it for (it never holds one), or sold when no hero can take
 * it; else the next item of the Active's default build it can afford (the
 * market's stand-in when the build item is off sale), then the bench's; it
 * saves when the Active's next item is two turns of income away or less; it
 * never sells or moves a worn item; and it closes the shop when it is done.
 * Every move it names is one the engine takes — and two AIs play a drafted
 * match through a boardgame.io Client to the end without a stall.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { Client } from 'boardgame.io/client';
import type { GameState, PlayerID } from '@/engine/types';
import { itemCard } from '@/cards';
import { defaultBuild } from '@/cards/builds';
import { DeadlockGame } from '@/engine/game';
import { INVALID, perform, type Action } from '@/engine/engine';
import { blocked } from '@/engine/legality';
import { marketStandIn, onSale } from '@/engine/market';
import { seededRandom } from '@/engine/rng';
import { enumerateAIMoves } from '@/ai/heuristic';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { freshReadyGame, giveCard, giveItem } from './_helpers';

const ctxFor = (pid: PlayerID) => ({ currentPlayer: pid, numPlayers: 2, turn: 2 }) as unknown as Ctx;

/** P0's shop step (engine turn 2) with `souls` to spend. */
function shop(souls: number): GameState {
  const G = freshReadyGame({ step: 'shop' });
  G.players['0'].souls = souls;
  return G;
}

/** The AI's shop move, as an engine action. */
function aiShopMove(G: GameState, pid: PlayerID = '0'): Action {
  const moves = enumerateAIMoves(G, ctxFor(pid));
  expect(moves).toHaveLength(1);
  const [m] = moves;
  if (m.move === 'buy') {
    expect(m.args).toHaveLength(1);
    return { type: 'buy', itemId: m.args[0] };
  }
  if (m.move === 'playCard') return { type: 'playCard', cardIid: m.args[0], heroIid: m.args[1] };
  if (m.move === 'sell') return { type: 'sell', itemIid: m.args[0] };
  expect(m).toMatchObject({ move: 'closeShop', args: [] });
  return { type: 'closeShop' };
}

/** Make the AI's shop move on G, which the engine must take; returns it. */
function step(G: GameState, pid: PlayerID = '0'): Action {
  const a = aiShopMove(G, pid);
  expect(blocked(G, pid, a), JSON.stringify(a)).toBeNull();
  expect(perform(G, pid, a)).not.toBe(INVALID);
  return a;
}

/** The AI buys `itemId` and, as its very next move, plays it onto `heroIid`. */
function expectBuysFor(G: GameState, itemId: string, heroIid: string) {
  expect(step(G)).toEqual({ type: 'buy', itemId });
  const card = G.players['0'].hand.at(-1)!;
  expect(card.cardId).toBe(itemId);
  expect(step(G)).toEqual({ type: 'playCard', cardIid: card.iid, heroIid });
  expect(G.players['0'].hand).toEqual([]);
}

const saved = getMatchConfig();
afterEach(() => {
  setMatchConfig(saved);
  vi.restoreAllMocks();
});

describe('the AI in the shop step', () => {
  it('names one move — a buy, the card it bought played at once, or closeShop — each one the engine takes, until it closes with an empty hand', () => {
    for (const souls of [0, 1, 2, 4, 7, 8, 16, 40]) {
      const G = shop(souls);
      const buys: string[] = [];
      let last: Action | undefined;
      for (let i = 0; i < 40; i++) {
        const a = step(G);
        if (last?.type === 'buy') expect(a.type, `${souls} souls: a card bought is played next`).toBe('playCard');
        expect(['buy', 'playCard', 'closeShop'], `${souls} souls: ${JSON.stringify(a)}`).toContain(a.type);
        last = a;
        if (a.type === 'closeShop') break;
        if (a.type === 'buy') buys.push(a.itemId);
      }
      expect(G.step, `${souls} souls`).toBe('act');
      expect(G.players['0'].hand, `${souls} souls`).toEqual([]);
      expect(G.players['0'].souls).toBeGreaterThanOrEqual(0);
      if (souls < 2) expect(buys).toEqual([]);
    }
  });

  it('buys the Active\'s next build item first — its first signature item — and plays it onto the Active', () => {
    const G = shop(20);
    const haze = G.players['0'].active!;
    expect(defaultBuild(haze.cardId)[0]).toBe('active_reload');
    expectBuysFor(G, 'active_reload', haze.iid);
    expect(haze.attached!.map((it) => it.cardId)).toEqual(['active_reload']);
  });

  it('a build item off sale: it buys the market\'s stand-in, same tab and tier', () => {
    const G = shop(20);
    const haze = G.players['0'].active!;
    G.market = G.market.filter((id) => id !== 'active_reload');
    const standIn = marketStandIn(G, 'active_reload')!;
    expect(standIn).toBeDefined();
    expect(onSale(G, standIn)).toBe(true);
    expect([itemCard(standIn)!.slot, itemCard(standIn)!.tier]).toEqual([itemCard('active_reload')!.slot, itemCard('active_reload')!.tier]);
    expectBuysFor(G, standIn, haze.iid);
  });

  it('saves for the Active\'s next item when it is two turns of income away or less, and spends nothing on the bench meanwhile', () => {
    const G = shop(4);
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'active_reload');                           // next: Burst Fire, tier 3 (8 souls)
    expect(defaultBuild('hero_vindicta')[0]).toBe('long_range');   // tier 2: 4 souls, affordable
    expect(aiShopMove(G)).toEqual({ type: 'closeShop' });
    G.players['0'].souls = 8;
    expectBuysFor(G, 'burst_fire', haze.iid);
  });

  it('with nothing left on the Active\'s build it can wear, it shops for the bench — and plays the card onto the hero it bought it for', () => {
    const G = shop(4);
    const haze = G.players['0'].active!;
    for (const id of defaultBuild(haze.cardId).slice(0, 3)) giveItem(G, haze, id); // full, and nothing later is an upgrade of these
    expectBuysFor(G, 'long_range', G.players['0'].bench[0]!.iid);
  });

  it('a card it did not buy this turn (a Story reward) goes onto the first hero whose build asks for it, else one wearing its component, else the first it may go on', () => {
    const G = shop(0);
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    expect(defaultBuild('hero_haze')).not.toContain('long_range');
    const reward = giveCard(G, '0', 'long_range');                 // Vindicta's first build item
    expect(step(G)).toEqual({ type: 'playCard', cardIid: reward.iid, heroIid: vindicta.iid });
    giveItem(G, lash, 'extra_health');
    const fortitude = giveCard(G, '0', 'fortitude');               // in no build here; it upgrades Lash's Extra Health
    expect(step(G)).toEqual({ type: 'playCard', cardIid: fortitude.iid, heroIid: lash.iid });
    const regen = giveCard(G, '0', 'extra_regen');                 // in no build, upgrading nothing
    expect(step(G)).toEqual({ type: 'playCard', cardIid: regen.iid, heroIid: haze.iid });
    expect(aiShopMove(G)).toEqual({ type: 'closeShop' });
  });

  it('a card no hero of its can take is sold back, for what was paid on its buy turn', () => {
    const G = shop(0);
    const me = G.players['0'];
    for (const hero of [me.active!, ...me.bench]) giveItem(G, hero!, 'extra_health');
    const card = giveCard(G, '0', 'extra_health', { turn: 2, paid: 2 }); // a duplicate for every hero
    expect(step(G)).toEqual({ type: 'sell', itemIid: card.iid });
    expect([me.hand, me.souls]).toEqual([[], 2]);
  });
});

describe('AI against AI through a boardgame.io Client', () => {
  it('a drafted match never stalls: every move the AI names is taken, every turn leaves its shop, and the match ends', () => {
    for (const seed of [11, 202, 3003]) {
      setMatchConfig({ heroPreferences: [null, null, null, null], seed });
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed)); // the draft's jitter reads it
      const client = Client({ game: DeadlockGame, numPlayers: 2 });
      client.start();
      let st = client.getState()!;
      let moves = 0;
      let buys = 0;
      let turnMoves = 0;
      let turn = st.ctx.turn;
      while (!st.ctx.gameover && moves < 2000) {
        const G = st.G as GameState;
        const best = enumerateAIMoves(G, st.ctx)[0];
        expect(best, `seed ${seed}: no move at engine turn ${G.turnNumber}`).toBeDefined();
        const id = st._stateID;
        (client.moves as Record<string, (...args: unknown[]) => void>)[best.move](...best.args);
        const next = client.getState()!;
        expect(next._stateID, `seed ${seed}: ${best.move}(${JSON.stringify(best.args)}) refused at engine turn ${G.turnNumber} (${G.step})`).toBeGreaterThan(id);
        if (best.move === 'buy') buys++;
        moves++;
        if (next.ctx.turn !== turn) {
          turn = next.ctx.turn;
          turnMoves = 0;
          if (!next.ctx.gameover && !(next.G as GameState).draft) expect((next.G as GameState).step).toBe('shop');
        } else {
          turnMoves++;
          expect(turnMoves, `seed ${seed}: a turn that does not end`).toBeLessThan(40);
        }
        st = next;
      }
      expect(st.ctx.gameover?.winner, `seed ${seed}: no winner after ${moves} moves`).toBeDefined();
      expect((st.G as GameState).turnNumber).toBeLessThanOrEqual(40);
      expect(buys, `seed ${seed}`).toBeGreaterThan(0);
      client.stop();
      vi.restoreAllMocks();
    }
  });
});
