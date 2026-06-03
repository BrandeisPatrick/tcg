import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { ULTIMATES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { addStatus } from '@/engine/statusOps';
import { damageUnit } from '@/engine/damage';
import type { GameState, CardInstance } from '@/engine/types';

let seq = 0;
function makeHero(cardId: string, ownerId: '0' | '1', zone: CardInstance['zone'], slot: 0 | 1 | 2 | 3): CardInstance {
  const d = CARDS_BY_ID[cardId] as any;
  return {
    iid: `t${seq++}`, cardId, ownerId, zone, slot,
    hp: d.hp, hpMax: d.hp, atkMod: 0, spiritMod: 0,
    statuses: [], attached: [], exhausted: false, skillUsedThisTurn: false,
    exp: 0, level: 1 as const,
  };
}

/** Fresh game with both boards populated (setup leaves slots empty pre-draft). */
function freshG(casterHero = 'hero_seven', enemyHero = 'hero_abrams'): GameState {
  const G = JSON.parse(JSON.stringify(
    (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } }),
  )) as GameState;
  const p0 = G.players['0'], p1 = G.players['1'];
  p0.active = makeHero(casterHero, '0', 'active', 0);
  p0.bench = [makeHero('hero_haze', '0', 'bench', 1), makeHero('hero_kelvin', '0', 'bench', 2), null];
  p1.active = makeHero(enemyHero, '1', 'active', 0);
  p1.bench = [makeHero('hero_lash', '1', 'bench', 1), makeHero('hero_dynamo', '1', 'bench', 2), null];
  p0.souls = 10; p1.souls = 10;
  return G;
}

function targetFor(G: GameState, t: string): CardInstance | undefined {
  if (t === 'self' || t === 'allyHero') return G.players['0'].active ?? undefined;
  if (t === 'enemyActive' || t === 'enemyAny' || t === 'anyBoard') return G.players['1'].active ?? undefined;
  return undefined;
}

describe('ultimates resolve without error', () => {
  for (const ult of ULTIMATES) {
    it(`${ult.id} (${ult.name}) resolves`, () => {
      const G = freshG(ult.linkedHero!, 'hero_abrams');
      const ability = getAbility(ult.abilities![0])!;
      expect(ability).toBeTruthy();
      const tgt = targetFor(G, ability.target);
      expect(() =>
        ability.run(G, { movingPlayer: '0' }, { source: G.players['0'].active!, target: tgt }),
      ).not.toThrow();
    });
  }
});

describe('ultimate-specific behaviour', () => {
  it('Shiv executes a target below half HP', () => {
    const G = freshG('hero_shiv');
    const enemy = G.players['1'].active!;
    enemy.hp = Math.floor(enemy.hpMax / 2) - 1;
    getAbility('eff_ult_shiv')!.run(G, { movingPlayer: '0' }, { target: enemy });
    expect(enemy.hp).toBeLessThanOrEqual(0);
  });

  it('Vindicta deals 5 to a healthy target, 9 below half', () => {
    const G = freshG('hero_vindicta');
    const enemy = G.players['1'].active!;
    const full = enemy.hpMax;
    getAbility('eff_ult_vindicta')!.run(G, { movingPlayer: '0' }, { target: enemy });
    expect(full - enemy.hp).toBe(5);
  });

  it('Rem applies Sleep (2t) carrying a 6 wake-up burst', () => {
    const G = freshG('hero_rem');
    const enemy = G.players['1'].active!;
    getAbility('eff_ult_rem')!.run(G, { movingPlayer: '0' }, { target: enemy });
    const sleep = enemy.statuses.find((s) => s.id === 'sleep');
    expect(sleep?.value).toBe(6);
    expect(sleep?.duration).toBe(2);
  });

  it('Sleep wakes and deals its burst when damaged', () => {
    const G = freshG();
    const enemy = G.players['1'].active!;
    enemy.hpMax = 50; enemy.hp = 50;
    addStatus(G, enemy, 'sleep', 6, 2);
    damageUnit(G, enemy, 1, 'spirit'); // 1 + 6 burst = 7
    expect(enemy.statuses.find((s) => s.id === 'sleep')).toBeUndefined();
    expect(50 - enemy.hp).toBe(7);
  });

  it('Sinclair copies the enemy Active ult into hand at 0 cost', () => {
    const G = freshG('hero_sinclair', 'hero_dynamo');
    const before = G.players['0'].hand.length;
    getAbility('eff_ult_sinclair')!.run(G, { movingPlayer: '0' }, {});
    expect(G.players['0'].hand.length).toBe(before + 1);
    const copy = G.players['0'].hand[G.players['0'].hand.length - 1];
    expect(copy.cardId).toBe('ult_dynamo');
    expect(copy.costOverride).toBe(0);
  });

  it('Mirage repositions off Active and gains Shield 3', () => {
    const G = freshG('hero_mirage');
    getAbility('eff_ult_mirage')!.run(G, { movingPlayer: '0' }, {});
    const mirage = [G.players['0'].active, ...G.players['0'].bench].find((c) => c?.cardId === 'hero_mirage')!;
    expect(mirage.statuses.find((s) => s.id === 'shield')?.value).toBe(3);
    expect(G.players['0'].active?.cardId).not.toBe('hero_mirage');
  });

  it('Dynamo stuns the entire enemy board', () => {
    const G = freshG('hero_dynamo');
    getAbility('eff_ult_dynamo')!.run(G, { movingPlayer: '0' }, {});
    const enemies = [G.players['1'].active, ...G.players['1'].bench].filter(Boolean) as CardInstance[];
    expect(enemies.every((e) => e.statuses.some((s) => s.id === 'stun'))).toBe(true);
  });
});
