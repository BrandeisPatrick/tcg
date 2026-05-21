import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, CardInstance } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { grantExp, LEVEL_THRESHOLDS } from '@/engine/expSystem';
import { damageUnit, reapDead } from '@/engine/damage';
import { withCast } from '@/engine/castContext';
import { nextIid } from '@/engine/util';

function freshG(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  return JSON.parse(JSON.stringify(setup));
}

describe('hero leveling: grantExp', () => {
  it('starts at Lv1, 0 exp', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    expect(h.level).toBe(1);
    expect(h.exp).toBe(0);
  });

  it('advances Lv1 → Lv2 at 3 exp (overflow rolls forward)', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    expect(grantExp(G, h, 4)).toBe(1);
    expect(h.level).toBe(2);
    expect(h.exp).toBe(1); // 4 - 3 = 1 spilling into Lv2
  });

  it('Lv2 → Lv3 at +6 exp, Lv3 → Lv4 at +9 exp (per-level thresholds)', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    grantExp(G, h, 3); // → Lv2, 0 exp
    expect(h.level).toBe(2);
    grantExp(G, h, 5);
    expect(h.level).toBe(2);
    expect(h.exp).toBe(5);
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
    grantExp(G, h, 18); // exactly enough for Lv4
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
  it('equipping an item grants +1 exp to the bearer', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    const before = h.exp ?? 0;
    // Hand-build an equipment instance and route it through playCard so
    // applyOnPlay fires.
    const mag = G.players['0'].deck.find((c) => c.cardId === 'extended_magazine');
    if (!mag) {
      // Aggro starter has extended_magazine in deck; fall back gracefully if not.
      G.players['0'].hand.push({
        iid: 'z', cardId: 'extended_magazine', ownerId: '0', zone: 'hand',
        hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
        statuses: [], exhausted: false, skillUsedThisTurn: false,
      });
    } else {
      mag.zone = 'hand';
      G.players['0'].hand.push(mag);
      G.players['0'].deck = G.players['0'].deck.filter((c) => c !== mag);
    }
    G.players['0'].souls = 5;
    const handCard = G.players['0'].hand[G.players['0'].hand.length - 1];
    (DeadlockGame as any).moves.playCard({ G, ctx: { currentPlayer: '0' } }, handCard.iid, h.iid);
    expect((h.exp ?? 0) - before).toBe(1);
  });

  it('killing blow grants +1 exp to the killer hero via cast context', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    enemy.hp = 1;
    withCast(hero, 'attack', () => damageUnit(G, enemy, 5, 'attack'));
    // killer started at Lv1 with 0 exp; kill grants +1.
    expect(hero.exp).toBe(1);
    expect(hero.level).toBe(1);
  });

  it('overkill damage past 0 still grants kill exp once', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    enemy.hp = 1;
    withCast(hero, 'skill', () => damageUnit(G, enemy, 50, 'spirit'));
    expect(hero.exp).toBe(1);
  });

  it('death PRESERVES level + exp (rank persists through respawn)', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    grantExp(G, target, 7); // Lv2, 4 exp
    expect(target.level).toBe(2);
    expect(target.exp).toBe(4);
    target.hp = 1;
    const hero = G.players['0'].active!;
    withCast(hero, 'attack', () => damageUnit(G, target, 5, 'attack'));
    reapDead(G, G.players['1']);
    expect(target.respawnTurnsLeft).toBeGreaterThan(0);
    expect(target.level).toBe(2); // level persists
    expect(target.exp).toBe(4);   // exp persists
  });
});

describe('LEVEL_THRESHOLDS exposed correctly', () => {
  it('matches the spec: 3 → 6 → 9 exp per level', () => {
    expect(LEVEL_THRESHOLDS).toEqual([3, 6, 9]);
  });
});

describe('equipment persists through death', () => {
  it('attached equipment stays on the bearer when they die and respawn', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    // Hand-build an equipment instance and attach it directly.
    const eq: CardInstance = {
      iid: nextIid('eq'),
      cardId: 'extended_magazine',
      ownerId: '1',
      zone: 'equipment',
      attachedTo: target.iid,
      hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false,
    };
    target.attached = [eq];
    target.atkMod = 1; // simulate +1 ATK from Extended Magazine bonus
    const discardCountBefore = G.players['1'].discard.length;
    target.hp = 1;
    const hero = G.players['0'].active!;
    withCast(hero, 'attack', () => damageUnit(G, target, 5, 'attack'));
    reapDead(G, G.players['1']);
    // Equipment is still on the bearer.
    expect(target.attached?.length).toBe(1);
    expect(target.attached?.[0].cardId).toBe('extended_magazine');
    // Nothing was added to discard.
    expect(G.players['1'].discard.length).toBe(discardCountBefore);
    // atkMod persists since the equipment is still there.
    expect(target.atkMod).toBe(1);
  });
});

describe('level-up stat bonuses', () => {
  it('Lv1 → Lv2 grants +1 ATK, +1 HP/hpMax, +0 Spirit', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    const atk0 = h.atkMod;
    const spi0 = h.spiritMod;
    const hpMax0 = h.hpMax;
    const hp0 = h.hp;
    grantExp(G, h, 3); // Lv1 → Lv2
    expect(h.level).toBe(2);
    expect(h.atkMod - atk0).toBe(1);
    expect(h.spiritMod - spi0).toBe(0);
    expect(h.hpMax - hpMax0).toBe(1);
    expect(h.hp - hp0).toBe(1);  // healed too
  });

  it('Lv4 cap = +3 ATK / +3 HP / +0 Spirit cumulative', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    const atk0 = h.atkMod;
    const spi0 = h.spiritMod;
    const hpMax0 = h.hpMax;
    grantExp(G, h, 18); // all the way to Lv4
    expect(h.level).toBe(4);
    expect(h.atkMod - atk0).toBe(3);
    expect(h.spiritMod - spi0).toBe(0);
    expect(h.hpMax - hpMax0).toBe(3);
  });

  it('level-up never changes spiritMod (skill scaling is gear-only)', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    const spi0 = h.spiritMod;
    grantExp(G, h, 3);
    expect(h.spiritMod - spi0).toBe(0); // L2
    grantExp(G, h, 6);
    expect(h.spiritMod - spi0).toBe(0); // L3
    grantExp(G, h, 9);
    expect(h.spiritMod - spi0).toBe(0); // L4
  });

  it('multi-step single grant applies bonuses for every step jumped', () => {
    const G = freshG();
    const h = G.players['0'].active!;
    const atk0 = h.atkMod;
    grantExp(G, h, 10); // Lv1 → Lv3 (3 + 6 = 9 exp consumed, 1 remainder)
    expect(h.level).toBe(3);
    expect(h.atkMod - atk0).toBe(2);
  });

  it('death PRESERVES hpMax + atkMod gained from leveling', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    const baseHpMax = target.hpMax;
    grantExp(G, target, 18); // → Lv4, +3 atk / +3 hpMax / +0 spirit
    expect(target.hpMax).toBe(baseHpMax + 3);
    expect(target.atkMod).toBe(3);
    expect(target.spiritMod).toBe(0);
    target.hp = 1;
    const hero = G.players['0'].active!;
    withCast(hero, 'attack', () => damageUnit(G, target, 5, 'attack'));
    reapDead(G, G.players['1']);
    expect(target.level).toBe(4);             // level persists
    expect(target.hpMax).toBe(baseHpMax + 3); // hpMax persists
    expect(target.atkMod).toBe(3);            // atkMod persists
    expect(target.spiritMod).toBe(0);         // spiritMod stays 0 (never gained any)
  });
});
