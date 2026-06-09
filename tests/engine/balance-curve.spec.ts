import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { HEROES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { grantExp } from '@/engine/expSystem';
import { effectiveAtk } from '@/engine/util';
import { withCast } from '@/engine/castContext';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';

let seq = 0;
function makeHero(cardId: string, ownerId: PlayerID, zone: CardInstance['zone'], slot: 0 | 1 | 2 | 3): CardInstance {
  const d = CARDS_BY_ID[cardId] as any;
  return {
    iid: `h${seq++}`, cardId, ownerId, zone, slot,
    hp: d.hp, hpMax: d.hp, atkMod: 0, spiritMod: 0,
    statuses: [], attached: [], exhausted: false, skillUsedThisTurn: false,
    exp: 0, level: 1 as const,
  };
}
function freshG(): GameState {
  return JSON.parse(JSON.stringify(
    (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } }),
  )) as GameState;
}

describe('leveling — universal stat growth', () => {
  it('grants +1 HP / +1 BP / +1 Spirit per level (≈ +3 each at Lv4)', () => {
    const G = freshG();
    const c = makeHero('hero_lady_geist', '0', 'active', 0);
    grantExp(G, c, 21); // cumulative cap → Lv4 (5 + 7 + 9)
    expect(c.level).toBe(4);
    expect(c.atkMod).toBe(3);
    expect(c.spiritMod).toBe(3); // the V1 change — was 0 before
    expect(c.hpMax).toBe((CARDS_BY_ID['hero_lady_geist'] as any).hp + 3);
  });
});

describe('skills scale with Spirit into the late game', () => {
  it("Lady Geist's skill hits harder at Lv4 than Lv1", () => {
    const G = freshG();
    const caster = makeHero('hero_lady_geist', '0', 'active', 0);
    const dummy = makeHero('hero_abrams', '1', 'active', 0);
    dummy.hp = dummy.hpMax = 99;
    const skill = getAbility('skill_lady_geist')!;

    const before1 = dummy.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target: dummy });
    const lv1Dmg = before1 - dummy.hp; // base 3

    grantExp(G, caster, 21); // → Lv4, +3 Spirit (5 + 7 + 9)
    const before4 = dummy.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster, target: dummy });
    const lv4Dmg = before4 - dummy.hp; // 3 + 3

    expect(lv1Dmg).toBe(3);
    expect(lv4Dmg).toBeGreaterThan(lv1Dmg);
    expect(lv4Dmg).toBe(6);
  });
});

describe('any hero can be built into a spirit caster (no role cap)', () => {
  it("a Spirit-built Abrams' ultimate out-damages a base one", () => {
    const G = freshG();
    const abrams = makeHero('hero_abrams', '0', 'active', 0);
    const enemy = makeHero('hero_shiv', '1', 'active', 0);
    enemy.hp = enemy.hpMax = 99;
    G.players['1'].active = enemy;
    G.players['1'].bench = [null, null, null];
    const ult = getAbility('eff_ult_abrams')!;

    // base Abrams (0 Spirit)
    const b0 = enemy.hp;
    withCast(abrams, 'ult', () => ult.run(G, { movingPlayer: '0' }, { source: abrams }));
    const baseDmg = b0 - enemy.hp;

    // spirit-built Abrams (+5 Spirit from items/levels)
    abrams.spiritMod = 5;
    const b1 = enemy.hp;
    withCast(abrams, 'ult', () => ult.run(G, { movingPlayer: '0' }, { source: abrams }));
    const spiritDmg = b1 - enemy.hp;

    expect(baseDmg).toBe(4);
    expect(spiritDmg).toBe(9); // 4 + 5 Spirit — the cap is gone
  });
});

describe('early survivability — no Lv1 one-shots', () => {
  it('no hero can kill a fresh 4-HP hero with a single basic attack at Lv1', () => {
    for (const h of HEROES) {
      const c = makeHero(h.id, '0', 'active', 0);
      expect(effectiveAtk(c)).toBeLessThan(4);
    }
  });

  it("a Lv1 caster's skill alone cannot kill a fresh squishy (4 HP)", () => {
    const G = freshG();
    const caster = makeHero('hero_lady_geist', '0', 'active', 0); // strongest base skill (3, Life Drain)
    const dummy = makeHero('hero_kelvin', '1', 'active', 0); // 4 HP
    const before = dummy.hp;
    getAbility('skill_lady_geist')!.run(G, { movingPlayer: '0' }, { source: caster, target: dummy });
    expect(before - dummy.hp).toBeLessThan(dummy.hpMax); // survives the cast
    expect(dummy.hp).toBeGreaterThan(0);
  });
});
