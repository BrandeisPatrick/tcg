import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { HEROES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { grantExp } from '@/engine/expSystem';
import { effectiveAtk } from '@/engine/query';
import { withCast } from '@/engine/castContext';
import type { GameState, CardInstance, HeroCard, PlayerID } from '@/engine/types';

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

describe("leveling — each hero's own growth", () => {
  it("each level adds the hero's growth (Lady Geist: +2 Spirit a level, +6 at Lv4, no Attack or HP)", () => {
    const G = freshG();
    const c = makeHero('hero_lady_geist', '0', 'active', 0);
    const data = CARDS_BY_ID['hero_lady_geist'] as HeroCard;
    expect(data.growth).toEqual({ atk: 0, hp: 0, spirit: 2 });
    grantExp(G, c, 21); // cumulative cap → Lv4 (5 + 7 + 9)
    expect(c.level).toBe(4);
    expect(c.atkMod).toBe(0);
    expect(c.spiritMod).toBe(6);
    expect(c.hpMax).toBe(data.hp);
  });
});

describe('skills scale with Spirit into the late game', () => {
  it("Lady Geist's skill hits harder at Lv4 than Lv1", () => {
    const G = freshG();
    const caster = makeHero('hero_lady_geist', '0', 'active', 0);
    const dummy = makeHero('hero_abrams', '1', 'active', 0);
    dummy.hp = dummy.hpMax = 99;
    G.players['1'].active = dummy;
    G.players['1'].bench = [null, null, null];
    const skill = getAbility('skill_lady_geist')!;

    const before1 = dummy.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster });
    const lv1Dmg = before1 - dummy.hp; // {sp:1}, Spirit 0

    grantExp(G, caster, 21); // → Lv4, +6 Spirit (5 + 7 + 9)
    const before4 = dummy.hp;
    skill.run(G, { movingPlayer: '0' }, { source: caster });
    const lv4Dmg = before4 - dummy.hp; // 1 + 6

    expect(lv1Dmg).toBe(1);
    expect(lv4Dmg).toBeGreaterThan(lv1Dmg);
    expect(lv4Dmg).toBe(7);
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
    withCast(abrams, 'ult', () => ult.run(G, { movingPlayer: '0' }, { source: abrams, target: enemy }));
    const baseDmg = b0 - enemy.hp;

    // spirit-built Abrams (+5 Spirit from items/levels)
    abrams.spiritMod = 5;
    const b1 = enemy.hp;
    withCast(abrams, 'ult', () => ult.run(G, { movingPlayer: '0' }, { source: abrams, target: enemy }));
    const spiritDmg = b1 - enemy.hp;

    expect(baseDmg).toBe(6);
    expect(spiritDmg).toBe(11); // 6 + 5 Spirit — the cap is gone
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
    const caster = makeHero('hero_yamato', '0', 'active', 0); // strongest base damage skill ({sp:2}, Flying Slash)
    const dummy = makeHero('hero_seven', '1', 'active', 0); // 4 HP
    G.players['1'].active = dummy;
    G.players['1'].bench = [null, null, null];
    expect(dummy.hpMax).toBe(4);
    const before = dummy.hp;
    getAbility('skill_yamato')!.run(G, { movingPlayer: '0' }, { source: caster, target: dummy });
    expect(before - dummy.hp).toBe(2);
    expect(before - dummy.hp).toBeLessThan(dummy.hpMax); // survives the cast
    expect(dummy.hp).toBeGreaterThan(0);
  });
});
