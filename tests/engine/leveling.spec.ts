import { describe, it, expect } from 'vitest';
import type { GameState, CardInstance, HeroCard } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { grantExp } from '@/engine/expSystem';
import { LEVEL_THRESHOLDS } from '@/engine/constants';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/death';
import { withCast } from '@/engine/castContext';
import { INVALID, perform } from '@/engine/engine';
import { findWornItem } from '@/engine/query';
import { freshReadyGame, giveCard, giveItem, playItem, playNew } from './_helpers';

function freshG(): GameState {
  return freshReadyGame();
}

/** What a level adds to `hero`: its card's `growth`. */
function growthOf(hero: CardInstance): HeroCard['growth'] {
  return (CARDS_BY_ID[hero.cardId] as HeroCard).growth;
}

describe('hero leveling: grantExp', () => {
  it('starts at Lv1, 0 exp', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    expect(h.level).toBe(1);
    expect(h.exp).toBe(0);
  });

  it('advances Lv1 → Lv2 at 5 exp (overflow rolls forward)', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    expect(grantExp(G, h, 6)).toBe(1);
    expect(h.level).toBe(2);
    expect(h.exp).toBe(1); // 6 - 5 = 1 spilling into Lv2
  });

  it('Lv2 → Lv3 at +7 exp, Lv3 → Lv4 at +9 exp (per-level thresholds)', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    grantExp(G, h, 5); // → Lv2, 0 exp
    expect(h.level).toBe(2);
    grantExp(G, h, 6);
    expect(h.level).toBe(2);
    expect(h.exp).toBe(6);
    grantExp(G, h, 1);
    expect(h.level).toBe(3);
    expect(h.exp).toBe(0);
    grantExp(G, h, 8);
    expect(h.level).toBe(3);
    grantExp(G, h, 1);
    expect(h.level).toBe(4);
  });

  it('caps at Lv4 — additional exp is dropped, exp stays 0', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    grantExp(G, h, 100);
    expect(h.level).toBe(4);
    expect(h.exp).toBe(0);
    grantExp(G, h, 50);
    expect(h.level).toBe(4);
    expect(h.exp).toBe(0);
  });

  it('cannot multi-step in a single grant past max', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    grantExp(G, h, 21); // exactly enough for Lv4 (5 + 7 + 9)
    expect(h.level).toBe(4);
    expect(h.exp).toBe(0);
  });

  it('rejects exp on corpses', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    h.respawnTurnsLeft = 3;
    expect(grantExp(G, h, 5)).toBe(0);
    // level stays at the pre-corpse value (whatever it was when killed)
    expect(h.exp ?? 0).toBe(0);
  });

  it('rejects on non-heroes (e.g., equipment cardId injection)', () => {
    const G = freshG();
    const fake: CardInstance = {
      iid: 'x', cardId: 'extended_magazine', ownerId: '0', zone: 'equipment',
      hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false,
    };
    expect(grantExp(G, fake, 5)).toBe(0);
  });
});

describe('hero leveling triggers', () => {
  it('equipping an item — playing it from the hand — grants +1 exp to the bearer, once per item id; holding it grants nothing', () => {
    const G = freshReadyGame();
    const h = G.players['0'].active!;
    const before = h.exp ?? 0;
    G.players['0'].souls = 10;
    const held = giveCard(G, '0', 'extended_magazine');
    expect((h.exp ?? 0) - before).toBe(0);
    playItem(G, '0', held, h);
    expect((h.exp ?? 0) - before).toBe(1);
    // Evolved into Titanic Magazine (a new item: +1), then a second Extended
    // Magazine on the same hero pays nothing more: that item's first equip is paid.
    playNew(G, '0', 'titanic_magazine', h);
    expect((h.exp ?? 0) - before).toBe(2);
    playNew(G, '0', 'extended_magazine', h);
    expect((h.exp ?? 0) - before).toBe(2);
  });

  it('killing blow grants +2 exp to the killer hero via cast context', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    enemy.hp = 1;
    withCast(hero, 'attack', () => damageUnit(G, enemy, 5, 'attack'));
    // killer started at Lv1 with 0 exp; kill grants +2.
    expect(hero.exp).toBe(2);
    expect(hero.level).toBe(1);
  });

  it('overkill damage past 0 still grants kill exp once', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    enemy.hp = 1;
    withCast(hero, 'skill', () => damageUnit(G, enemy, 50, 'spirit'));
    expect(hero.exp).toBe(2);
  });

  it('death PRESERVES level + exp (rank persists through respawn)', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    grantExp(G, target, 7); // Lv2 (cost 5), 2 exp
    expect(target.level).toBe(2);
    expect(target.exp).toBe(2);
    target.hp = 1;
    const hero = G.players['0'].active!;
    withCast(hero, 'attack', () => damageUnit(G, target, 5, 'attack'));
    reapDead(G, G.players['1']);
    expect(target.respawnTurnsLeft).toBeGreaterThan(0);
    expect(target.level).toBe(2); // level persists
    expect(target.exp).toBe(2);   // exp persists
  });
});

