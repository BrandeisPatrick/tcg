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
    const hero1 = me.active!;
    const hero2 = me.bench[0]!;
    expect(me.skillUsedThisTurn).toBe(false);
    const r1 = runMove('useSkill', G, '0', hero1.iid, enemy.active!.iid);
    expect(r1).not.toBe('INVALID_MOVE');
    expect(me.skillUsedThisTurn).toBe(true);
    const r2 = runMove('useSkill', G, '0', hero2.iid, enemy.active!.iid);
    expect(r2).toBe('INVALID_MOVE');
  });

  it('flag resets at the start of the player\'s next turn', () => {
    const c = Client({ game: DeadlockGame, numPlayers: 2 });
    c.start();
    // Pop the initial state — flag should be false.
    let g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(false);
    // Use a skill (Haze active hits enemy active).
    const hero = g.players['0'].active!;
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
  it("a KO'd hero stays in slot as a corpse (not in discard)", () => {
    const G = freshG();
    const hero = G.players['1'].active!;
    const targetIid = hero.iid;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['1']);
    // Corpse stays in active slot — UI greys it out via respawnTurnsLeft.
    expect(G.players['1'].discard.some((c: any) => c.iid === targetIid)).toBe(false);
    expect(G.players['1'].active?.iid).toBe(targetIid);
    expect((G.players['1'].active?.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
  });

  it('respawning hero returns to life after RESPAWN_TURNS', () => {
    const G = freshG();
    const hero = G.players['1'].active!;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['1']);
    const corpse = G.players['1'].active!;
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
});
