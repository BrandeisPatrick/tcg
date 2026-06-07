import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, CardInstance } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import { damageUnit, healUnit, reapDead } from '@/engine/damage';
import { withCast } from '@/engine/castContext';
import { nextIid } from '@/engine/util';
import { freshReadyGame } from './_helpers';

/**
 * Damage + regeneration detail tests. Validates the mitigation pipeline
 * (Vulnerable / resists / shield / Unstoppable / Vindicta Flight), and the
 * heal pipeline (hpMax cap / Healing Blocked / corpse block / per-source).
 */

function freshG(): GameState {
  return freshReadyGame();
}

function attach(hero: CardInstance, cardId: string) {
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
}

// ============================================================================
// Damage pipeline
// ============================================================================

describe('damage: mitigation pipeline order', () => {
  it('Vulnerable (Bullet Resist −) adds +value BEFORE resist subtracts', () => {
    const G = freshG();
    const t = G.players['1'].active!;
    addStatus(G, t, 'bullet_resist_down', 2, 99);
    addStatus(G, t, 'bullet_resist', 5, 99);
    const before = t.hp;
    // 3 attack + 2 vulnerable - 5 bullet resist = 0.
    damageUnit(G, t, 3, 'attack');
    expect(before - t.hp).toBe(0);
  });

  it('pure damage bypasses Vulnerable (resist-down only affects its damage type)', () => {
    const G = freshG();
    const t = G.players['1'].active!;
    addStatus(G, t, 'bullet_resist_down', 2, 99);
    const before = t.hp;
    damageUnit(G, t, 2, 'pure');
    expect(before - t.hp).toBe(2); // pure ignores resist-down
  });

  it('Vulnerable value scales the damage bonus (Bullet Resist −3 → +3)', () => {
    const G = freshG();
    const t = G.players['1'].active!;
    addStatus(G, t, 'bullet_resist_down', 3, 99);
    const before = t.hp;
    damageUnit(G, t, 2, 'attack');
    expect(before - t.hp).toBe(5); // 2 + 3 vulnerable
  });

  it('Shield absorbs AFTER resist; pure damage bypasses shield', () => {
    const G = freshG();
    const t = G.players['1'].active!;
    addStatus(G, t, 'shield', 3, 99);
    addStatus(G, t, 'bullet_resist', 2, 99);
    const before = t.hp;
    // 5 attack - 2 resist = 3 → fully absorbed by shield, 0 HP loss.
    // Shield value drops to 0 → status is removed entirely (engine behavior).
    damageUnit(G, t, 5, 'attack');
    expect(before - t.hp).toBe(0);
    expect(t.statuses.some((s) => s.id === 'shield')).toBe(false);
    // Next bullet pokes through (no shield, only resist).
    damageUnit(G, t, 3, 'attack'); // 3 - 2 = 1
    expect(before - t.hp).toBe(1);
    // Pure damage ignores resist + shield even if both are present.
    addStatus(G, t, 'shield', 5, 99);
    damageUnit(G, t, 2, 'pure');
    expect(before - t.hp).toBe(3); // pure damage adds straight to HP loss
    expect(t.statuses.find((s) => s.id === 'shield')?.value).toBe(5);
  });

  it('Unstoppable blocks all damage types', () => {
    const G = freshG();
    const t = G.players['1'].active!;
    addStatus(G, t, 'unstoppable', 1, 99);
    const before = t.hp;
    damageUnit(G, t, 5, 'attack');
    damageUnit(G, t, 5, 'spirit');
    damageUnit(G, t, 5, 'pure');
    expect(t.hp).toBe(before);
  });

  it('Vindicta Flight: -1 attack damage only, not spirit/pure', () => {
    const G = freshG();
    // Vindicta is on bench in starter (hpMax=8). Bump her HP to test all three
    // damage types without bumping into the 0-HP overflow clamp.
    const v = G.players['0'].bench.find((b) => b?.cardId === 'hero_vindicta')!;
    v.hpMax = 30;
    v.hp = 30;
    damageUnit(G, v, 4, 'attack'); // 4 - 1 = 3
    expect(v.hp).toBe(27);
    damageUnit(G, v, 4, 'spirit'); // full 4 (no flight reduction)
    expect(v.hp).toBe(23);
    damageUnit(G, v, 2, 'pure'); // full 2
    expect(v.hp).toBe(21);
  });

  it('Corpse cannot take damage (returns 0)', () => {
    const G = freshG();
    const t = G.players['1'].active!;
    t.hp = 0;
    t.respawnTurnsLeft = 3;
    const dealt = damageUnit(G, t, 5, 'attack');
    expect(dealt).toBe(0);
    expect(t.hp).toBe(0);
    expect(t.respawnTurnsLeft).toBe(3);
  });

  it('Bleed ticks pure damage at start of turn (bypasses Shield/resist)', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    addStatus(G, t, 'shield', 10, 99);
    addStatus(G, t, 'bleed', 2, 3);
    const before = t.hp;
    tickStartOfTurn(G, G.players['0']);
    expect(before - t.hp).toBe(2); // pure, ignores shield
    expect(t.statuses.find((s) => s.id === 'shield')?.value).toBe(10);
  });

  it('hero death costs the patron a flat 1 (overflow is discarded)', () => {
    const G = freshG();
    const t = G.players['1'].active!;
    t.hp = 2;
    const patronBefore = G.players['1'].hp;
    damageUnit(G, t, 10, 'spirit'); // 8 overflow is discarded, not spilled
    expect(t.hp).toBe(0);
    reapDead(G, G.players['1']);
    expect(patronBefore - G.players['1'].hp).toBe(1); // flat 1 on death
  });

  it('Zero / negative damage is a no-op and does NOT fire equipment triggers', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    attach(hero, 'mystic_burst'); // would fire +2 spirit if triggered
    const hpBefore = enemy.hp;
    withCast(hero, 'skill', () => damageUnit(G, enemy, 0, 'spirit'));
    expect(enemy.hp).toBe(hpBefore);
    withCast(hero, 'skill', () => damageUnit(G, enemy, -3, 'spirit'));
    expect(enemy.hp).toBe(hpBefore);
  });
});

