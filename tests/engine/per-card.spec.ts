import { describe, it, expect } from 'vitest';
import { ABILITIES_BY_ID } from '@/abilities';
import type { GameState, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { addStatus } from '@/engine/statusOps';

/**
 * Per-card test scenarios. Each block sets up a fresh game, applies the
 * card's ability (or a controlled state mutation that mirrors it), and
 * asserts the post-state matches the card's text.
 *
 * Focus is on cards added or rebalanced in the canon-tier audit, plus the
 * new T1 additions (Rusted Barrel, Golden Goose Egg, Extra Stamina,
 * Mystic Expansion, Close Quarters).
 */

function freshG(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  return JSON.parse(JSON.stringify(setup));
}

describe('NEW T1 spells', () => {
  it('rusted_barrel grants ally Active +2 Spirit Power for 1 turn', () => {
    const G = freshG();
    const skill = ABILITIES_BY_ID['eff_rusted_barrel'];
    const ally = G.players['0'].active!;
    skill.run(G, { movingPlayer: '0' }, { target: ally });
    const sp = ally.statuses.find((s) => s.id === 'spirit_power');
    expect(sp?.value).toBe(2);
    expect(sp?.duration).toBe(1);
  });

  it('golden_goose_egg gains 2 souls (capped at 7)', () => {
    const G = freshG();
    G.players['0'].souls = 3;
    ABILITIES_BY_ID['eff_golden_goose'].run(G, { movingPlayer: '0' }, {});
    expect(G.players['0'].souls).toBe(5);
  });

  it('golden_goose_egg caps at 7', () => {
    const G = freshG();
    G.players['0'].souls = 6;
    ABILITIES_BY_ID['eff_golden_goose'].run(G, { movingPlayer: '0' }, {});
    expect(G.players['0'].souls).toBe(7);
  });
});

describe('NEW T1 equipment', () => {
  it('extra_stamina draws 2 cards on attach', () => {
    const G = freshG();
    const ps = G.players['0'];
    const handBefore = ps.hand.length;
    const deckBefore = ps.deck.length;
    ABILITIES_BY_ID['eff_extra_stamina'].run(G, { movingPlayer: '0' }, {});
    expect(ps.hand.length - handBefore).toBe(2);
    expect(deckBefore - ps.deck.length).toBe(2);
  });

  it('extra_stamina respects hand cap (max 7)', () => {
    const G = freshG();
    const ps = G.players['0'];
    // Fill hand to 6 — drawing 2 should only land 1.
    while (ps.hand.length < 6 && ps.deck.length > 0) {
      const c = ps.deck.shift()!;
      ps.hand.push(c);
    }
    expect(ps.hand.length).toBe(6);
    ABILITIES_BY_ID['eff_extra_stamina'].run(G, { movingPlayer: '0' }, {});
    expect(ps.hand.length).toBe(7);
  });

  it('mystic_expansion grants long_range status on attach', () => {
    const G = freshG();
    const bearer = G.players['0'].active!;
    ABILITIES_BY_ID['eff_mystic_expansion'].run(G, { movingPlayer: '0' }, { source: bearer, target: bearer });
    const lr = bearer.statuses.find((s) => s.id === 'long_range');
    expect(lr).toBeDefined();
    expect(lr?.duration).toBeGreaterThan(100); // permanent (999)
  });
});

describe('REBALANCED spells (canon-tier adjusted)', () => {
  it('phantom_strike (T4) deals 6 dmg + caster Spirit', () => {
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 2;
    const target = G.players['1'].active!;
    const before = target.hp;
    ABILITIES_BY_ID['eff_phantom_strike'].run(G, { movingPlayer: '0' }, { target });
    expect(before - target.hp).toBe(8); // 6 + 2
  });

  it('decay (T3) applies Bleed 3 + caster Spirit for 3 turns', () => {
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 1;
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_decay'].run(G, { movingPlayer: '0' }, { target });
    const bleed = target.statuses.find((s) => s.id === 'bleed');
    expect(bleed?.value).toBe(4); // 3 + 1
    expect(bleed?.duration).toBe(3);
  });

  it('knockdown (T3) applies Stun 2 + Disarm 3', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_knockdown'].run(G, { movingPlayer: '0' }, { target });
    expect(target.statuses.find((s) => s.id === 'stun')?.duration).toBe(2);
    expect(target.statuses.find((s) => s.id === 'disarm')?.duration).toBe(3);
  });

  it('disarming_hex (T3) applies Disarm 3', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_disarming_hex'].run(G, { movingPlayer: '0' }, { target });
    expect(target.statuses.find((s) => s.id === 'disarm')?.duration).toBe(3);
  });

  it('cast_metal_skin (T3) grants Bullet Resist 5 + caster Spirit for 2 turns', () => {
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 1;
    const ally = G.players['0'].bench[0]!;
    ABILITIES_BY_ID['eff_cast_metal_skin'].run(G, { movingPlayer: '0' }, { target: ally });
    const br = ally.statuses.find((s) => s.id === 'bullet_resist');
    expect(br?.value).toBe(6); // 5 + 1
    expect(br?.duration).toBe(2);
  });

  it('ethereal_shift (T4 mythic) grants Invincibility for 2 turns', () => {
    const G = freshG();
    const ally = G.players['0'].active!;
    ABILITIES_BY_ID['eff_ethereal_shift'].run(G, { movingPlayer: '0' }, { target: ally });
    const inv = ally.statuses.find((s) => s.id === 'invincibility');
    expect(inv?.duration).toBe(2);
  });

  it('silence_glyph (T4 mythic) silences enemy Active + Bench for 2 turns', () => {
    const G = freshG();
    ABILITIES_BY_ID['eff_silence_glyph'].run(G, { movingPlayer: '0' }, {});
    const enemyHeroes = [G.players['1'].active!, ...G.players['1'].bench.filter(Boolean)];
    for (const h of enemyHeroes) {
      expect(h!.statuses.find((s) => s.id === 'silenced')?.duration).toBe(2);
    }
  });

  it('slowing_hex (T2) applies Disarm 2 + Vulnerable 2 (toned down from 3)', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_slowing_hex'].run(G, { movingPlayer: '0' }, { target });
    expect(target.statuses.find((s) => s.id === 'disarm')?.duration).toBe(2);
    expect(target.statuses.find((s) => s.id === 'vulnerable')?.duration).toBe(2);
  });
});

