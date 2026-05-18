import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import type { GameState, PlayerID } from '@/engine/types';
import type { Ctx } from 'boardgame.io';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/damage';

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
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  return JSON.parse(JSON.stringify(setup)) as GameState;
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
    // Synthesize Mystic Burst (now an equipment) in hand and attach to own active.
    const shot = { ...G.players['0'].deck[0], cardId: 'mystic_burst', iid: 'test_shot' } as any;
    G.players['0'].hand = [shot];
    const before = G.players['0'].souls;
    const r = runMove('playCard', G, '0', 'test_shot', G.players['0'].active!.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(before - 1); // Mystic Burst cost 1
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
    for (let i = 0; i < 13; i++) c.moves.endTurn?.();
    const { G } = snap(c);
    expect(G.players['0'].souls).toBe(7);
    // Two more P0 turns; still 7, not climbing.
    for (let i = 0; i < 4; i++) c.moves.endTurn?.();
    const { G: G2 } = snap(c);
    expect(G2.players['0'].souls).toBe(7);
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

  // ----- Spirit scaling on hero skills -----
  it('hero skill at 0 SPI deals base damage (Haze: 2 + 0 = 2 spirit)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_haze'];
    expect(skill.scalesSpirit).toBe(true);
    expect(skill.base).toBe(2);
    const G = freshG();
    const haze = G.players['0'].active!;
    haze.spiritMod = 0;
    const target = G.players['1'].active!;
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: haze, target });
    expect(hpBefore - target.hp).toBe(2);
    expect(target.statuses.some((s) => s.id === 'stun')).toBe(true);
  });

  it('hero skill at +3 SPI deals base + spirit (Haze: 2 + 3 = 5 spirit)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_haze'];
    const G = freshG();
    const haze = G.players['0'].active!;
    haze.spiritMod = 3;
    const target = G.players['1'].active!;
    const hpBefore = target.hp;
    skill.run(G, { movingPlayer: '0' }, { source: haze, target });
    expect(hpBefore - target.hp).toBe(5);
  });

  it('heal scales with spirit (Rem heal 3 + 2 SPI = 5)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_rem'];
    expect(skill.scalesSpirit).toBe(true);
    const G = freshG();
    const rem = G.players['0'].active!;
    rem.spiritMod = 2;
    // Wound an ally so the heal lands
    const ally = G.players['0'].bench[0]!;
    ally.hp = 1;
    const hpBefore = ally.hp;
    skill.run(G, { movingPlayer: '0' }, { source: rem, target: ally });
    expect(ally.hp - hpBefore).toBe(5);
  });

  it('shield magnitude scales with spirit (Paige shield 3 + 4 SPI = 7)', async () => {
    const { ABILITIES_BY_ID } = await import('@/abilities');
    const skill = ABILITIES_BY_ID['skill_paige'];
    const G = freshG();
    const paige = G.players['0'].active!;
    paige.spiritMod = 4;
    const ally = G.players['0'].bench[0]!;
    skill.run(G, { movingPlayer: '0' }, { source: paige, target: ally });
    const sh = ally.statuses.find((s) => s.id === 'shield');
    expect(sh?.value).toBe(7);
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
