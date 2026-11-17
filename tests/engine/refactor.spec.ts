import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, CardInstance } from '@/engine/types';
import { addStatus } from '@/engine/statusOps';
import { damageUnit, healUnit } from '@/engine/damage';
import { withCast } from '@/engine/castContext';
import { freshReadyGame, nextTestIid } from './_helpers';

function freshG(): GameState {
  return freshReadyGame();
}

/** Build a minimal equipment instance and attach it to a hero. */
function attachEquip(hero: CardInstance, cardId: string): CardInstance {
  const eq: CardInstance = {
    iid: nextTestIid('eq'),
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
  it('applies Bullet Power −1 for 2 turns on the target (Patrick, 2026-11-15: the cheap one)', () => {
    const G = freshG();
    const enemy = G.players['1'].active!;
    ABILITIES_BY_ID['eff_rusted_barrel'].run(G, { movingPlayer: '0' }, { target: enemy });
    const w = enemy.statuses.find((s) => s.id === 'weapon_power_down');
    expect(w?.value).toBe(1);
    expect(w?.duration).toBe(2);
  });

  it('costs 1 soul, its tier\'s price since prices halved (it printed its own 1 under tier 1\'s 2 before) — in the hand, on the card and in net worth', async () => {
    const { itemPrice } = await import('@/engine/query');
    const { playCost } = await import('@/engine/legality');
    const { PRICE } = await import('@/engine/constants');
    const { itemCard } = await import('@/cards');
    expect(itemCard('rusted_barrel')).toMatchObject({ tier: 1, text: 'Apply Bullet Power −1 on enemy Active for 2 turns.' });
    expect(itemCard('rusted_barrel')!.price).toBeUndefined();
    expect(PRICE[1]).toBe(1);
    expect(itemPrice('rusted_barrel')).toBe(1);
    expect(playCost(undefined, 'rusted_barrel')).toBe(1);
    // Every other tier-1 card still lists at the tier's price.
    expect(itemPrice('healing_rite')).toBe(PRICE[1]);
  });
});

describe('Kelvin Frost Grenade — damage + heal', () => {
  it('damages the enemy Active and heals Kelvin the same (Patrick, 2026-11-17)', () => {
    const G = freshG();
    const kelvin = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    kelvin.hpMax = 10; kelvin.hp = 1;
    const enemyHpBefore = enemy.hp;
    ABILITIES_BY_ID['skill_kelvin'].run(G, { movingPlayer: '0' }, { source: kelvin, target: enemy });
    expect(enemyHpBefore - enemy.hp).toBe(3); // {sp:3}: 3 at Spirit 0
    expect(kelvin.hp).toBe(1 + 3); // and Kelvin heals the same 3
  });
});

describe('Healing Blocked status', () => {
  it('blocks healUnit while active', () => {
    const G = freshG();
    const target = G.players['0'].active!;
    target.hp = target.hpMax - 5;
    addStatus(G, target, 'healing_boost_down', 1, 2);
    const healed = healUnit(G, target, 3);
    expect(healed).toBe(0);
    expect(target.hp).toBe(target.hpMax - 5);
  });

  it('expires after duration', () => {
    const G = freshG();
    const target = G.players['0'].active!;
    addStatus(G, target, 'healing_boost_down', 1, 1);
    expect(target.statuses.some((s) => s.id === 'healing_boost_down')).toBe(true);
    target.statuses = target.statuses
      .map((s) => ({ ...s, duration: s.duration - 1 }))
      .filter((s) => s.duration > 0);
    expect(target.statuses.some((s) => s.id === 'healing_boost_down')).toBe(false);
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
    hero.hp = Math.max(1, hero.hpMax - 5); // wounded but alive (heroes are 5 HP now)
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
