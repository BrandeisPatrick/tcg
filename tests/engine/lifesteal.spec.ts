import { describe, it, expect } from 'vitest';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { fireEquipmentTriggers } from '@/engine/equipmentDispatch';
import { EQUIPMENT_BY_ID } from '@/cards/equipment';
import { HEROES } from '@/cards';

function freshGame(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  const G = JSON.parse(JSON.stringify(setup)) as GameState;
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

describe('Lifesteal family', () => {
  it('Bullet Lifesteal heals 2 after the bearer attacks', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    hero.hp = 3; // hurt so heal shows
    attach(G, hero, 'bullet_lifesteal');
    const enemy = G.players['1'].active!;

    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(hero.hp).toBe(5);
  });

  it('Spirit Lifesteal heals 2 after the bearer’s skill damages', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    hero.hp = 3;
    attach(G, hero, 'spirit_lifesteal');
    const enemy = G.players['1'].active!;

    fireEquipmentTriggers(G, hero, 'onBearerSkillDamage', { movingPlayer: '0' }, enemy);
    expect(hero.hp).toBe(5);
  });

  it('Leech heals off BOTH bullet attacks and skill damage', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    hero.hp = 1;
    attach(G, hero, 'leech');
    const enemy = G.players['1'].active!;

    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(hero.hp).toBe(3); // +2 from bullet lifesteal
    fireEquipmentTriggers(G, hero, 'onBearerSkillDamage', { movingPlayer: '0' }, enemy);
    expect(hero.hp).toBe(5); // +2 from spirit lifesteal
  });

  it('does not overheal past max HP', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    hero.hp = hero.hpMax; // full
    attach(G, hero, 'bullet_lifesteal');
    const enemy = G.players['1'].active!;

    fireEquipmentTriggers(G, hero, 'onAttack', { movingPlayer: '0' }, enemy);
    expect(hero.hp).toBe(hero.hpMax);
  });

  it('cards carry the expected tier/cost', () => {
    expect(EQUIPMENT_BY_ID['bullet_lifesteal'].tier).toBe(2);
    expect(EQUIPMENT_BY_ID['spirit_lifesteal'].tier).toBe(2);
    expect(EQUIPMENT_BY_ID['leech'].tier).toBe(4);
    expect(EQUIPMENT_BY_ID['leech'].abilities).toEqual(['eff_bullet_lifesteal', 'eff_spirit_lifesteal']);
  });
});
