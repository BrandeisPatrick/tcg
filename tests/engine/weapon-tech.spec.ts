import { describe, it, expect } from 'vitest';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { fireEquipmentTriggers } from '@/engine/equipmentDispatch';
import { addStatus } from '@/engine/statusOps';
import { HEROES } from '@/cards';
import '@/abilities'; // registers the equipment dispatcher

function freshGame(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  const G = JSON.parse(JSON.stringify(setup)) as GameState;
  for (const pid of ['0', '1'] as PlayerID[]) {
    const h = HEROES[0];
    G.players[pid].active = {
      iid: `hero-${pid}`, cardId: h.id, ownerId: pid, zone: 'active', slot: 0,
      hp: 30, hpMax: 30, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false,
    };
  }
  return G;
}

function attach(G: GameState, bearer: CardInstance, cardId: string): CardInstance {
  const eq: CardInstance = {
    iid: `eq-${cardId}`, cardId, ownerId: bearer.ownerId, zone: 'equipment',
    attachedTo: bearer.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  (bearer.attached ??= []).push(eq);
  return eq;
}

function benchHero(G: GameState, pid: PlayerID, slot: 1 | 2 | 3): CardInstance {
  const h = HEROES[1];
  const c: CardInstance = {
    iid: `bench-${pid}-${slot}`, cardId: h.id, ownerId: pid, zone: 'bench', slot,
    hp: 10, hpMax: 10, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  G.players[pid].bench[slot - 1] = c;
  return c;
}

describe('Toxic Bullets', () => {
  it('attacks apply Bleed, which stacks up to 3', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(G, hero, 'toxic_bullets');

    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(enemy.statuses.find((s) => s.id === 'bleed')?.value).toBe(1);
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(enemy.statuses.find((s) => s.id === 'bleed')?.value).toBe(3); // capped
  });
});

describe('Tesla Bullets', () => {
  it('chains 1 damage to an enemy bench hero on attack', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    const bench = benchHero(G, '1', 1);
    attach(G, hero, 'tesla_bullets');

    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(bench.hp).toBe(9); // 10 - 1 chain
  });

  it('no-ops when there is no enemy bench hero', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(G, hero, 'tesla_bullets');
    expect(() => fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy)).not.toThrow();
  });
});

describe('Suppressor', () => {
  it('applies Weapon Power −1 (2 turns) on the bearer’s skill damage', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(G, hero, 'suppressor');

    fireEquipmentTriggers(G, hero, 'onBearerSkillDamage', { movingPlayer: '0' }, enemy);
    const wpd = enemy.statuses.find((s) => s.id === 'weapon_power_down');
    expect(wpd?.value).toBe(1);
    expect(wpd?.duration).toBe(2);
  });
});

describe('Reactive Barrier', () => {
  it('grants Shield 3 when the bearer suffers CC', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    attach(G, hero, 'reactive_barrier');
    // Applying a stun fires onBearerCCSuffered via statusOps.
    addStatus(G, hero, 'stun', 1, 2);
    expect(hero.statuses.find((s) => s.id === 'shield')?.value).toBe(3);
  });
});
