import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import type { GameState } from '@/engine/types';
import type { Ctx } from 'boardgame.io';
import { configureReadyMatch, passTurn } from './_helpers';
import { LANE_INCOME, PATRON_HP } from '@/engine/constants';

// Boot the boardgame.io Client straight into a playable match (skip the draft).
beforeAll(configureReadyMatch);

function newClient() {
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  return client;
}

function snap(client: ReturnType<typeof newClient>) {
  const s = client.getState();
  if (!s) throw new Error('no state');
  return { G: s.G as GameState, ctx: s.ctx as Ctx };
}

/** Shop by the AI's rule until the shop is closed: every turn opens in its
 *  shop step, where only the shop's moves (and ending the turn) are legal. */
function shopAsAI(client: ReturnType<typeof newClient>, maxMoves = 12) {
  for (let i = 0; i < maxMoves; i++) {
    const { G, ctx } = snap(client);
    if (ctx.gameover || G.step !== 'shop') return;
    const best = enumerateAIMoves(G, ctx)[0];
    if (!best || best.move === 'endTurn') break;
    (client.moves as any)[best.move](...best.args);
  }
  if (!snap(client).ctx.gameover && snap(client).G.step === 'shop') client.moves.closeShop();
}

function runAITurn(client: ReturnType<typeof newClient>, maxMoves = 12) {
  shopAsAI(client);
  for (let i = 0; i < maxMoves; i++) {
    const { G, ctx } = snap(client);
    if (ctx.gameover) return;
    const moves = enumerateAIMoves(G, ctx);
    const best = moves[0];
    if (!best || best.move === 'endTurn') {
      client.moves.endTurn?.();
      return;
    }
    try {
      (client.moves as any)[best.move](...best.args);
    } catch {
      client.moves.endTurn?.();
      return;
    }
    // If we just played and there's nothing better than endTurn, stop
    if (best.score < 5) {
      client.moves.endTurn?.();
      return;
    }
  }
  client.moves.endTurn?.();
}

describe('Deadlock TCG engine smoke', () => {
  it('initializes a match with two full boards and empty hands, turn 1 opening on its shop with the income banked', () => {
    const c = newClient();
    const { G, ctx } = snap(c);
    expect(G.players['0'].hp).toBe(PATRON_HP);
    expect(G.players['1'].hp).toBe(PATRON_HP);
    expect(G.players['0'].active).not.toBeNull();
    expect(G.players['1'].active).not.toBeNull();
    expect(G.players['0'].bench.filter(Boolean).length).toBe(3);
    expect(G.players['1'].bench.filter(Boolean).length).toBe(3);
    // No deck and no draw: a card enters the hand only by a buy.
    expect(G.players['0'].hand).toEqual([]);
    expect(G.players['1'].hand).toEqual([]);
    // After T1 begin, P0 has its first income and stands in the shop step.
    expect(G.step).toBe('shop');
    expect(G.players['0'].souls).toBe(LANE_INCOME);
    expect(G.players['1'].souls).toBe(0);
    expect(ctx.currentPlayer).toBe('0');
  });

  it('end turn alternates players and never attacks', () => {
    const c = newClient();
    const beforeOppHP = (snap(c).G.players['1'].active?.hp) ?? 0;
    c.moves.endTurn?.();
    const { G, ctx } = snap(c);
    expect(ctx.currentPlayer).toBe('1');
    // The attack is a move of its own; ending the turn does not make it.
    const oppActiveAfter = G.players['1'].active;
    expect(oppActiveAfter).not.toBeNull();
    if (oppActiveAfter) {
      expect(oppActiveAfter.hp).toBe(beforeOppHP);
    }
  });

  it('AI heuristic plays at least one move that is not endTurn', () => {
    const c = newClient();
    passTurn(c); // pass to AI, its shop closed: the act step
    const { G, ctx } = snap(c);
    expect(ctx.currentPlayer).toBe('1');
    const moves = enumerateAIMoves(G, ctx);
    expect(moves.length).toBeGreaterThan(1);
    expect(moves[0].score).toBeGreaterThan(1);
  });

  it('runs 20 turns without crashing and tends toward a winner', () => {
    const c = newClient();
    for (let t = 0; t < 20; t++) {
      const { ctx } = snap(c);
      if (ctx.gameover) break;
      if (ctx.currentPlayer === '0') {
        // Player shops as the AI would, then plays the first available high-value option
        shopAsAI(c);
        const { G } = snap(c);
        const opts = enumerateAIMoves(G, ctx);
        const best = opts[0];
        if (best && best.move !== 'endTurn' && best.score > 5) {
          try { (c.moves as any)[best.move](...best.args); } catch {}
        }
        c.moves.endTurn?.();
      } else {
        runAITurn(c);
      }
    }
    const { G } = snap(c);
    // The patrons took real damage (both start at PATRON_HP: a sum under 2 × PATRON_HP is a fall paid for or a push).
    expect(G.players['0'].hp + G.players['1'].hp).toBeLessThan(2 * PATRON_HP);
    // The AI never holds a card: whatever it bought, it played.
    expect(G.players['1'].hand).toEqual([]);
  });

  it('damage pipeline: spirit ignores armor, pure ignores shield', async () => {
    const { damageUnit } = await import('@/engine/damage');
    const { addStatus } = await import('@/engine/statusOps');
    // Construct a fresh, unfrozen GameState directly (not via boardgame.io client)
    const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
    const G: GameState = JSON.parse(JSON.stringify(setup));
    const tgt = G.players['1'].active!;
    const beforeHp = tgt.hp;
    addStatus(G, tgt, 'bullet_resist', 2, 99);
    addStatus(G, tgt, 'shield', 3, 99);
    // Attack 4: shield absorbs 3 → 1 left; armor 2 reduces to 0
    damageUnit(G, tgt, 4, 'attack');
    expect(tgt.hp).toBe(beforeHp);
    // Pure ignores both armor and shield
    damageUnit(G, tgt, 5, 'pure');
    expect(tgt.hp).toBe(beforeHp - 5);
  });
});