describe('LEVEL_THRESHOLDS exposed correctly', () => {
  it('matches the spec: 5 → 7 → 9 exp per level', () => {
    expect(LEVEL_THRESHOLDS).toEqual([5, 7, 9]);
  });
});

describe('equipment persists through death', () => {
  it('attached equipment stays on the bearer when they die and respawn', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    // Put the item on directly: its +1 Bullet Power goes onto the bearer.
    const eq = giveItem(G, target, 'extended_magazine');
    expect(target.atkMod).toBe(1);
    target.hp = 1;
    const hero = G.players['0'].active!;
    withCast(hero, 'attack', () => damageUnit(G, target, 5, 'attack'));
    reapDead(G, G.players['1']);
    expect(target.respawnTurnsLeft).toBeGreaterThan(0);
    // Equipment is still on the bearer: nothing left the board with the fall.
    expect(target.attached?.length).toBe(1);
    expect(target.attached?.[0].cardId).toBe('extended_magazine');
    expect(findWornItem(G, eq.iid, '1')?.bearer).toBe(target);
    // atkMod persists since the equipment is still there.
    expect(target.atkMod).toBe(1);
  });
});

describe("level-up stat bonuses: each level adds the hero's own growth", () => {
  it('Lv1 → Lv2 adds its growth (Haze: +3 Attack, +1 HP/hpMax, +0 Spirit)', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    expect(growthOf(h)).toEqual({ atk: 3, hp: 1, spirit: 0 });
    const atk0 = h.atkMod;
    const spi0 = h.spiritMod;
    const hpMax0 = h.hpMax;
    const hp0 = h.hp;
    grantExp(G, h, 5); // Lv1 → Lv2
    expect(h.level).toBe(2);
    expect(h.atkMod - atk0).toBe(3);
    expect(h.spiritMod - spi0).toBe(0);
    expect(h.hpMax - hpMax0).toBe(1);
    expect(h.hp - hp0).toBe(1);  // healed too
  });

  it('Lv4 cap = 3 × its growth cumulative (Haze: +9 Attack / +3 HP / +0 Spirit)', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    const atk0 = h.atkMod;
    const spi0 = h.spiritMod;
    const hpMax0 = h.hpMax;
    grantExp(G, h, 21); // all the way to Lv4 (5 + 7 + 9)
    expect(h.level).toBe(4);
    expect(h.atkMod - atk0).toBe(9);
    expect(h.spiritMod - spi0).toBe(0);
    expect(h.hpMax - hpMax0).toBe(3);
  });

  it("level-up grants a caster's Spirit growth every level (Seven: +3 a level — Spirit is a real build axis)", () => {
    const G = freshG();
    const h = G.players['1'].bench.find((b) => b?.cardId === 'hero_seven')!;
    expect(growthOf(h).spirit).toBe(3);
    const spi0 = h.spiritMod;
    grantExp(G, h, 5);
    expect(h.spiritMod - spi0).toBe(3); // L2
    grantExp(G, h, 7);
    expect(h.spiritMod - spi0).toBe(6); // L3
    grantExp(G, h, 9);
    expect(h.spiritMod - spi0).toBe(9); // L4
  });

  it('multi-step single grant applies the growth for every step jumped', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    const atk0 = h.atkMod;
    grantExp(G, h, 12); // Lv1 → Lv3 (5 + 7 = 12 exp consumed)
    expect(h.level).toBe(3);
    expect(h.atkMod - atk0).toBe(2 * 3);
  });

  it('death PRESERVES hpMax + atkMod gained from leveling', () => {
    const G = freshG();
    const target = G.players['1'].active!; // Abrams: +1 Attack, +2 HP a level
    expect(growthOf(target)).toEqual({ atk: 1, hp: 2, spirit: 0 });
    const baseHpMax = target.hpMax;
    grantExp(G, target, 21); // → Lv4, +3 atk / +6 hpMax / +0 spirit
    expect(target.hpMax).toBe(baseHpMax + 6);
    expect(target.atkMod).toBe(3);
    expect(target.spiritMod).toBe(0);
    target.hp = 1;
    const hero = G.players['0'].active!;
    withCast(hero, 'attack', () => damageUnit(G, target, 5, 'attack'));
    reapDead(G, G.players['1']);
    expect(target.level).toBe(4);             // level persists
    expect(target.hpMax).toBe(baseHpMax + 6); // hpMax persists
    expect(target.atkMod).toBe(3);            // atkMod persists
    expect(target.spiritMod).toBe(0);         // spiritMod persists
  });
});
