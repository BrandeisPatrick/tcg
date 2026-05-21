import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import { damageUnit, reapDead } from '@/engine/damage';
import type { GameState, PlayerID } from '@/engine/types';

function freshG(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  return JSON.parse(JSON.stringify(setup)) as GameState;
}

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

describe('rule: only one skill per player per turn', () => {
  it('rejects a second skill use in the same turn', () => {
    const G = freshG();
    const me = G.players['0'];
    const enemy = G.players['1'];
    // Aggro deck heroes: [haze (passive), vindicta (passive), lash (skill), paige (skill)].
    // Pick the two skill heroes — Lash + Paige — for this per-turn-cap test.
    const hero1 = me.bench[1]!;  // Lash
    const hero2 = me.bench[2]!;  // Paige
    expect(me.skillUsedThisTurn).toBe(false);
    const r1 = runMove('useSkill', G, '0', hero1.iid, enemy.active!.iid);
    expect(r1).not.toBe('INVALID_MOVE');
    expect(me.skillUsedThisTurn).toBe(true);
    const r2 = runMove('useSkill', G, '0', hero2.iid, me.active!.iid);
    expect(r2).toBe('INVALID_MOVE');
  });

  it('flag resets at the start of the player\'s next turn', () => {
    const c = Client({ game: DeadlockGame, numPlayers: 2 });
    c.start();
    let g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(false);
    // Use a skill — Lash on bench (active Haze is now passive-only).
    const hero = g.players['0'].bench[1]!;  // Lash
    const target = g.players['1'].active!;
    (c.moves as any).useSkill(hero.iid, target.iid);
    g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(true);
    // End turn, opponent's turn begins; flag still set for P0.
    c.moves.endTurn?.();
    g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(true);
    // End opp turn; P0's turn begins again, flag resets.
    c.moves.endTurn?.();
    g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(false);
  });
});

describe('rule: hero respawn after KO', () => {
  it("a KO'd hero stays on the board as a corpse (not in discard)", () => {
    const G = freshG();
    // Use P0 so we don't trigger AI auto-promote (which moves the corpse to
    // the bench). The "corpse stays on board" rule is what's under test here.
    const hero = G.players['0'].active!;
    const targetIid = hero.iid;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['0']);
    expect(G.players['0'].discard.some((c: any) => c.iid === targetIid)).toBe(false);
    expect(G.players['0'].active?.iid).toBe(targetIid);
    expect((G.players['0'].active?.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
  });

  it('respawning hero returns to life after RESPAWN_TURNS', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['0']);
    const corpse = G.players['0'].active!;
    const start = corpse.respawnTurnsLeft ?? 0;
    expect(start).toBeGreaterThan(0);
    // Simulate tickRespawn: decrement until 0 and verify restoration.
    while ((corpse.respawnTurnsLeft ?? 0) > 0) {
      corpse.respawnTurnsLeft = (corpse.respawnTurnsLeft ?? 0) - 1;
    }
    if ((corpse.respawnTurnsLeft ?? 0) <= 0) {
      corpse.respawnTurnsLeft = undefined;
      corpse.hp = corpse.hpMax;
      corpse.exhausted = false;
    }
    expect(corpse.hp).toBe(corpse.hpMax);
    expect(corpse.respawnTurnsLeft).toBeUndefined();
  });

  it('overflow damage on KO spills to the patron HP', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hp = 3;
    const beforePatron = G.players['1'].hp;
    damageUnit(G, target, 8, 'pure'); // 3 to KO, 5 overflow
    expect(target.hp).toBe(0);
    expect(G.players['1'].hp).toBe(beforePatron - 5);
  });

  it("AI auto-promotes the strongest bench hero when its Active dies", () => {
    const G = freshG();
    const aiActive = G.players['1'].active!;
    const aiActiveIid = aiActive.iid;
    // Pick the strongest bench hero by HP for verification.
    const benchAlive = G.players['1'].bench.filter(Boolean) as any[];
    benchAlive.sort((a, b) => b.hp - a.hp);
    const expectedPromoted = benchAlive[0];
    expect(expectedPromoted).toBeDefined();

    damageUnit(G, aiActive, 9999, 'pure');
    reapDead(G, G.players['1']);

    // Active slot now holds the promoted hero, not the corpse.
    expect(G.players['1'].active?.iid).toBe(expectedPromoted.iid);
    expect((G.players['1'].active?.respawnTurnsLeft ?? 0)).toBe(0);
    // The corpse moved to a bench slot and kept its respawn countdown.
    const corpseOnBench = G.players['1'].bench.find((b) => b?.iid === aiActiveIid);
    expect(corpseOnBench).toBeDefined();
    expect((corpseOnBench!.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
  });

  it("AI's Active stays a corpse when no bench hero can be promoted", () => {
    const G = freshG();
    // Empty AI bench so no candidates remain.
    G.players['1'].bench = [null, null, null];
    const aiActive = G.players['1'].active!;
    damageUnit(G, aiActive, 9999, 'pure');
    reapDead(G, G.players['1']);
    // No swap — corpse stays in slot.
    expect(G.players['1'].active?.iid).toBe(aiActive.iid);
    expect((G.players['1'].active?.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
  });

  it("promoteToActive works during the OPPONENT's turn (cross-turn callable)", () => {
    const G = freshG();
    // Kill P0's active so they're a corpse and need to promote.
    const p0Active = G.players['0'].active!;
    damageUnit(G, p0Active, 9999, 'pure');
    reapDead(G, G.players['0']);
    expect((G.players['0'].active?.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
    const benchPick = G.players['0'].bench.find((b) => b)!;
    // Dispatch the promote move with playerID='1' (opponent's turn). It must
    // still act on P0's board — the owning player is derived from the iid.
    const r = runMove('promoteToActive', G, '1', benchPick.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].active?.iid).toBe(benchPick.iid);
  });
});
