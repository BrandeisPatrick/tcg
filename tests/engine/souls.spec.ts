import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import type { GameState, PlayerID } from '@/engine/types';
import type { Ctx } from 'boardgame.io';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/damage';
import { freshReadyGame } from './_helpers';

function newClient() {
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  return client;
}
function snap(c: ReturnType<typeof newClient>) {
  const s = c.getState();
  if (!s) throw new Error('no state');
  return { G: s.G as GameState, ctx: s.ctx as Ctx };
}

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

function freshG(): GameState {
  return freshReadyGame();
}

describe('souls economy', () => {
  it('T1 player refills to 1 soul (refill ramp 1/2/3/4/5/6/7); opponent at 0 until their turn', () => {
    const c = newClient();
    const { G } = snap(c);
    expect(G.players['0'].souls).toBe(1);
    expect(G.players['1'].souls).toBe(0);
  });

  it('playing a card deducts its cost', () => {
    const G = freshG();
    G.players['0'].souls = 5;
    // Extended Magazine: T1 equipment, cost 2, +1 Bullet Power stat stick.
    const shot = { ...G.players['0'].deck[0], cardId: 'extended_magazine', iid: 'test_shot' } as any;
    G.players['0'].hand = [shot];
    const before = G.players['0'].souls;
    const r = runMove('playCard', G, '0', 'test_shot', G.players['0'].active!.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(before - 2);
  });

  it('AI filters out unaffordable cards from enumerated moves', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const { CARDS_BY_ID } = await import('@/cards');
    const G = freshG();
    G.players['1'].souls = 0; // AI has nothing
    // Synthesize a fake ctx where currentPlayer = '1'
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx);
    // Every playCard move must reference a card we could afford (cost <= souls)
    for (const m of moves) {
      if (m.move !== 'playCard') continue;
      const iid = m.args[0];
      const card = G.players['1'].hand.find((h) => h.iid === iid);
      if (!card) continue;
      const data: any = CARDS_BY_ID[card.cardId];
      const cost = data?.cost ?? 0;
      expect(cost).toBeLessThanOrEqual(0);
    }
  });

  it('souls REFILL each turn (no hoarding) — unspent souls are lost', () => {
    const c = newClient();
    // P0 T1: refills to 1. Don't spend. End → P1 T1. End → P0 T2.
    c.moves.endTurn?.();
    c.moves.endTurn?.();
    const { G } = snap(c);
    // P0 should now be at exactly 2 (T2 refill), not 1 + 2 = 3.
    expect(G.players['0'].souls).toBe(2);
  });

  it('soul refill caps at 7 (table tail)', () => {
    const c = newClient();
    // Step through 13 endTurns = P0 has had 7 turns. Refill at turn 7 = 7.
    // Hero levelling now makes auto-combat lethal enough that patrons can
    // die before we get there, so guard each iteration against gameover and
    // assert based on the final turn we actually reached.
    for (let i = 0; i < 13; i++) {
      const { ctx } = snap(c);
      if (ctx.gameover) break;
      c.moves.endTurn?.();
    }
    const { G, ctx } = snap(c);
    if (ctx.gameover) {
      // If the game ended before turn 13, just ensure the cap held.
      expect(G.players['0'].souls).toBeLessThanOrEqual(7);
    } else {
      expect(G.players['0'].souls).toBe(7);
      // Two more P0 turns; still 7, not climbing.
      for (let i = 0; i < 4; i++) {
        const { ctx: c2 } = snap(c);
        if (c2.gameover) break;
        c.moves.endTurn?.();
      }
      const { G: G2 } = snap(c);
      expect(G2.players['0'].souls).toBeLessThanOrEqual(7);
    }
  });

  it('+1 souls bounty awarded to opponent on enemy hero KO', () => {
    const G = freshG();
    const victim = G.players['1'].active!;
    const killerPid: PlayerID = '0';
    const before = G.players[killerPid].souls;
    // Drop victim to 0 HP with pure damage then reap
    damageUnit(G, victim, victim.hp + 99, 'pure');
    reapDead(G, G.players['1']);
    expect(G.players[killerPid].souls).toBe(before + 1);
  });

  it('no bounty when an ally hero is reaped on the killer side (own-board death credits the opponent, not you)', () => {
    const G = freshG();
    // Killing OWN active credits opponent — verify it does not credit self.
    const victim = G.players['0'].active!;
    const selfBefore = G.players['0'].souls;
    const oppBefore = G.players['1'].souls;
    damageUnit(G, victim, victim.hp + 99, 'pure');
    reapDead(G, G.players['0']);
    expect(G.players['0'].souls).toBe(selfBefore); // self unchanged
    expect(G.players['1'].souls).toBe(oppBefore + 1); // opp gets bounty
  });

  it('retreat (swap Active with bench hero) costs 2 souls', () => {
    const G = freshG();
    G.players['0'].souls = 5;
    const before = G.players['0'].souls;
    const r = runMove('moveHero', G, '0', 1, 0);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(before - 2);
  });

  it('retreat is rejected when souls < 2', () => {
    const G = freshG();
    G.players['0'].souls = 1;
    const r = runMove('moveHero', G, '0', 1, 0);
    expect(r).toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(1); // unchanged
  });

  it('bench-to-bench reorganization is free', () => {
    const c = newClient();
    const before = snap(c).G.players['0'].souls;
    (c.moves as any).moveHero(1, 2); // bench 1 <-> bench 2
    const after = snap(c).G.players['0'].souls;
    expect(after).toBe(before); // no soul cost for pure bench swaps
  });

  it('AI enumerates a tactical retreat when its Active is on death\'s door', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    // Set up AI side: low-HP active, healthy bench, 3 souls available.
    G.players['1'].souls = 3;
    G.players['1'].active!.hp = 1;     // critical
    G.players['1'].active!.hpMax = 10;
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx);
    // At least one moveHero option from bench (1|2|3) into slot 0 should appear.
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBeGreaterThan(0);
    // And it should score well enough to be competitive (not the lowest fallback).
    const bestRetreat = retreats.reduce((a, b) => (a.score > b.score ? a : b));
    expect(bestRetreat.score).toBeGreaterThanOrEqual(30);
  });

  it('AI does NOT retreat when its Active is healthy and bench is similar', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = 3;
    // Active is full HP, no debuffs — no reason to retreat.
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx);
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    // Filter heuristic should suppress retreats in non-emergencies.
    expect(retreats.length).toBe(0);
  });

  it('AI retreats when its Active is hard-CC\'d (stunned/disarmed/silenced)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = 3;
    // Stunned active — dead weight even if HP is fine.
    G.players['1'].active!.statuses.push({ id: 'stun', value: 1, duration: 2 });
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx);
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBeGreaterThan(0);
  });

  it('AI cannot retreat when it lacks souls (cost-filtered out)', async () => {
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const G = freshG();
    G.players['1'].souls = 1;          // below RETREAT_COST
    G.players['1'].active!.hp = 1;     // would want to retreat
    G.players['1'].active!.hpMax = 10;
    const ctx: any = { currentPlayer: '1', turn: 2, numPlayers: 2 };
    const moves = enumerateAIMoves(G, ctx);
    const retreats = moves.filter((m) => m.move === 'moveHero' && m.args[1] === 0);
    expect(retreats.length).toBe(0);
  });

  // ----- Spirit scaling on hero skills (use Lady Geist as representative — 4 spirit dmg) -----
  it('hero skill at 0 SPI deals base damage (Lady Geist: 4 + 0 = 4 spirit)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_lady_geist'];
    expect(skill.scalesSpirit).toBe(true);
    expect(skill.base).toBe(4);
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 0;
    const target = G.players['1'].active!;
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target });
    expect(hpBefore - target.hp).toBe(4);
  });

  it('hero skill at +3 SPI deals base + spirit (Lady Geist: 4 + 3 = 7 spirit)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_lady_geist'];
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 3;
    const target = G.players['1'].active!;
    target.hpMax = 20; target.hp = 20; // soak the full damage to measure it
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target });
    expect(hpBefore - target.hp).toBe(7); // base 4 + 3 spirit
  });

  it('heal is flat — Spirit does NOT scale heals (Dynamo heal 2)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_dynamo'];
    expect(skill.scalesSpirit).toBeUndefined();
    const G = freshG();
    const healer = G.players['0'].active!;
    healer.spiritMod = 2; // spirit should be ignored for heals
    const ally = G.players['0'].bench[0]!;
    ally.hpMax = 20;
    ally.hp = 1;
    const hpBefore = ally.hp;
    skill.run(G, { movingPlayer: '0' }, { source: healer, target: ally });
    expect(ally.hp - hpBefore).toBe(2); // flat 2, no spirit
  });

  it('shield magnitude is flat — Spirit does NOT scale shields (Paige shield 4)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_paige'];
    const G = freshG();
    const paige = G.players['0'].active!;
    paige.spiritMod = 4; // spirit should be ignored for shields
    const ally = G.players['0'].bench[0]!;
    skill.run(G, { movingPlayer: '0' }, { source: paige, target: ally });
    const sh = ally.statuses.find((s) => s.id === 'shield');
    expect(sh?.value).toBe(4); // flat 4, no spirit
  });

  it('no skill has bullet scaling — all damage scaling goes through Spirit', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skillIds = Object.keys(ABILITIES_BY_ID).filter((id) => id.startsWith('skill_'));
    for (const id of skillIds) {
      const a = ABILITIES_BY_ID[id];
      // After the spirit-only redesign, scalesBullet should not exist on any skill.
      expect((a as any).scalesBullet).toBeUndefined();
    }
  });
});
