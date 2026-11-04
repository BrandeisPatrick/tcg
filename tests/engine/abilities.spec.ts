import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { DeadlockGame } from '@/engine/game';
import { heroData, heroesOf, kitAbilityIds } from '@/engine/query';

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
      for (const skillId of hero.skills) {
        const G = freshGame();
        const ability = ABILITIES_BY_ID[skillId];
        expect(ability, `Hero ${hero.id} -> skill ${skillId} missing`).toBeTruthy();
        const source = G.players['0'].active!;
        const target = pickTargetFor(G, ability.target, '0', source);
        expect(() => ability.run(G, { movingPlayer: '0' }, { source, target })).not.toThrow();
      }
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

/** Every card on `pid`'s side of the board: its heroes and, worn by them, what they carry. */
function boardCards(G: GameState, pid: PlayerID): CardInstance[] {
  const out: CardInstance[] = [];
  const walk = (c: CardInstance) => { out.push(c); for (const a of c.attached ?? []) walk(a); };
  for (const c of [G.players[pid].active, ...G.players[pid].bench]) if (c) walk(c);
  return out;
}

describe('Ultimates are kit abilities, never cards', () => {
  it('no ultimate is ever dealt: a played-out match leaves no card of one on the board, every ultimate a kit ability', async () => {
    const { Client } = await import('boardgame.io/client');
    const { enumerateAIMoves } = await import('@/ai/heuristic');
    const { configureReadyMatch } = await import('./_helpers');
    const { getMatchConfig, setMatchConfig } = await import('@/storage/matchConfig');
    const saved = getMatchConfig();
    configureReadyMatch();
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    setMatchConfig(saved);
    for (let guard = 0; guard < 600 && !client.getState()!.ctx.gameover; guard++) {
      const { G: g, ctx } = client.getState()!;
      const before = client.getState()!._stateID;
      const best = enumerateAIMoves(g as GameState, ctx)[0];
      if (!best || best.move === 'endTurn') client.moves.endTurn?.();
      else (client.moves as any)[best.move](...best.args);
      if (client.getState()!._stateID === before) client.moves.endTurn?.();
    }
    const G = client.getState()!.G as GameState;
    for (const pid of ['0', '1'] as PlayerID[]) {
      expect(boardCards(G, pid).filter((c) => CARDS_BY_ID[c.cardId]?.type === 'ultimate'), pid).toEqual([]);
      for (const h of heroesOf(G.players[pid])) expect(kitAbilityIds(h), h.cardId).toContain(heroData(h)!.ult);
    }
  });
});
