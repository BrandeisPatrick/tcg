import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { battleOwed, battleThisTurn } from '@/engine/combat';
import { addStatus } from '@/engine/statusOps';
import { resolve } from '@/engine/damage';
import { enumerateAIMoves } from '@/ai/heuristic';
import type { GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, configureReadyMatch, makeHero } from './_helpers';

// A turn runs Prepare → Battle → Prepare → End Turn. `enterBattle` fights
// the battle and keeps the turn; `endTurn` hands it over.

beforeAll(configureReadyMatch);

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
/** Both Actives' HP, [P0, P1]. */
const activeHp = (G: GameState) => [G.players['0'].active!.hp, G.players['1'].active!.hp];

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

describe('turn phases: prepare, battle, prepare, end turn', () => {
  it('Turn 1 has no battle: enterBattle is rejected and the turn simply ends', () => {
    const c = newClient();
    const before = snap(c);
    expect(battleThisTurn(before.G)).toBe(false);
    expect(battleOwed(before.G)).toBe(false);
    (c.moves as any).enterBattle();
    expect(snap(c).G.battleFought).toBe(false);
    expect(activeHp(snap(c).G)).toEqual(activeHp(before.G));
    c.moves.endTurn?.();
    expect(snap(c).ctx.currentPlayer).toBe('1');
    expect(activeHp(snap(c).G)).toEqual(activeHp(before.G)); // nobody swung
  });

  it('enterBattle fights the battle and keeps the turn', () => {
    const c = newClient();
    c.moves.endTurn?.(); // → P1, turn 2
    const before = snap(c);
    expect(before.ctx.currentPlayer).toBe('1');
    expect(battleOwed(before.G)).toBe(true);
    (c.moves as any).enterBattle();
    const after = snap(c);
    expect(after.ctx.currentPlayer).toBe('1'); // still P1's turn
    expect(after.G.battleFought).toBe(true);
    expect(battleOwed(after.G)).toBe(false);
    // Both Actives took the trade.
    expect(after.G.players['0'].active!.hp).toBeLessThan(before.G.players['0'].active!.hp);
    expect(after.G.players['1'].active!.hp).toBeLessThan(before.G.players['1'].active!.hp);
  });

  it('there is one battle a turn: a second enterBattle is rejected, and endTurn does not swing again', () => {
    const c = newClient();
    c.moves.endTurn?.();
    (c.moves as any).enterBattle();
    const fought = activeHp(snap(c).G);
    (c.moves as any).enterBattle();
    expect(activeHp(snap(c).G)).toEqual(fought);
    c.moves.endTurn?.();
    const next = snap(c);
    expect(next.ctx.currentPlayer).toBe('0');
    // P0's Active regenerates nothing at turn start in this roster, so its HP
    // after the handover is the HP it left the battle with.
    expect(next.G.players['0'].active!.hp).toBe(fought[0]);
  });

  it('the second prepare phase still takes moves: a skill after the battle', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    expect(runMove('enterBattle', G, '0')).not.toBe('INVALID_MOVE');
    expect(G.battleFought).toBe(true);
    const lash = me.bench[1]!; // Lash carries a skill; the Active (Haze) is passive-only
    const hpBefore = G.players['1'].active!.hp;
    const soulsBefore = me.souls; // read after the battle: a kill in it pays a bounty
    expect(runMove('useSkill', G, '0', lash.iid, G.players['1'].active!.iid)).not.toBe('INVALID_MOVE');
    expect(G.players['1'].active!.hp).toBeLessThan(hpBefore);
    expect(me.souls).toBe(soulsBefore - 1);
  });

  it('ending the turn without entering battle fights it on the way out', () => {
    const viaButton = newClient();
    viaButton.moves.endTurn?.();
    (viaButton.moves as any).enterBattle();
    viaButton.moves.endTurn?.();

    const straight = newClient();
    straight.moves.endTurn?.();
    straight.moves.endTurn?.();

    expect(activeHp(snap(straight).G)).toEqual(activeHp(snap(viaButton).G));
    expect(snap(straight).ctx.currentPlayer).toBe('0');
  });

  it('a fallen Active is replaced before the battle: enterBattle waits for the promotion', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active!.hp = 0;
    resolve(G); // the Active falls; a bench hero can step up, so a promotion is owed
    expect(G.pendingPromotion).toBe('0');
    expect(runMove('enterBattle', G, '0')).toBe('INVALID_MOVE');
    expect(G.battleFought).toBe(false); // the battle is still there for whoever steps up
    expect(runMove('promoteToActive', G, '0', me.bench.find((b) => b && !b.respawnTurnsLeft)!.iid)).not.toBe('INVALID_MOVE');
    const rivalHp = G.players['1'].active!.hp;
    expect(runMove('enterBattle', G, '0')).not.toBe('INVALID_MOVE');
    expect(G.players['1'].active!.hp).toBeLessThan(rivalHp);
  });

  it('battleFought resets when the next turn begins', () => {
    const c = newClient();
    c.moves.endTurn?.();
    (c.moves as any).enterBattle();
    expect(snap(c).G.battleFought).toBe(true);
    c.moves.endTurn?.();
    expect(snap(c).G.battleFought).toBe(false);
    expect(battleOwed(snap(c).G)).toBe(true);
  });

  it('a channeled ultimate pulses at the end of the turn, after the battle', () => {
    const c = newClient();
    c.moves.endTurn?.(); // → P1, turn 2
    c.moves.endTurn?.(); // → P0, turn 3
    // Hand P0 a channeling Dynamo through the store's own state.
    const state = c.getState()!;
    const G = structuredClone(state.G) as GameState;
    const dynamo = makeHero('hero_dynamo', '0', 'active', 0);
    G.players['0'].active = dynamo;
    addStatus(G, dynamo, 'casting', 3, 3);
    (c as any).store.dispatch({ type: 'SYNC', state: { ...state, G } });

    const benchBefore = snap(c).G.players['1'].bench.map((b) => b?.hp);
    (c.moves as any).enterBattle();
    // The battle touches only the Actives (and a channeler does not swing):
    // the rival bench is untouched until the turn ends.
    expect(snap(c).G.players['1'].bench.map((b) => b?.hp)).toEqual(benchBefore);
    c.moves.endTurn?.();
    const benchAfter = snap(c).G.players['1'].bench.map((b) => b?.hp);
    benchAfter.forEach((hp, i) => { if (hp != null) expect(hp).toBeLessThan(benchBefore[i]!); });
  });
});