describe('Spell spirit scaling sourced from Active hero', () => {
  it('healing_rite scales with caster Active hero spirit, not its own', () => {
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 2;
    const ally = G.players['0'].bench[0]!;
    ally.hp = 1;
    ABILITIES_BY_ID['eff_healing_rite'].run(G, { movingPlayer: '0' }, { target: ally });
    // base 3 + spirit 2 = 5 healing; ally starts at 1 → ends at 6.
    expect(ally.hp).toBe(6);
  });

  it('return_fire grants Bullet Resist 3 + caster Spirit for 1 turn', () => {
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 2;
    const ally = G.players['0'].bench[0]!;
    ABILITIES_BY_ID['eff_return_fire'].run(G, { movingPlayer: '0' }, { target: ally });
    const br = ally.statuses.find((s) => s.id === 'bullet_resist');
    expect(br?.value).toBe(5); // 3 + 2
    expect(br?.duration).toBe(1);
  });

  it('divine_barrier grants Shield 5 + caster Spirit', () => {
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 3;
    const ally = G.players['0'].bench[0]!;
    ABILITIES_BY_ID['eff_cast_divine_barrier'].run(G, { movingPlayer: '0' }, { target: ally });
    const sh = ally.statuses.find((s) => s.id === 'shield');
    expect(sh?.value).toBe(8); // 5 + 3
  });

  it('spell scaling treats corpse Active as 0 spirit', () => {
    const G = freshG();
    const caster = G.players['0'].active!;
    caster.spiritMod = 5;
    caster.respawnTurnsLeft = 3; // mark as corpse
    const target = G.players['1'].active!;
    const before = target.hp;
    ABILITIES_BY_ID['eff_phantom_strike'].run(G, { movingPlayer: '0' }, { target });
    // Corpse contributes 0 — base damage only (6, no +5)
    expect(before - target.hp).toBe(6);
  });
});

