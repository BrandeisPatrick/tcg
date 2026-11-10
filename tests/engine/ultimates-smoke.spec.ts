import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { ULTIMATES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { addStatus, tickCastingPulses } from '@/engine/statusOps';
import { abilityAim, effectiveAtk, isBlocked, kitAbilityIds } from '@/engine/query';
import { damageUnit } from '@/engine/damage';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';

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

/** The ultimates' cards anywhere on `pid`'s side of the board — its heroes and
 *  what they wear: none ever, an ultimate being a kit ability. */
function ultCardsOnBoard(G: GameState, pid: PlayerID): string[] {
  const out: string[] = [];
  const walk = (c: CardInstance) => {
    if (CARDS_BY_ID[c.cardId]?.type === 'ultimate') out.push(c.cardId);
    for (const a of c.attached ?? []) walk(a);
  };
  for (const c of [G.players[pid].active, ...G.players[pid].bench]) if (c) walk(c);
  return out;
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

  it('Vindicta\'s Assassinate deals {sp:8} to any enemy, bench too', () => {
    const G = freshG('hero_vindicta');
    const enemy = G.players['1'].bench[0]!;
    enemy.hpMax = 20; enemy.hp = 20;
    getAbility('eff_ult_vindicta')!.run(G, { movingPlayer: '0' }, { target: enemy });
    expect(20 - enemy.hp).toBe(8); // run bare: no caster's Spirit on it
  });

  it('Rem\'s Naptime applies Sleep for 2 turns: a Stun, with no wake-up burst', () => {
    const G = freshG('hero_rem');
    const enemy = G.players['1'].active!;
    getAbility('eff_ult_rem')!.run(G, { movingPlayer: '0' }, { target: enemy });
    const sleep = enemy.statuses.find((s) => s.id === 'sleep');
    expect(sleep?.value).toBe(1);
    expect(sleep?.duration).toBe(2);
    expect(isBlocked(enemy, 'attack')).toBe(true);
    expect(isBlocked(enemy, 'skill')).toBe(true);
  });

  it('Sleep holds through damage: the sleeper takes only the hit and stays asleep', () => {
    const G = freshG();
    const enemy = G.players['1'].active!;
    enemy.hpMax = 50; enemy.hp = 50;
    addStatus(G, enemy, 'sleep', 1, 2);
    damageUnit(G, enemy, 1, 'spirit');
    expect(enemy.statuses.find((s) => s.id === 'sleep')?.duration).toBe(2);
    expect(50 - enemy.hp).toBe(1);
  });

  it('Sinclair casts the enemy Active\'s ultimate at once and keeps no copy (no card of it appears anywhere)', () => {
    const G = freshG('hero_sinclair', 'hero_dynamo');
    const sinclair = G.players['0'].active!;
    const enemies = [G.players['1'].active, ...G.players['1'].bench].filter(Boolean) as CardInstance[];
    getAbility('eff_ult_sinclair')!.run(G, { movingPlayer: '0' }, { source: sinclair });
    // Singularity, now: every enemy stunned.
    for (const e of enemies) expect(e.statuses.some((s) => s.id === 'stun'), e.cardId).toBe(true);
    expect(kitAbilityIds(sinclair)).not.toContain('eff_ult_dynamo');
    expect(ultCardsOnBoard(G, '0')).toEqual([]);
  });

  it('Sinclair cannot copy another Sinclair\'s ultimate: it has no target and does nothing', () => {
    const G = freshG('hero_sinclair', 'hero_sinclair');
    const sinclair = G.players['0'].active!;
    const ult = getAbility('eff_ult_sinclair')!;
    expect(abilityAim(G, '0', sinclair, ult)).toBeNull();
    const enemies = [G.players['1'].active, ...G.players['1'].bench].filter(Boolean) as CardInstance[];
    const before = enemies.map((e) => ({ hp: e.hp, statuses: e.statuses.length }));
    ult.run(G, { movingPlayer: '0' }, { source: sinclair });
    expect(enemies.map((e) => ({ hp: e.hp, statuses: e.statuses.length }))).toEqual(before);
    expect(sinclair.statuses).toEqual([]);
  });

  it('Mirage\'s Traveler swaps him with the bench ally picked, and both gain Shield 2', () => {
    const G = freshG('hero_mirage');
    const mirage = G.players['0'].active!;
    const ally = G.players['0'].bench[0]!;
    getAbility('eff_ult_mirage')!.run(G, { movingPlayer: '0' }, { source: mirage, target: ally });
    expect(G.players['0'].active).toBe(ally);
    expect(G.players['0'].bench).toContain(mirage);
    expect(mirage.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
    expect(ally.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });

  it('Dynamo\'s Singularity is instant, no channel; a heavy channel (set directly) still locks out attacks', () => {
    const G = freshG('hero_dynamo');
    getAbility('eff_ult_dynamo')!.run(G, { movingPlayer: '0' }, {});
    const dynamo = [G.players['0'].active, ...G.players['0'].bench].find((c) => c?.cardId === 'hero_dynamo')!;
    expect(dynamo.statuses.find((s) => s.id === 'casting')).toBeUndefined();
    expect(G.players['1'].active!.statuses.some((s) => s.id === 'stun')).toBe(true);
    // The channel mechanic stays in the engine, unused by heroes.
    addStatus(G, dynamo, 'casting', 3, 3);
    const casting = dynamo.statuses.find((s) => s.id === 'casting');
    expect(casting?.value).toBe(3);
    expect(casting?.duration).toBe(3);
    // Locked out: cannot make basic attacks while channeling.
    expect(effectiveAtk(dynamo)).toBe(0);
  });

  it('a casting pulse (a channel set directly) hits the whole enemy board at end of turn', () => {
    const G = freshG('hero_dynamo');
    const dynamo = G.players['0'].active!;
    addStatus(G, dynamo, 'casting', 3, 3);
    const enemies = [G.players['1'].active, ...G.players['1'].bench].filter(Boolean) as CardInstance[];
    for (const e of enemies) { e.hpMax = 50; e.hp = 50; }
    tickCastingPulses(G, G.players['0']);
    enemies.forEach((e) => expect(e.hp).toBe(50 - 3));
  });
});
