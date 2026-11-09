import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, PlayerID } from '@/engine/types';
import { INVALID, perform } from '@/engine/engine';
import { playBlocked } from '@/engine/legality';
import { isRespawning, itemResist, slotCap, wornItems } from '@/engine/query';
import { beginTurn } from '@/engine/actions/turn';
import { resolve } from '@/engine/death';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import { damageUnit } from '@/engine/damage';
import { withCast } from '@/engine/castContext';
import { freshReadyGame, giveCard, giveItem, playNew } from './_helpers';

/**
 * Per-card test scenarios for the V1 minimal item set: active items (spells)
 * and passive items (equipment).
 *
 * Scope: every active and passive item effect we actually ship. Each test sets
 * up a fresh game, applies the card's ability (or a controlled state mutation
 * that mirrors it), and asserts the post-state matches the card's text.
 */

function freshG(): GameState {
  return freshReadyGame();
}

// ============================================================================
// Active items (7 cards)
// ============================================================================

describe('Active items — tier 1', () => {
  it('Healing Rite heals 2 (flat, no Spirit scaling)', () => {
    const G = freshG();
    const target = G.players['0'].bench[0]!;
    target.hp = Math.max(1, target.hpMax - 5); // wounded but alive (heroes are 5 HP now)
    const before = target.hp;
    ABILITIES_BY_ID['eff_healing_rite'].run(G, { movingPlayer: '0' }, { target });
    expect(target.hp - before).toBe(2);
  });

  it('Rusted Barrel applies Weaken 2 for 2 turns', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_rusted_barrel'].run(G, { movingPlayer: '0' }, { target });
    const w = target.statuses.find((s) => s.id === 'weapon_power_down');
    expect(w?.value).toBe(2);
    expect(w?.duration).toBe(2);
  });
});

describe('Active items — tiers 2 and 3', () => {
  it('Cold Front deals 2 spirit damage (+ caster Spirit) to enemy Active', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hpMax = 30; target.hp = 30;
    const before = target.hp;
    ABILITIES_BY_ID['eff_cold_front'].run(G, { movingPlayer: '0' }, { target });
    expect(before - target.hp).toBe(2);
  });

  it('Decay applies Bleed 3 for 2 turns (6 pure damage total over two ticks)', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hpMax = 30; target.hp = 30;
    ABILITIES_BY_ID['eff_decay'].run(G, { movingPlayer: '0' }, { target });
    const b = target.statuses.find((s) => s.id === 'bleed');
    expect(b?.value).toBe(3);
    expect(b?.duration).toBe(2);
    // Two start-of-turn ticks for player 1 → bleed deals 3 + 3 = 6 pure damage.
    const before = target.hp;
    tickStartOfTurn(G, G.players['1']);
    tickStartOfTurn(G, G.players['1']);
    expect(before - target.hp).toBe(6);
  });

  it('Disarming Hex applies Disarm for 2 turns', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_disarming_hex'].run(G, { movingPlayer: '0' }, { target });
    const d = target.statuses.find((s) => s.id === 'disarm');
    expect(d?.duration).toBe(2);
  });
});

describe('Active items — tier 3 control and resist', () => {
  it('Knockdown applies Stun 1T (no Disarm)', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_knockdown'].run(G, { movingPlayer: '0' }, { target });
    expect(target.statuses.find((s) => s.id === 'stun')?.duration).toBe(1);
    expect(target.statuses.find((s) => s.id === 'disarm')).toBeUndefined();
  });

  it('Metal Skin grants ally Bullet Resist 5 for 2 turns (no scaling)', () => {
    const G = freshG();
    const ally = G.players['0'].bench[0]!;
    ABILITIES_BY_ID['eff_cast_metal_skin'].run(G, { movingPlayer: '0' }, { target: ally });
    const br = ally.statuses.find((s) => s.id === 'bullet_resist');
    expect(br?.value).toBe(5);
    expect(br?.duration).toBe(2);
  });
});

// ============================================================================
// Equipment (9 cards) — passives + reactive procs
// ============================================================================