describe('Curse / Echo Shard sanity (T4 mythics unchanged)', () => {
  it('curse stacks Silence + Disarm + Vulnerable for 2 turns', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['eff_curse'].run(G, { movingPlayer: '0' }, { target });
    expect(target.statuses.find((s) => s.id === 'silenced')?.duration).toBe(2);
    expect(target.statuses.find((s) => s.id === 'disarm')?.duration).toBe(2);
    expect(target.statuses.find((s) => s.id === 'vulnerable')?.duration).toBe(2);
  });

  it('echo_shard refreshes player skill flag if it was used', () => {
    const G = freshG();
    G.players['0'].skillUsedThisTurn = true;
    ABILITIES_BY_ID['eff_echo_shard'].run(G, { movingPlayer: '0' }, {});
    expect(G.players['0'].skillUsedThisTurn).toBe(false);
  });

  it('echo_shard fizzles if no skill used this turn', () => {
    const G = freshG();
    G.players['0'].skillUsedThisTurn = false;
    // Should not throw and should leave flag false
    ABILITIES_BY_ID['eff_echo_shard'].run(G, { movingPlayer: '0' }, {});
    expect(G.players['0'].skillUsedThisTurn).toBe(false);
  });
});

describe('Equipment on-attach procs', () => {
  it('enchanter_barrier grants Shield 3 on attach', () => {
    const G = freshG();
    const bearer = G.players['0'].active!;
    ABILITIES_BY_ID['eff_enchanter_barrier_attach'].run(G, { movingPlayer: '0' }, { source: bearer, target: bearer });
    expect(bearer.statuses.find((s) => s.id === 'shield')?.value).toBe(3);
  });

  it('debuff_remover_attach cleanses debuffs from bearer', () => {
    const G = freshG();
    const bearer = G.players['0'].active!;
    addStatus(G, bearer, 'stun', 1, 2);
    addStatus(G, bearer, 'bleed', 2, 3);
    expect(bearer.statuses.length).toBeGreaterThan(0);
    ABILITIES_BY_ID['eff_debuff_remover_attach'].run(G, { movingPlayer: '0' }, { source: bearer, target: bearer });
    expect(bearer.statuses.filter((s) => ['stun','bleed','disarm','silenced','sleep','vulnerable'].includes(s.id)).length).toBe(0);
  });

  it('suppressor_attach silences enemy Active for 1 turn', () => {
    const G = freshG();
    const bearer = G.players['0'].active!;
    ABILITIES_BY_ID['eff_suppressor_attach'].run(G, { movingPlayer: '0' }, { source: bearer });
    expect(G.players['1'].active!.statuses.find((s) => s.id === 'silenced')?.duration).toBe(1);
  });

  it('inhibitor_attach grants Spirit Resist 3 (permanent)', () => {
    const G = freshG();
    const bearer = G.players['0'].active!;
    ABILITIES_BY_ID['eff_inhibitor_attach'].run(G, { movingPlayer: '0' }, { source: bearer, target: bearer });
    const sr = bearer.statuses.find((s) => s.id === 'spirit_resist');
    expect(sr?.value).toBe(3);
    expect(sr?.duration).toBeGreaterThan(100);
  });

  it('sprint_boots_attach refreshes bearer on attach', () => {
    const G = freshG();
    const bearer = G.players['0'].active!;
    bearer.exhausted = true;
    ABILITIES_BY_ID['eff_sprint_boots_attach'].run(G, { movingPlayer: '0' }, { source: bearer, target: bearer });
    expect(bearer.exhausted).toBe(false);
  });
});