// ============================================================================
// Heal pipeline
// ============================================================================

describe('heal: cap + block rules', () => {
  it('caps at hpMax (no over-heal)', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 2;
    const healed = healUnit(G, t, 5);
    expect(healed).toBe(2);
    expect(t.hp).toBe(t.hpMax);
  });

  it('zero / negative amount is a no-op', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 3;
    expect(healUnit(G, t, 0)).toBe(0);
    expect(healUnit(G, t, -5)).toBe(0);
    expect(t.hp).toBe(t.hpMax - 3);
  });

  it('Healing Blocked: returns 0, no HP change', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 5;
    addStatus(G, t, 'healing_boost_down', 1, 2);
    expect(healUnit(G, t, 3)).toBe(0);
    expect(t.hp).toBe(t.hpMax - 5);
  });

  it('Corpse cannot be healed (returns 0, respawnTurnsLeft unchanged)', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = 0;
    t.respawnTurnsLeft = 3;
    const healed = healUnit(G, t, 5);
    expect(healed).toBe(0);
    expect(t.hp).toBe(0);
    expect(t.respawnTurnsLeft).toBe(3);
  });

  it('Healing Blocked expires (1-turn duration → gone after one tick)', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    addStatus(G, t, 'healing_boost_down', 1, 1);
    tickStartOfTurn(G, G.players['0']);
    expect(t.statuses.some((s) => s.id === 'healing_boost_down')).toBe(false);
    t.hp = t.hpMax - 3;
    expect(healUnit(G, t, 3)).toBe(3);
  });
});

// ============================================================================
// Heal-source coverage — every healing source respects Healing Blocked
// ============================================================================