describe('AI: passes twice a turn', () => {
  const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;

  it('offers enterBattle while the battle is ahead, never endTurn', () => {
    const G = freshReadyGame();
    for (const lookahead of [false, true]) {
      const moves = enumerateAIMoves(G, ctx('1'), lookahead).map((m) => m.move);
      expect(moves).toContain('enterBattle');
      expect(moves).not.toContain('endTurn');
    }
  });

  it('offers endTurn once the battle is fought, never a second battle', () => {
    const G = freshReadyGame();
    G.battleFought = true;
    for (const lookahead of [false, true]) {
      const moves = enumerateAIMoves(G, ctx('1'), lookahead).map((m) => m.move);
      expect(moves).toContain('endTurn');
      expect(moves).not.toContain('enterBattle');
    }
  });

  it('offers endTurn on Turn 1, which has no battle', () => {
    const G = freshReadyGame();
    G.turnNumber = 1;
    const moves = enumerateAIMoves(G, ctx('0')).map((m) => m.move);
    expect(moves).toContain('endTurn');
    expect(moves).not.toContain('enterBattle');
  });

  it('never ranks a move the engine would reject', () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.souls = 9;
    // Gear the Active already wears, and a second copy in hand.
    const worn = { ...ai.deck[0], cardId: 'extended_magazine', iid: 'worn', zone: 'equipment' as const };
    ai.active!.attached = [worn];
    ai.hand = [{ ...ai.deck[1], cardId: 'extended_magazine', iid: 'copy', zone: 'hand' as const }];
    // A bench hero locked in a heavy channel: no skill from him.
    const dynamo = ai.bench.find((b) => b?.cardId === 'hero_dynamo')!;
    addStatus(G, dynamo, 'casting', 3, 3);

    for (const lookahead of [false, true]) {
      const moves = enumerateAIMoves(G, ctx('1'), lookahead);
      expect(moves.some((m) => m.move === 'playCard' && m.args[1] === ai.active!.iid)).toBe(false);
      expect(moves.some((m) => m.move === 'useSkill' && m.args[0] === dynamo.iid)).toBe(false);
      // …and everything it does offer, the engine takes.
      for (const m of moves) {
        if (m.move === 'enterBattle' || m.move === 'endTurn') continue;
        expect(runMove(m.move, structuredClone(G), '1', ...m.args)).not.toBe('INVALID_MOVE');
      }
    }
  });

  it('a promotion owed by the other seat comes first, highest HP first', () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = 0;
    p0.bench[2]!.hp = p0.bench[2]!.hpMax = 30; // the healthiest of the bench
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    const moves = enumerateAIMoves(G, ctx('1'));
    expect(moves.every((m) => m.move === 'promoteToActive')).toBe(true);
    expect(moves[0].args[0]).toBe(p0.bench[2]!.iid);
    // It is P0's promotion, made from P1's seat.
    expect(runMove('promoteToActive', G, '1', ...moves[0].args)).not.toBe('INVALID_MOVE');
    expect(G.players['0'].active!.iid).toBe(moves[0].args[0]);
    expect(G.pendingPromotion).toBeUndefined();
  });

  it('buffs before it fights: gear that adds attack is played ahead of the battle', () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.souls = 2;
    ai.hand = [{ ...ai.deck[0], cardId: 'extended_magazine', iid: 'mag', zone: 'hand' }];
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('playCard');
    expect(best.args[0]).toBe('mag');
  });
});
