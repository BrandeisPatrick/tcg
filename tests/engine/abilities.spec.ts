import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { DeadlockGame } from '@/engine/game';

function freshGame(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  const G: GameState = JSON.parse(JSON.stringify(setup));
  // Pre-damage so heals show effect; mark all skills as used so refresh-ult shows effect.
  for (const pid of ['0','1'] as PlayerID[]) {
    const ps = G.players[pid];
    ps.hp = 12;
    if (ps.active) { ps.active.hp = Math.max(1, Math.floor(ps.active.hpMax / 2)); ps.active.skillUsedThisTurn = true; }
    for (const b of ps.bench) if (b) { b.hp = Math.max(1, Math.floor(b.hpMax / 2)); b.skillUsedThisTurn = true; }
  }
  return G;
}

function pickTargetFor(G: GameState, filter: string, pid: PlayerID, source?: CardInstance): CardInstance | undefined {
  const me = G.players[pid];
  const opp = G.players[pid === '0' ? '1' : '0'];
  switch (filter) {
    case 'noTarget': return undefined;
    case 'self': return source ?? me.active ?? undefined;
    case 'allyAny':
    case 'allyHero':
      return me.active ?? undefined;
    case 'enemyAny':
    case 'enemyHero':
    case 'enemyActive':
      return opp.active ?? undefined;
    case 'anyBoard':
      return opp.active ?? me.active ?? undefined;
  }
  return undefined;
}

describe('Abilities — every card has a registered, executable ability', () => {
  it('every spell maps to a real ability and runs', () => {
    for (const spell of SPELLS) {
      const G = freshGame();
      const ability = ABILITIES_BY_ID[spell.abilities[0]];
      expect(ability, `Spell ${spell.id} -> ability ${spell.abilities[0]} missing`).toBeTruthy();
      const target = pickTargetFor(G, ability.target, '0');
      const source = G.players['0'].active!;
      expect(() => ability.run(G, { movingPlayer: '0' }, { source, target })).not.toThrow();
    }
  });

  it('every equipment maps to real abilities and runs', () => {
    for (const eq of EQUIPMENT) {
      const G = freshGame();
      const target = G.players['0'].active!;
      for (const aid of eq.abilities ?? []) {
        const a = ABILITIES_BY_ID[aid];
        expect(a, `Equipment ${eq.id} -> ability ${aid} missing`).toBeTruthy();
        expect(() => a.run(G, { movingPlayer: '0' }, { source: target, target })).not.toThrow();
      }
    }
  });

  it('every hero skill maps to a real ability and runs', () => {
    for (const hero of HEROES) {
      if (!hero.skill) continue;
      const G = freshGame();
      const ability = ABILITIES_BY_ID[hero.skill];
      expect(ability, `Hero ${hero.id} -> skill ${hero.skill} missing`).toBeTruthy();
      const source = G.players['0'].active!;
      const target = pickTargetFor(G, ability.target, '0', source);
      expect(() => ability.run(G, { movingPlayer: '0' }, { source, target })).not.toThrow();
    }
  });

  it('every ultimate maps to a real ability and runs', () => {
    for (const ult of ULTIMATES) {
      const G = freshGame();
      const ability = ABILITIES_BY_ID[ult.abilities[0]];
      expect(ability, `Ult ${ult.id} -> ability ${ult.abilities[0]} missing`).toBeTruthy();
      const source = G.players['0'].active!;
      const target = pickTargetFor(G, ability.target, '0', source);
      expect(() => ability.run(G, { movingPlayer: '0' }, { source, target })).not.toThrow();
    }
  });

  it('every hero has a portrait identity (palette + glyph)', async () => {
    const { HERO_IDENTITY } = await import('@/cards/art/heroPalette');
    for (const hero of HEROES) {
      const id = HERO_IDENTITY[hero.id];
      expect(id, `Hero ${hero.id} missing identity`).toBeTruthy();
      expect(id.primary).toMatch(/^#/);
    }
  });
});

describe('Ult unlock — no double issuance', () => {
  it('ultsConsumed has no duplicates after several turns', async () => {
    const { Client } = await import('boardgame.io/client');
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    for (let t = 0; t < 12; t++) {
      const s = client.getState();
      if (s?.ctx.gameover) break;
      client.moves.endTurn?.();
    }
    const G = client.getState()!.G as GameState;
    for (const pid of ['0', '1'] as PlayerID[]) {
      const consumed = G.players[pid].ultsConsumed;
      const set = new Set(consumed);
      expect(set.size).toBe(consumed.length);
    }
  });
});
