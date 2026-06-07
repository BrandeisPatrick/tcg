import { describe, it, expect } from 'vitest';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { fireEquipmentTriggers } from '@/engine/equipmentDispatch';
import { EQUIPMENT_BY_ID } from '@/cards/equipment';
import { ABILITIES_BY_ID } from '@/abilities';
import { HEROES } from '@/cards';

function freshGame(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  const G = JSON.parse(JSON.stringify(setup)) as GameState;
  // setup leaves heroes in deck/hand (active is null); stand one up per side.
  for (const pid of ['0', '1'] as PlayerID[]) {
    const h = HEROES[0];
    G.players[pid].active = {
      iid: `hero-${pid}`, cardId: h.id, ownerId: pid, zone: 'active', slot: 0,
      hp: h.hp, hpMax: h.hp, atkMod: 0, spiritMod: 0,
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

describe('Mystic Burst family', () => {
  it('Mystic Burst deals 2 spirit to the enemy active on skill use', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    const hp0 = enemy.hp;
    attach(G, hero, 'mystic_burst');

    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: '0' });
    expect(enemy.hp).toBe(hp0 - 2);
  });

  it('Improved Burst deals 3 spirit (tier-up)', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    const hp0 = enemy.hp;
    attach(G, hero, 'improved_burst');

    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: '0' });
    expect(enemy.hp).toBe(hp0 - 3);
  });

  it('respects a spirit shield on the enemy active', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    const hp0 = enemy.hp;
    enemy.statuses.push({ id: 'shield', value: 2, duration: 999 });
    attach(G, hero, 'mystic_burst');

    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: '0' });
    // 2 dmg fully absorbed by Shield 2 → no HP loss.
    expect(enemy.hp).toBe(hp0);
  });

  it('does not fire when the enemy active is a corpse', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    enemy.respawnTurnsLeft = 2;
    const hp0 = enemy.hp;
    attach(G, hero, 'mystic_burst');

    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: '0' });
    expect(enemy.hp).toBe(hp0);
  });

  it('cards expose the proposed flat magnitudes', () => {
    expect(EQUIPMENT_BY_ID['mystic_burst'].cost).toBe(3);
    expect(EQUIPMENT_BY_ID['improved_burst'].cost).toBe(5);
    expect(ABILITIES_BY_ID['eff_mystic_burst_proc'].base).toBe(2);
    expect(ABILITIES_BY_ID['eff_improved_burst_proc'].base).toBe(3);
  });
});