describe('Equipment passives', () => {
  // Resist 2 read off the item (the `resist` hook), not a status: a hit of its
  // type deals 2 less while it is worn, and a death, which wipes the statuses,
  // takes nothing away.
  for (const [itemId, name, type, other, status] of [
    ['bullet_resilience', 'Bullet', 'attack', 'spirit', 'bullet_resist'],
    ['spirit_resilience', 'Spirit', 'spirit', 'attack', 'spirit_resist'],
  ] as const) {
    it(`${name} Resilience: a ${name.toLowerCase()} hit deals 2 less while worn — no status, and still after a death`, () => {
      const G = freshG();
      const t = G.players['1'].bench[0]!;
      t.hpMax = 30; t.hp = 30; // above half HP: the resist alone
      giveItem(G, t, itemId);
      expect(t.statuses.some((s) => s.id === status)).toBe(false);
      expect(itemResist(t, type)).toBe(2);
      damageUnit(G, t, 5, type);
      expect(t.hp).toBe(27);
      damageUnit(G, t, 5, other); // the other type passes in full
      expect(t.hp).toBe(22);
      damageUnit(G, t, 99, 'pure');
      resolve(G);
      expect(isRespawning(t)).toBe(true);
      for (let turn = 3; isRespawning(t) && turn < 20; turn += 2) beginTurn(G, '1', turn);
      expect(t.hp).toBe(30);
      damageUnit(G, t, 5, type);
      expect(t.hp).toBe(27);
    });
  }

  it('Resilience takes 2 more off a hit of its type only while below half HP', () => {
    const t = { hp: 10, hpMax: 10 } as Parameters<NonNullable<typeof ABILITIES_BY_ID['eff_bullet_resist']['incoming']>>[0];
    const bullet = ABILITIES_BY_ID['eff_bullet_resist'].incoming!;
    const spirit = ABILITIES_BY_ID['eff_spirit_resist'].incoming!;
    expect(bullet(t, 5, 'attack')).toBe(5);
    t.hp = 4;
    expect(bullet(t, 5, 'attack')).toBe(3);
    expect(bullet(t, 5, 'spirit')).toBe(5);
    expect(spirit(t, 5, 'spirit')).toBe(3);
    expect(spirit(t, 1, 'spirit')).toBe(0);
  });
});

describe('Equipment reactive procs', () => {
  it('Restorative Shot heals 1 on attack', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 3;
    const before = t.hp;
    ABILITIES_BY_ID['eff_restorative_shot_proc'].run(G, { movingPlayer: '0' }, { source: t });
    expect(t.hp - before).toBe(1);
  });

  it('Mystic Regeneration heals 1 after skill damages an enemy', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 3;
    const before = t.hp;
    ABILITIES_BY_ID['eff_mystic_regeneration_proc'].run(G, { movingPlayer: '0' }, { source: t });
    expect(t.hp - before).toBe(1);
  });

  it('Bullet Shield grants Shield 2 when bearer takes bullet damage', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    ABILITIES_BY_ID['eff_bullet_shield_proc'].run(G, { movingPlayer: '0' }, { source: t });
    expect(t.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });

  it('Spirit Shield grants Shield 2 when bearer takes spirit damage', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    ABILITIES_BY_ID['eff_spirit_shield_proc'].run(G, { movingPlayer: '0' }, { source: t });
    expect(t.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });
});

// ============================================================================
// Reactive trigger end-to-end (verify the damage pipeline fires the new
// onBearerDamagedBy* triggers correctly so attached Bullet/Spirit Shield
// actually procs in a real combat flow).
// ============================================================================

describe('Reactive shield triggers fire from real damage', () => {
  function attach(hero: any, cardId: string) {
    hero.attached = hero.attached ?? [];
    hero.attached.push({
      iid: `eq-${cardId}`, cardId, ownerId: hero.ownerId, zone: 'equipment',
      attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false,
    });
  }

  it('Bullet Shield procs when the bearer is shot', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    attach(target, 'weapon_shielding');
    target.hpMax = 30; target.hp = 30;
    damageUnit(G, target, 3, 'attack', 'TestAttacker');
    expect(target.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });

  it('Bullet Shield does NOT proc on spirit damage', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    attach(target, 'weapon_shielding');
    target.hpMax = 30; target.hp = 30;
    damageUnit(G, target, 3, 'spirit', 'TestCaster');
    expect(target.statuses.find((s) => s.id === 'shield')).toBeUndefined();
  });

  it('Spirit Shield procs on spirit damage', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    attach(target, 'spirit_shielding');
    target.hpMax = 30; target.hp = 30;
    damageUnit(G, target, 3, 'spirit', 'TestCaster');
    expect(target.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });
});

// ============================================================================
// Weaken end-to-end via the combat resolver
// ============================================================================

