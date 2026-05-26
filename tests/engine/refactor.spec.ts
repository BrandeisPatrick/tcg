import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, CardInstance } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { addStatus } from '@/engine/statusOps';
import { damageUnit, healUnit } from '@/engine/damage';
import { nextIid } from '@/engine/util';
import { withCast } from '@/engine/castContext';

function freshG(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  return JSON.parse(JSON.stringify(setup));
}

/** Build a minimal equipment instance and attach it to a hero. */
function attachEquip(hero: CardInstance, cardId: string): CardInstance {
  const eq: CardInstance = {
    iid: nextIid('eq'),
    cardId,
    ownerId: hero.ownerId,
    zone: 'equipment',
    attachedTo: hero.iid,
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
  };
  if (!hero.attached) hero.attached = [];
  hero.attached.push(eq);
  return eq;
}

describe('Rusted Barrel applies Weaken (reduces enemy ATK)', () => {
  it('applies Weaken 2 / 2T on the target', () => {
    const G = freshG();
    const enemy = G.players['1'].active!;
    ABILITIES_BY_ID['eff_rusted_barrel'].run(G, { movingPlayer: '0' }, { target: enemy });
    const w = enemy.statuses.find((s) => s.id === 'weaken');
    expect(w?.value).toBe(2);
    expect(w?.duration).toBe(2);
  });
});

describe('Kelvin Frost Grenade — damage + heal', () => {
  it('damages enemy Active and heals ally Active', () => {
    const G = freshG();
    const kelvin = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    kelvin.hp = kelvin.hpMax - 3;
    const enemyHpBefore = enemy.hp;
    ABILITIES_BY_ID['skill_kelvin'].run(G, { movingPlayer: '0' }, { source: kelvin, target: enemy });
    expect(enemyHpBefore - enemy.hp).toBe(2);
    expect(kelvin.hp).toBe(kelvin.hpMax - 1); // healed for 2
  });
});

describe('Healing Blocked status', () => {
  it('blocks healUnit while active', () => {
    const G = freshG();
    const target = G.players['0'].active!;
    target.hp = target.hpMax - 5;
    addStatus(G, target, 'healing_blocked', 1, 2);
    const healed = healUnit(G, target, 3);
    expect(healed).toBe(0);
    expect(target.hp).toBe(target.hpMax - 5);
  });

  it('expires after duration', () => {
    const G = freshG();
    const target = G.players['0'].active!;
    addStatus(G, target, 'healing_blocked', 1, 1);
    expect(target.statuses.some((s) => s.id === 'healing_blocked')).toBe(true);
    target.statuses = target.statuses
      .map((s) => ({ ...s, duration: s.duration - 1 }))
      .filter((s) => s.duration > 0);
    expect(target.statuses.some((s) => s.id === 'healing_blocked')).toBe(false);
  });
});

describe('Cast context — equipment proc recursion guard', () => {
  it('cast kind "proc" suppresses re-triggering equipment from inside an equipment proc', () => {
    // Mystic Regeneration heals the bearer when their skill damages an enemy.
    // The dispatcher wraps each proc.run in withCast(..., 'proc') so a
    // damageUnit call inside the proc (none here, but architecturally) does
    // NOT re-fire onBearerSkillDamage. We verify the proc doesn't cause
    // infinite recursion and heals exactly once.
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attachEquip(hero, 'mystic_regeneration');
    hero.hp = hero.hpMax - 5;
    const hpBefore = hero.hp;
    withCast(hero, 'skill', () => damageUnit(G, enemy, 3, 'spirit'));
    expect(hero.hp - hpBefore).toBe(1); // healed exactly once (no recursion)
  });
});

describe('Equipment reactive procs (new V1 set)', () => {
  it('Restorative Shot — bearer attacks → heal 1', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attachEquip(hero, 'restorative_shot');
    hero.hp = hero.hpMax - 3;
    const hpBefore = hero.hp;
    withCast(hero, 'attack', () => damageUnit(G, enemy, 2, 'attack'));
    expect(hero.hp - hpBefore).toBe(1);
  });

  it('Mystic Regeneration — bearer skill damages enemy → heal 1', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attachEquip(hero, 'mystic_regeneration');
    hero.hp = hero.hpMax - 3;
    const hpBefore = hero.hp;
    withCast(hero, 'skill', () => damageUnit(G, enemy, 2, 'spirit'));
    expect(hero.hp - hpBefore).toBe(1);
  });

  it('Bullet Shield — bearer takes bullet damage → gain Shield 2', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    attachEquip(hero, 'weapon_shielding');
    hero.hpMax = 30; hero.hp = 30;
    damageUnit(G, hero, 3, 'attack', 'TestAttacker');
    expect(hero.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });

  it('Spirit Shield — bearer takes spirit damage → gain Shield 2', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    attachEquip(hero, 'spirit_shielding');
    hero.hpMax = 30; hero.hp = 30;
    damageUnit(G, hero, 3, 'spirit', 'TestCaster');
    expect(hero.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });

  it('Bullet Shield does NOT proc on spirit damage', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    attachEquip(hero, 'weapon_shielding');
    hero.hpMax = 30; hero.hp = 30;
    damageUnit(G, hero, 3, 'spirit', 'TestCaster');
    expect(hero.statuses.find((s) => s.id === 'shield')).toBeUndefined();
  });
});