describe('heal sources: all respect Healing Blocked', () => {
  it('Abrams Infernal Resilience (passive_abrams_heal)', () => {
    const G = freshG();
    const abrams = G.players['0'].active!;
    abrams.cardId = 'hero_abrams'; abrams.hpMax = 14; abrams.hp = 8; abrams.zone = 'active';
    addStatus(G, abrams, 'healing_boost_down', 1, 2);
    ABILITIES_BY_ID['passive_abrams_heal'].run(G, { movingPlayer: '0' }, { source: abrams });
    expect(abrams.hp).toBe(8); // no heal
  });

  it('Restorative Shot (onAttack proc)', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 3;
    addStatus(G, t, 'healing_boost_down', 1, 2);
    ABILITIES_BY_ID['eff_restorative_shot_proc'].run(G, { movingPlayer: '0' }, { source: t });
    expect(t.hp).toBe(t.hpMax - 3);
  });

  it('Mystic Regeneration (onBearerSkillDamage proc)', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 3;
    addStatus(G, t, 'healing_boost_down', 1, 2);
    ABILITIES_BY_ID['eff_mystic_regeneration_proc'].run(G, { movingPlayer: '0' }, { source: t });
    expect(t.hp).toBe(t.hpMax - 3);
  });

  it('Drifter Bloodscent (onAttack heal)', () => {
    const G = freshG();
    const drifter = G.players['0'].active!;
    drifter.hp = drifter.hpMax - 3;
    addStatus(G, drifter, 'healing_boost_down', 1, 2);
    ABILITIES_BY_ID['passive_drifter_bloodscent'].run(G, { movingPlayer: '0' }, { source: drifter });
    expect(drifter.hp).toBe(drifter.hpMax - 3);
  });

  it('Kelvin Frost Grenade (ally heal half)', () => {
    const G = freshG();
    const kelvin = G.players['0'].active!;
    const enemy = G.players['1'].active!;
    kelvin.hp = kelvin.hpMax - 3;
    addStatus(G, kelvin, 'healing_boost_down', 1, 2);
    ABILITIES_BY_ID['skill_kelvin'].run(G, { movingPlayer: '0' }, { source: kelvin, target: enemy });
    expect(kelvin.hp).toBe(kelvin.hpMax - 3); // heal blocked
    // damage still went through though (V1: 1 spirit dmg base)
    expect(enemy.hp).toBe(enemy.hpMax - 1);
  });

  it('Dynamo Rejuvenating Aurora (ally skill heal)', () => {
    const G = freshG();
    const dynamo = G.players['0'].active!;
    dynamo.hp = dynamo.hpMax - 4;
    addStatus(G, dynamo, 'healing_boost_down', 1, 2);
    ABILITIES_BY_ID['skill_dynamo'].run(G, { movingPlayer: '0' }, { source: dynamo, target: dynamo });
    expect(dynamo.hp).toBe(dynamo.hpMax - 4);
  });

  it('Healing Rite spell', () => {
    const G = freshG();
    const t = G.players['0'].active!;
    t.hp = t.hpMax - 3;
    addStatus(G, t, 'healing_boost_down', 1, 2);
    ABILITIES_BY_ID['eff_healing_rite'].run(G, { movingPlayer: '0' }, { target: t });
    expect(t.hp).toBe(t.hpMax - 3);
  });

  it('Rem Naptime / Mass Heal ult', () => {
    const G = freshG();
    const ps = G.players['0'];
    for (const c of [ps.active, ...ps.bench]) {
      if (c) { c.hp = c.hpMax - 3; addStatus(G, c, 'healing_boost_down', 1, 2); }
    }
    ABILITIES_BY_ID['eff_ult_rem'].run(G, { movingPlayer: '0' }, {});
    for (const c of [ps.active, ...ps.bench]) {
      if (c) expect(c.hp).toBe(c.hpMax - 3);
    }
  });
});

// ============================================================================
// Damage + regen interactions
// ============================================================================