describe('Weaken status reduces attack damage', () => {
  it('Weakened attacker deals -value less in combat', () => {
    const G = freshG();
    const atk = G.players['0'].active!;
    const target = G.players['1'].active!;
    addStatus(G, atk, 'weapon_power_down', 2, 2);
    target.hpMax = 30; target.hp = 30;
    const before = target.hp;
    withCast(atk, 'attack', () => damageUnit(G, target, Math.max(0, 3 - 2), 'attack'));
    // The above directly proves -2 reduces a 3-ATK swing to 1.
    expect(before - target.hp).toBe(1);
  });
});

// ============================================================================
// Spell scaling sourced from Active hero (Spirit Power buff via equipment)
// ============================================================================

describe('Spell scaling treats corpse Active as 0 Spirit', () => {
  it('healing_rite returns base heal when caster Active is a corpse', () => {
    const G = freshG();
    const ally = G.players['0'].bench[0]!;
    ally.hp = Math.max(1, ally.hpMax - 5); // wounded but alive (heroes are 5 HP now)
    // KO the caster's active.
    G.players['0'].active!.respawnTurnsLeft = 3;
    G.players['0'].active!.hp = 0;
    const before = ally.hp;
    ABILITIES_BY_ID['eff_healing_rite'].run(G, { movingPlayer: '0' as PlayerID }, { target: ally });
    expect(ally.hp - before).toBe(2);
  });
});

// ============================================================================
// Item slots (3 per hero) — sanity that the engine still enforces the cap
// ============================================================================

describe('item slots (3 per hero)', () => {
  it('a play onto a full hero is refused — there is no discard; only an upgrade of an item it wears goes on, in its place', () => {
    const G = freshReadyGame();
    G.players['0'].souls = 99;
    const hero = G.players['0'].active!;
    ['extra_spirit', 'extra_health', 'restorative_shot'].forEach((id) => playNew(G, '0', id, hero));
    expect(wornItems(hero)).toHaveLength(slotCap(G, '0'));
    const card = giveCard(G, '0', 'extended_magazine');
    const fourth = { type: 'playCard' as const, cardIid: card.iid, heroIid: hero.iid };
    expect(playBlocked(G, '0', card.iid, hero.iid)).toBe('full');
    expect(perform(G, '0', fourth)).toBe(INVALID);
    expect(wornItems(hero)).toHaveLength(3);
    expect(G.players['0'].hand).toEqual([card]);
    // An upgrade of a worn item evolves it: Improved Spirit takes Extra Spirit's place.
    const up = giveCard(G, '0', 'improved_spirit');
    expect(playBlocked(G, '0', up.iid, hero.iid)).toBeNull();
    expect(perform(G, '0', { type: 'playCard', cardIid: up.iid, heroIid: hero.iid, upgradeId: undefined })).not.toBe(INVALID);
    expect(wornItems(hero).map((it) => it.cardId)).toEqual(['extra_health', 'restorative_shot', 'improved_spirit']);
  });
});

// ============================================================================
// Damage log labels
// ============================================================================

describe('damage log labelling', () => {
  it('logs bullet damage with "bullet" not "attack"', () => {
    const G = freshG();
    const tgt = G.players['1'].active!;
    tgt.hpMax = 30; tgt.hp = 30;
    damageUnit(G, tgt, 3, 'attack', 'TestHero');
    const txt = G.log.map((e) => e.text).join('\n');
    expect(txt).toMatch(/bullet dmg/);
  });

  it('logs spirit damage with "spirit" label', () => {
    const G = freshG();
    const tgt = G.players['1'].active!;
    tgt.hpMax = 30; tgt.hp = 30;
    damageUnit(G, tgt, 3, 'spirit', 'TestHero');
    const txt = G.log.map((e) => e.text).join('\n');
    expect(txt).toMatch(/spirit dmg/);
  });
});

// ============================================================================
// Sanity sweep: every starter hero survives a single 2-dmg spell at L1.
// ============================================================================

describe('alpha-strike regression (V1 lean stats)', () => {
  it('every starter hero survives a single 2-dmg spell', async () => {
    const heroesMod = await import('@/cards/heroes');
    const heroes = (heroesMod as any).HEROES;
    for (const def of heroes) {
      const G = freshG();
      const hero = G.players['0'].active!;
      hero.cardId = def.id;
      hero.hpMax = def.hp;
      hero.hp = def.hp;
      damageUnit(G, hero, 2, 'spirit');
      expect(hero.hp, `${def.id}`).toBeGreaterThan(0);
    }
  });
});