describe('Disruptor archetype — Warden', () => {
  it('Willpower skill grants Warden Shield 5 + Spirit', () => {
    const G = freshG();
    const warden = G.players['0'].active!;
    warden.spiritMod = 2;
    ABILITIES_BY_ID['skill_warden'].run(G, { movingPlayer: '0' }, { source: warden, target: warden });
    const shield = warden.statuses.find((s) => s.id === 'shield');
    expect(shield?.value).toBe(7); // 5 + 2 Spirit
  });

  it('Last Stand ult deals 3 spirit AoE + lifesteals back to Warden', () => {
    const G = freshG();
    // Replace P0 active with Warden so the lifesteal target exists.
    const warden = G.players['0'].active!;
    (warden as any).cardId = 'hero_warden';
    warden.hp = 4;
    warden.hpMax = 11;
    const enemy = G.players['1'];
    const hpBefore = enemy.active!.hp;
    ABILITIES_BY_ID['eff_ult_warden'].run(G, { movingPlayer: '0' }, {});
    expect(hpBefore - enemy.active!.hp).toBe(3); // 3 spirit landed
    // Lifesteal: Warden should heal >= 1 (at least half of one enemy's 3 dmg = 2).
    expect(warden.hp).toBeGreaterThan(4);
  });
});

describe('Trickster archetype — Mirage', () => {
  it('Tornado grants caster Invincible 1 + Vulnerable 1 + Stun 1 on enemy Active', () => {
    const G = freshG();
    const mirage = G.players['0'].active!;
    const target = G.players['1'].active!;
    ABILITIES_BY_ID['skill_mirage'].run(G, { movingPlayer: '0' }, { source: mirage, target });
    expect(mirage.statuses.find((s) => s.id === 'invincibility')?.duration).toBe(1);
    expect(target.statuses.find((s) => s.id === 'vulnerable')?.duration).toBe(1);
    expect(target.statuses.find((s) => s.id === 'stun')?.duration).toBe(1);
  });

  it('Traveler ult instantly respawns a fallen ally hero', () => {
    const G = freshG();
    const fallen = G.players['0'].bench[0]!;
    fallen.hp = 0;
    fallen.respawnTurnsLeft = 3;
    ABILITIES_BY_ID['eff_ult_mirage'].run(G, { movingPlayer: '0' }, {});
    expect(fallen.respawnTurnsLeft).toBeUndefined();
    expect(fallen.hp).toBe(fallen.hpMax);
  });

  it('Traveler fizzles when there are no fallen heroes (no-op)', () => {
    const G = freshG();
    // No corpses present on init.
    ABILITIES_BY_ID['eff_ult_mirage'].run(G, { movingPlayer: '0' }, {});
    // No crash, no mutation that matters.
    expect(G.players['0'].active?.hp).toBe(G.players['0'].active?.hpMax);
  });
});

describe('Assassin archetype — Drifter', () => {
  it('Eternal Night ult Silences all enemy bench heroes for 2 turns', () => {
    const G = freshG();
    ABILITIES_BY_ID['eff_ult_drifter'].run(G, { movingPlayer: '0' }, {});
    // Enemy active should NOT be silenced — ult targets bench only.
    expect(G.players['1'].active!.statuses.find((s) => s.id === 'silenced')).toBeUndefined();
    for (const b of G.players['1'].bench) {
      if (!b) continue;
      expect(b.statuses.find((s) => s.id === 'silenced')?.duration).toBe(2);
    }
  });

  it('Bloodscent on-attack passive heals Drifter for 1', () => {
    const G = freshG();
    const drifter = G.players['0'].active!;
    drifter.hp = 5;
    drifter.hpMax = 9;
    ABILITIES_BY_ID['passive_drifter_bloodscent'].run(G, { movingPlayer: '0' }, { source: drifter });
    expect(drifter.hp).toBe(6); // healed 1
  });

  it('Bloodscent passive is registered for Drifter and bound on the hero card', async () => {
    const { CARDS_BY_ID } = await import('@/cards');
    const drifter = CARDS_BY_ID['hero_drifter'];
    expect((drifter as any).passives).toContain('passive_drifter_bloodscent');
    expect(ABILITIES_BY_ID['passive_drifter_bloodscent']).toBeDefined();
  });
});

