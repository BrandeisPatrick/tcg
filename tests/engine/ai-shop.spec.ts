/**
 * The AI and the shop (src/ai/heuristic.ts). In the shop step it names one
 * move by rule, not by lookahead: the next item of the Active's default build
 * it can afford (the market's stand-in when the build item is off sale), then
 * the bench's; it saves when the Active's next item is two turns of income
 * away or less; it never sells or moves an item; and it closes the shop when
 * it is done. Every move it names is one the engine takes — and two AIs play a
 * drafted match through a boardgame.io Client to the end without a stall.
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
import { freshReadyGame, giveItem } from './_helpers';

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
  if (m.move === 'buy') return { type: 'buy', itemId: m.args[0], heroIid: m.args[1] };
  expect(m).toMatchObject({ move: 'closeShop', args: [] });
  return { type: 'closeShop' };
}

const saved = getMatchConfig();
afterEach(() => {
  setMatchConfig(saved);
  vi.restoreAllMocks();
});

describe('the AI in the shop step', () => {
  it('names one move, a buy the engine takes or closeShop, and shops until it closes — never selling or moving an item', () => {
    for (const souls of [0, 1, 2, 4, 7, 8, 16, 40]) {
      const G = shop(souls);
      const buys: string[] = [];
      for (let i = 0; i < 20; i++) {
        const a = aiShopMove(G);
        expect(blocked(G, '0', a), `${souls} souls: ${JSON.stringify(a)}`).toBeNull();
        expect(perform(G, '0', a)).not.toBe(INVALID);
        if (a.type === 'closeShop') break;
        buys.push((a as { itemId: string }).itemId);
      }
      expect(G.step, `${souls} souls`).toBe('act');
      expect(G.players['0'].souls).toBeGreaterThanOrEqual(0);
      if (souls < 2) expect(buys).toEqual([]);
    }
  });

  it('buys the Active\'s next build item first: its first signature item', () => {
    const G = shop(20);
    const haze = G.players['0'].active!;
    expect(defaultBuild(haze.cardId)[0]).toBe('active_reload');
    expect(aiShopMove(G)).toEqual({ type: 'buy', itemId: 'active_reload', heroIid: haze.iid });
  });

  it('a build item off sale: it buys the market\'s stand-in, same tab and tier', () => {
    const G = shop(20);
    const haze = G.players['0'].active!;
    G.market = G.market.filter((id) => id !== 'active_reload');
    const standIn = marketStandIn(G, 'active_reload')!;
    expect(standIn).toBeDefined();
    expect(onSale(G, standIn)).toBe(true);
    expect([itemCard(standIn)!.slot, itemCard(standIn)!.tier]).toEqual([itemCard('active_reload')!.slot, itemCard('active_reload')!.tier]);
    expect(aiShopMove(G)).toEqual({ type: 'buy', itemId: standIn, heroIid: haze.iid });
  });

  it('saves for the Active\'s next item when it is two turns of income away or less, and spends nothing on the bench meanwhile', () => {
    const G = shop(4);
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'active_reload');                           // next: Burst Fire, tier 3 (8 souls)
    expect(defaultBuild('hero_vindicta')[0]).toBe('long_range');   // tier 2: 4 souls, affordable
    expect(aiShopMove(G)).toEqual({ type: 'closeShop' });
    G.players['0'].souls = 8;
    expect(aiShopMove(G)).toEqual({ type: 'buy', itemId: 'burst_fire', heroIid: haze.iid });
  });

  it('with nothing left on the Active\'s build it can wear, it shops for the bench', () => {
    const G = shop(4);
    const haze = G.players['0'].active!;
    for (const id of defaultBuild(haze.cardId).slice(0, 3)) giveItem(G, haze, id); // full, and nothing later is an upgrade of these
    expect(aiShopMove(G)).toEqual({ type: 'buy', itemId: 'long_range', heroIid: G.players['0'].bench[0]!.iid });
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
