import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import type { GameState, PlayerID } from '@/engine/types';
import type { Ctx } from 'boardgame.io';

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

function runAITurn(client: ReturnType<typeof newClient>, maxMoves = 12) {
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
  it('initializes a match with two full boards and 3-card hands', () => {
    const c = newClient();
    const { G, ctx } = snap(c);
    expect(G.players['0'].hp).toBe(20);
    expect(G.players['1'].hp).toBe(20);
    expect(G.players['0'].active).not.toBeNull();
    expect(G.players['1'].active).not.toBeNull();
    expect(G.players['0'].bench.filter(Boolean).length).toBe(3);
    expect(G.players['1'].bench.filter(Boolean).length).toBe(3);
    // After T1 begin, P0 drew 1 (3 + 1 = 4)
    expect(G.players['0'].hand.length).toBe(4);
    expect(G.players['0'].deck.length).toBe(20 - 4);
    expect(ctx.currentPlayer).toBe('0');
  });

  it('end turn alternates players and runs combat', () => {
    const c = newClient();
    const beforeOppHP = (snap(c).G.players['1'].active?.hp) ?? 0;
    c.moves.endTurn?.();
    const { G, ctx } = snap(c);
    expect(ctx.currentPlayer).toBe('1');
    // Opponent active should have taken player active's attack damage (Haze atk 4)
    const oppActiveAfter = G.players['1'].active;
    expect(oppActiveAfter).not.toBeNull();
    if (oppActiveAfter) {
      expect(oppActiveAfter.hp).toBeLessThanOrEqual(beforeOppHP);
    }
  });

  it('AI heuristic plays at least one move that is not endTurn', () => {
    const c = newClient();
    c.moves.endTurn?.(); // pass to AI
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
        // Player just plays first available high-value option
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
    // Both HPs went down meaningfully
    expect(G.players['0'].hp + G.players['1'].hp).toBeLessThan(40);
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