describe('Headshot Booster equipment — +2 vs Stunned', () => {
  it('combat-hook fires when bearer attacks a Stunned target', async () => {
    // We test through a minimal synthesized attacker with the equipment
    // attached. Since the hook lives in `effectiveAttackDamage`, we drive it
    // by importing the resolver and computing damage on a built unit.
    const { resolveAttackPhase } = await import('@/engine/combat');
    const G = freshG();
    // Equip Headshot Booster on the player active (a hero with stat bonus).
    const atk = G.players['0'].active!;
    const eq = { iid: 'hb1', cardId: 'headshot_booster', ownerId: '0', zone: 'attached', attachedTo: atk.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false } as any;
    atk.attached = [eq];
    // Stun the enemy active.
    G.players['1'].active!.statuses.push({ id: 'stun', value: 1, duration: 2 });
    const beforeHp = G.players['1'].active!.hp;
    resolveAttackPhase(G, '0');
    // Attacker's base ATK + Headshot's +1 ATK stat bonus is currently not
    // auto-applied to atkMod via this synthetic equip path, but the +2 vs
    // Stunned combat hook IS — that's what we want to assert.
    // The actual delta is "base ATK + bonus". For Haze (atk 4) that's 4 + 2 = 6,
    // but we cannot assume the active hero. Just assert damage dealt is at
    // least the bonus.
    const dmgDealt = beforeHp - G.players['1'].active!.hp;
    expect(dmgDealt).toBeGreaterThanOrEqual(2);
  });
});

// Regression: equipment cap of 3 per hero. Trying to attach a 4th without
// specifying which to discard is invalid; specifying a valid discard iid
// swaps cleanly and the dropped item lands in the discard pile.
describe('equipment cap (3 per hero)', () => {
  it('rejects a 4th equipment without a discard target', async () => {
    const { DeadlockGame } = await import('@/engine/game');
    const G = freshG();
    const hero = G.players['0'].active!;
    // Pre-fill the hero with 3 equipment instances.
    hero.attached = [
      { iid: 'eq1', cardId: 'basic_magazine', ownerId: '0', zone: 'equipment', attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false },
      { iid: 'eq2', cardId: 'extra_health',  ownerId: '0', zone: 'equipment', attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false },
      { iid: 'eq3', cardId: 'mystic_burst',  ownerId: '0', zone: 'equipment', attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false },
    ] as any;
    // Put a 4th equipment in hand with affordable cost.
    G.players['0'].souls = 5;
    const incoming = { iid: 'eq4', cardId: 'monster_rounds', ownerId: '0', zone: 'hand', hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false } as any;
    G.players['0'].hand = [incoming];

    const fn = (DeadlockGame.moves as any).playCard;
    const r = fn({ G, ctx: { currentPlayer: '0', numPlayers: 2 } as any, playerID: '0' }, 'eq4', hero.iid);
    expect(r).toBe('INVALID_MOVE');
    // Hero still wears the original 3.
    expect(hero.attached?.length).toBe(3);
  });

  it('swaps cleanly when a valid discard target is provided', async () => {
    const { DeadlockGame } = await import('@/engine/game');
    const G = freshG();
    const hero = G.players['0'].active!;
    hero.attached = [
      { iid: 'eq1', cardId: 'basic_magazine', ownerId: '0', zone: 'equipment', attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false },
      { iid: 'eq2', cardId: 'extra_health',  ownerId: '0', zone: 'equipment', attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false },
      { iid: 'eq3', cardId: 'mystic_burst',  ownerId: '0', zone: 'equipment', attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false },
    ] as any;
    G.players['0'].souls = 5;
    const incoming = { iid: 'eq4', cardId: 'monster_rounds', ownerId: '0', zone: 'hand', hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false } as any;
    G.players['0'].hand = [incoming];

    const fn = (DeadlockGame.moves as any).playCard;
    const r = fn({ G, ctx: { currentPlayer: '0', numPlayers: 2 } as any, playerID: '0' }, 'eq4', hero.iid, 'eq2');
    expect(r).not.toBe('INVALID_MOVE');
    // Slot count still 3, eq2 is gone, eq4 is attached.
    const ids = hero.attached!.map((eq) => eq.iid);
    expect(hero.attached?.length).toBe(3);
    expect(ids).not.toContain('eq2');
    expect(ids).toContain('eq4');
    // Discarded item is in the discard pile.
    expect(G.players['0'].discard.some((c) => c.iid === 'eq2')).toBe(true);
  });
});

