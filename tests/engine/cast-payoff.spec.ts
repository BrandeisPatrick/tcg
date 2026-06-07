import { describe, it, expect } from 'vitest';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { fireEquipmentTriggers } from '@/engine/equipmentDispatch';
import { resolveAttackPhase } from '@/engine/combat';
import { damageUnit } from '@/engine/damage';
import { tickStartOfTurn } from '@/engine/statusOps';
import { withCast } from '@/engine/castContext';
import { effectiveAtk } from '@/engine/util';
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
  G.turnNumber = 2; // past the turn-1 no-attack guard
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

describe('Surge of Power', () => {
  it('grants +2 Bullet Power for the turn on skill use', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    attach(G, hero, 'surge_of_power');
    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: '0' });
    const wp = hero.statuses.find((s) => s.id === 'weapon_power');
    expect(wp?.value).toBe(2);
    expect(wp?.duration).toBe(1);
  });
});

describe("Diviner's Kevlar", () => {
  it('grants Shield 4 when the bearer casts their ultimate', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    attach(G, hero, 'diviners_kevlar');
    fireEquipmentTriggers(G, hero, 'onBearerUltCast', { movingPlayer: '0' });
    expect(hero.statuses.find((s) => s.id === 'shield')?.value).toBe(4);
  });

  it('does NOT trigger on a plain skill use', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    attach(G, hero, 'diviners_kevlar');
    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: '0' });
    expect(hero.statuses.find((s) => s.id === 'shield')).toBeUndefined();
  });
});

describe('Quicksilver Reload', () => {
  it('skill use sets the extra-attack flag', () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    attach(G, hero, 'quicksilver_reload');
    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: '0' });
    expect(hero.extraHalfAttack).toBe(true);
  });

  it('adds a half-power second swing in the attack phase, then clears the flag', () => {
    const G = freshGame();
    const attacker = G.players['0'].active!;
    const defender = G.players['1'].active!;
    const dmg = effectiveAtk(attacker);
    const expected = dmg + Math.floor(dmg / 2);
    attacker.extraHalfAttack = true;

    const hp0 = defender.hp;
    resolveAttackPhase(G, '0');
    expect(defender.hp).toBe(hp0 - expected);
    expect(attacker.extraHalfAttack).toBe(false);
  });

  it('a normal swing (no flag) deals only base damage', () => {
    const G = freshGame();
    const attacker = G.players['0'].active!;
    const defender = G.players['1'].active!;
    const dmg = effectiveAtk(attacker);
    const hp0 = defender.hp;
    resolveAttackPhase(G, '0');
    expect(defender.hp).toBe(hp0 - dmg);
  });
});

describe('Mystic Reverb', () => {
  it("echoes half the skill's damage to the same target on its next turn", () => {
    const G = freshGame();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(G, hero, 'mystic_reverb');

    // Bearer's skill deals 6 spirit → applies Reverb 3 (dur 1) to the enemy.
    withCast(hero, 'skill', () => { damageUnit(G, enemy, 6, 'spirit'); });
    expect(enemy.hp).toBe(24); // 30 - 6, no echo yet
    expect(enemy.statuses.find((s) => s.id === 'reverb')?.value).toBe(3);

    // Enemy's next turn start → Reverb detonates for 3, then expires.
    tickStartOfTurn(G, G.players['1']);
    expect(enemy.hp).toBe(21); // 24 - 3 echo
    expect(enemy.statuses.find((s) => s.id === 'reverb')).toBeUndefined();
  });
});