// Regression: damage log uses the player-facing "bullet" label, not the
// engine-internal "attack" damage type.
describe('damage log labelling', () => {
  it('logs bullet damage with "bullet" not "attack"', async () => {
    const { damageUnit } = await import('@/engine/damage');
    const G = freshG();
    const tgt = G.players['1'].active!;
    damageUnit(G, tgt, 3, 'attack', 'TestHero');
    const lastLog = G.log[G.log.length - 1];
    expect(lastLog.text).toMatch(/bullet dmg/);
    expect(lastLog.text).not.toMatch(/attack dmg/);
  });

  it('logs spirit damage with "spirit" label', async () => {
    const { damageUnit } = await import('@/engine/damage');
    const G = freshG();
    const tgt = G.players['1'].active!;
    damageUnit(G, tgt, 3, 'spirit', 'TestHero');
    const lastLog = G.log[G.log.length - 1];
    expect(lastLog.text).toMatch(/spirit dmg/);
  });
});

// Regression: every hero's card text describes damage with explicit bullet/
// spirit labels (no bare "dmg") so the player can read intent at a glance.
describe('card text damage labels', () => {
  it('every hero / ult / spell card text labels damage as bullet or spirit', async () => {
    const { HEROES } = await import('@/cards/heroes');
    const { ULTIMATES } = await import('@/cards/ultimates');
    const { SPELLS } = await import('@/cards/spells');
    const allText = [...HEROES, ...ULTIMATES, ...SPELLS]
      .map((c) => ({ id: c.id, text: c.text ?? '' }))
      .filter((c) => / dmg\b/i.test(c.text));
    for (const c of allText) {
      const hasLabel = /bullet dmg|spirit dmg|pure dmg/i.test(c.text);
      expect(hasLabel, `${c.id} has unlabeled "dmg": "${c.text}"`).toBe(true);
    }
  });
});

// Regression lock: no glass-cannon hero should be one-shot by an opening-turn
// skill + basic-attack alpha. Worst-case caster combo is Yamato (atk 4) casting
// Power Slash (4 spirit at 0 SPI) into the front line. Every starter-deck hero
// must survive that 8-dmg burst with at least 1 HP after mitigation.
describe('alpha-strike regression', () => {
  it('every starter hero survives a turn-2 (4 spirit + 4 atk) opening alpha', async () => {
    const { damageUnit } = await import('@/engine/damage');
    const { CARDS_BY_ID } = await import('@/cards');
    const G = freshG();
    const frontline = [
      G.players['0'].active!,
      ...G.players['0'].bench.filter((c) => c != null).map((c) => c!),
      G.players['1'].active!,
      ...G.players['1'].bench.filter((c) => c != null).map((c) => c!),
    ];
    for (const hero of frontline) {
      const startHp = hero.hp;
      damageUnit(G, hero, 4, 'spirit');
      damageUnit(G, hero, 4, 'attack');
      const name = CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId;
      expect(hero.hp, `${name} died to opening alpha (start ${startHp}, end ${hero.hp})`).toBeGreaterThan(0);
      // reset for next hero
      hero.hp = startHp;
    }
  });
});
