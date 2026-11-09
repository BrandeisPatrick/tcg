import { CARDS_BY_ID } from '@/cards';
import { describe, it, expect } from 'vitest';
import { freshReadyGame, makeAttack, makeHero } from './_helpers';
import { INVALID, perform } from '@/engine/engine';
import { tickCastingPulses, addStatus, tickRemMerges } from '@/engine/statusOps';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/death';
import { effectiveAtk, isBlocked, seatOf } from '@/engine/query';
import { skillBlocked } from '@/engine/legality';
import { grantExtraAttacks } from '@/engine/statusOps';
import { FIXATION_CAP, MAX_EXTRA_ATTACKS } from '@/engine/constants';
import { getAbility } from '@/abilities';
import { buildPlayer } from '@/engine/actions/setup';
import { allocatorFor, newCounters } from '@/engine/ids';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';

const extraOf = (c: CardInstance) => c.statuses.find((s) => s.id === 'extra_attack')?.value ?? 0;

// Clear the bench so the Active hero's swings read cleanly (bench heroes
// never attack).
function soloAttacker(G: GameState, pid: PlayerID) {
  G.players[pid].bench = [null, null, null];
}

describe('Multi-attack: Extra Attack (N)', () => {
  it('one Extra Attack doubles raw attack output (full power)', () => {
    const G = freshReadyGame();
    G.players['0'].active = makeHero('hero_dynamo', '0', 'active', 0); // no Fixation
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    addStatus(G, def, 'shield', 99, 999); // survive both swings; isolate damage
    const dmg = effectiveAtk(atk);
    grantExtraAttacks(atk, 1);

    const shieldBefore = def.statuses.find((s) => s.id === 'shield')!.value;
    makeAttack(G, '0');
    const shieldAfter = def.statuses.find((s) => s.id === 'shield')!.value;
    expect(shieldBefore - shieldAfter).toBe(dmg * 2); // primary + 1 full Extra Attack
  });

  it('Extra Attack sources STACK additively', () => {
    const atk = makeHero('hero_haze', '0');
    grantExtraAttacks(atk, 1); // Burst Fire
    grantExtraAttacks(atk, 1); // Active Reload
    grantExtraAttacks(atk, 1); // a third source
    expect(extraOf(atk)).toBe(3);
  });

  it('stacking is capped at MAX_EXTRA_ATTACKS (loop backstop)', () => {
    const atk = makeHero('hero_haze', '0');
    grantExtraAttacks(atk, 99);
    expect(extraOf(atk)).toBe(MAX_EXTRA_ATTACKS);
  });

  it('N Extra Attacks → N+1 total swings, then the status clears', () => {
    const G = freshReadyGame();
    G.players['0'].active = makeHero('hero_dynamo', '0', 'active', 0); // no Fixation
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 99;
    const dmg = effectiveAtk(atk);
    grantExtraAttacks(atk, 2); // 1 primary + 2 extra = 3 swings
    const hp0 = def.hp;
    makeAttack(G, '0');
    expect(hp0 - def.hp).toBe(dmg * 3);
    expect(extraOf(atk)).toBe(0); // consumed
  });

  it('Extra Attacks re-fire onAttack procs (Toxic Bullets bleed stacks per swing)', () => {
    const G = freshReadyGame();
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 30;
    atk.attached = [{ ...makeHero('toxic_bullets', '0'), cardId: 'toxic_bullets' }];
    grantExtraAttacks(atk, 2); // 3 swings → Bleed maxes at 3
    makeAttack(G, '0');
    expect(def.statuses.find((s) => s.id === 'bleed')?.value).toBe(3);
  });

  it('Burst Fire (equipment) grants Extra Attack; Fixation adds a stack to the target, not an Extra Attack', () => {
    const G = freshReadyGame();
    const dyn = makeHero('hero_dynamo', '0', 'active', 0); // plain active
    G.players['0'].active = dyn;
    const def = G.players['1'].active!;
    getAbility('eff_burst_fire')!.run(G, { movingPlayer: '0' }, { source: dyn });                                     // +1 (each turn)
    getAbility('passive_haze_fixation')!.run(G, { movingPlayer: '0' }, { source: dyn, target: def, params: { primary: true } }); // a stack on the target
    expect(extraOf(dyn)).toBe(1);
    expect(def.statuses.find((s) => s.id === 'fixation')?.value).toBe(1);
  });

  it('Fixation stacks on a swing, never on a Ricochet bounce, up to FIXATION_CAP (no extra swings)', () => {
    const G = freshReadyGame();
    const haze = makeHero('hero_haze', '0');
    const def = G.players['1'].active!;
    const fixation = getAbility('passive_haze_fixation')!;
    const stacks = () => def.statuses.find((s) => s.id === 'fixation')?.value ?? 0;
    // A bounce adds none.
    fixation.run(G, { movingPlayer: '0' }, { source: haze, target: def, params: { dealt: 2, bounce: true } });
    expect(stacks()).toBe(0);
    // Each swing adds one, up to the cap.
    for (let i = 0; i < FIXATION_CAP + 2; i++) fixation.run(G, { movingPlayer: '0' }, { source: haze, target: def, params: { primary: true } });
    expect(stacks()).toBe(FIXATION_CAP);
    expect(extraOf(haze)).toBe(0);
  });
});

describe('Haze Fixation — reactive follow-up swing', () => {
  it('at any level Haze swings once: no Extra Attack from Fixation', () => {
    for (const level of [1, 2, 3, 4] as const) {
      const G = freshReadyGame();
      const haze = makeHero('hero_haze', '0', 'active', 0);
      haze.level = level;
      G.players['0'].active = haze;
      soloAttacker(G, '0');
      const def = G.players['1'].active!;
      def.hp = def.hpMax = 99;
      makeAttack(G, '0');
      expect(def.hp, `level ${level}`).toBe(99 - effectiveAtk(haze)); // the first swing: no stack yet
      expect(extraOf(haze), `level ${level}`).toBe(0);
    }
  });

  it('each swing through the attack phase adds a stack, and the next swing deals +stacks (capped at 2)', () => {
    const G = freshReadyGame();
    const haze = makeHero('hero_haze', '0', 'active', 0);
    G.players['0'].active = haze;
    soloAttacker(G, '0');
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 99;
    const dmg = effectiveAtk(haze);
    grantExtraAttacks(haze, 3); // four swings: +0, +1, +2, +2
    makeAttack(G, '0');
    expect(def.hp).toBe(99 - (dmg * 4 + 0 + 1 + 2 + 2));
    expect(def.statuses.find((s) => s.id === 'fixation')?.value).toBe(FIXATION_CAP);
    expect(extraOf(haze)).toBe(0); // consumed + cleared
  });

  it('a disarmed Haze puts no Fixation stack on (she never attacked)', () => {
    const G = freshReadyGame();
    const haze = makeHero('hero_haze', '0', 'active', 0);
    G.players['0'].active = haze;
    soloAttacker(G, '0');
    addStatus(G, haze, 'disarm', 1, 2); // can't attack → effectiveAtk 0
    const def = G.players['1'].active!;
    const hp0 = def.hp;
    expect(perform(G, '0', { type: 'attack' })).toBe(INVALID); // the gate refuses it
    expect(def.hp).toBe(hp0); // no damage
    expect(extraOf(haze)).toBe(0);
    expect(def.statuses.some((s) => s.id === 'fixation')).toBe(false); // Fixation never fired
  });
});

describe('Active Reload — passive equipment (docs/card-design.md)', () => {
  it('is equipment with +1 Bullet Power, and heals its bearer 1 after an attack', () => {
    expect(CARDS_BY_ID['active_reload']).toMatchObject({ type: 'equipment', bonus: { atk: 1 } });
    const G = freshReadyGame();
    const dyn = makeHero('hero_dynamo', '0', 'active', 0);
    G.players['0'].active = dyn;
    dyn.hp = 2;
    getAbility('eff_active_reload')!.run(G, { movingPlayer: '0' }, { source: dyn });
    expect(dyn.hp).toBe(3);
  });
});

describe('Lifesteal is gone from Drifter and Lady Geist: Bloodscent and Essence Bomb as printed', () => {
  it('Drifter\'s Bloodscent grows his Attack +1 for each knockout while he is Active, up to 2, and heals nothing', () => {
    const G = freshReadyGame();
    const drifter = makeHero('hero_drifter', '0', 'active', 0);
    drifter.hp = 1; drifter.hpMax = 20;
    const bloodscent = getAbility('passive_drifter_bloodscent')!;
    for (let i = 0; i < 3; i++) bloodscent.run(G, { movingPlayer: '0' }, { source: drifter, params: { dealt: 4 } });
    expect(drifter.atkMod).toBe(2); // capped at +2
    expect(drifter.tally?.passive_drifter_bloodscent).toBe(2);
    expect(drifter.hp).toBe(1);     // no lifesteal
  });

  it('Drifter\'s swing through a real attack phase heals him nothing, and hits a hero below half HP for +1', () => {
    const G = freshReadyGame();
    const drifter = makeHero('hero_drifter', '0', 'active', 0);
    drifter.hp = 1; drifter.hpMax = 20;
    G.players['0'].active = drifter;
    soloAttacker(G, '0');
    const def = G.players['1'].active!;
    def.hp = 40; def.hpMax = 99; // below half: survives the swing
    const dmg = effectiveAtk(drifter);
    makeAttack(G, '0');
    expect(def.hp).toBe(40 - (dmg + 1)); // Bloodscent +1
    expect(drifter.hp).toBe(1);          // no heal; the defender does not strike back
  });

  it('Lady Geist\'s Essence Bomb costs her 1 HP and drains nothing: {sp:1} spirit damage to every enemy', () => {
    const G = freshReadyGame();
    const geist = makeHero('hero_lady_geist', '0', 'active', 0);
    geist.hp = 5; geist.hpMax = 10;
    G.players['0'].active = geist;
    G.players['0'].souls = 20;
    const enemies = [G.players['1'].active, ...G.players['1'].bench].filter(Boolean) as CardInstance[];
    for (const e of enemies) e.hp = e.hpMax = 20;
    expect(perform(G, '0', { type: 'useSkill', heroIid: geist.iid, skillId: 'skill_lady_geist' })).not.toBe(INVALID);
    for (const e of enemies) expect(e.hp, e.cardId).toBe(20 - 1);  // dealt 1 spirit each (Spirit 0)
    expect(geist.hp).toBe(5 - 1);                                    // paid 1 HP, healed nothing
  });
});

describe('Ricochet — canon AoE on attack (ricochet.spec has the keyword)', () => {
  it('each swing bounces 2 to every enemy bench hero, scaling with Extra Attack', () => {
    const G = freshReadyGame();
    G.players['0'].active = makeHero('hero_dynamo', '0', 'active', 0); // no Fixation
    soloAttacker(G, '0');
    const atk = G.players['0'].active!;
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 99; // keep the primary target alive across swings
    atk.attached = [{ ...makeHero('ricochet', '0'), cardId: 'ricochet' }];
    const bench0 = G.players['1'].bench.find(Boolean) as CardInstance;
    bench0.hp = bench0.hpMax = 99;
    const before = bench0.hp;
    grantExtraAttacks(atk, 1); // 2 swings → 2 bounces → 4 to the bench hero
    makeAttack(G, '0');
    expect(before - bench0.hp).toBe(4);
  });
});

describe('Channeled board-wipe archetype (the channel statuses, set directly: no hero channels now)', () => {
  function channelGame(caster: string): { G: GameState; self: CardInstance; enemies: CardInstance[] } {
    const G = freshReadyGame();
    const self = makeHero(caster, '0', 'active', 0);
    G.players['0'].active = self;
    G.players['0'].bench = [null, null, null];
    // Two enemy bodies with generous HP so a single pulse doesn't wipe instantly.
    const e0 = makeHero('hero_abrams', '1', 'active', 0);
    const e1 = makeHero('hero_kelvin', '1', 'bench', 1);
    e0.hp = e0.hpMax = 10; e1.hp = e1.hpMax = 10;
    G.players['1'].active = e0;
    G.players['1'].bench = [e1, null, null];
    return { G, self, enemies: [e0, e1] };
  }

  it('a heavy channel (casting, set directly) locks out attacks AND skills', () => {
    const { G, self } = channelGame('hero_dynamo');
    addStatus(G, self, 'casting', 3, 3);
    expect(self.statuses.find((s) => s.id === 'casting')?.duration).toBe(3);
    expect(effectiveAtk(self)).toBe(0); // attack gate
    expect(isBlocked(self, 'skill')).toBe(true); // skill gate
    G.players['0'].souls = 20;
    expect(skillBlocked(G, '0', self)).toBe('status');
  });

  it('heavy pulses (casting 3, set directly) clear the enemy board over the channel duration', () => {
    const { G, self, enemies } = channelGame('hero_dynamo');
    enemies.forEach((e) => { e.hp = e.hpMax = 9; }); // 3/turn × 3 turns = 9 → dead by pulse 3
    addStatus(G, self, 'casting', 3, 3);
    // Simulate three end-of-turn pulses (channel value stays flat at 3).
    for (let i = 0; i < 3; i++) tickCastingPulses(G, G.players['0']);
    expect(self.statuses.find((s) => s.id === 'casting')?.value).toBe(3); // no escalation
    expect(enemies.every((e) => e.hp <= 0)).toBe(true);
  });

  it('an escalating channel (ramp 1, set directly) climbs 2 → 3 → 4 each pulse', () => {
    const { G, self } = channelGame('hero_seven');
    addStatus(G, self, 'casting', 2, 3, { ramp: 1 });
    const casting = () => self.statuses.find((s) => s.id === 'casting')!;
    expect(casting().value).toBe(2);
    tickCastingPulses(G, G.players['0']);
    expect(casting().value).toBe(3);
    tickCastingPulses(G, G.players['0']);
    expect(casting().value).toBe(4);
  });

  it('a light channel (casting_light, set directly) keeps its hero attacking and heals it from the drain', () => {
    const { G, self, enemies } = channelGame('hero_warden');
    self.hp = 1; // hurt so the drain heal is visible
    addStatus(G, self, 'casting_light', 2, 3);
    expect(self.statuses.some((s) => s.id === 'casting')).toBe(false);
    expect(effectiveAtk(self)).toBeGreaterThan(0); // NOT locked out
    const before = self.hp;
    tickCastingPulses(G, G.players['0']);
    expect(self.hp).toBeGreaterThan(before); // drained HP back
    expect(enemies.every((e) => e.hp < 10)).toBe(true);
  });

  it('Stun interrupts a channel pulse (no damage that turn)', () => {
    const { G, self, enemies } = channelGame('hero_dynamo');
    addStatus(G, self, 'casting', 3, 3);
    addStatus(G, self, 'stun', 1, 2);
    const before = enemies.map((e) => e.hp);
    tickCastingPulses(G, G.players['0']);
    enemies.forEach((e, i) => expect(e.hp).toBe(before[i])); // pulse skipped
  });
});

describe('Support — Rem: Tag Along, and the merge machinery (a merged Rem set by hand)', () => {
  function setup() {
    const G = freshReadyGame();
    const ally = makeHero('hero_dynamo', '0', 'active', 0); // bearer
    const rem = makeHero('hero_rem', '0', 'bench', 1);      // slot 1 → bench[0]
    G.players['0'].active = ally;
    G.players['0'].bench = [rem, null, null];
    return { G, ally, rem };
  }

  /** Merge `rem` into `ally` by hand, as the old Lil Helpers did: out of her
   *  bench slot, onto the bearer's `attached`, the max HP she grants on him,
   *  for 3 of her owner's turns. No hero's skill does this now; the engine's
   *  merge machinery (the countdown, the return, the death rescue) remains. */
  function mergeByHand(G: GameState, rem: CardInstance, ally: CardInstance, hpBuff: number) {
    const ps = G.players[seatOf(rem)];
    const idx = ps.bench.findIndex((b) => b === rem);
    if (idx >= 0) ps.bench[idx] = null;
    ally.hpMax += hpBuff;
    ally.hp += hpBuff;
    rem.zone = 'equipment';
    rem.attachedTo = ally.iid;
    rem.remMergeTurnsLeft = 3;
    rem.remMergeHpBuff = hpBuff;
    (ally.attached ??= []).push(rem);
  }

  it('Tag Along heals the ally {sp:4} and Rem 2; Rem stays on the bench (no merge)', () => {
    const { G, ally, rem } = setup();
    ally.hp = 1; ally.hpMax = 20;
    rem.hp = 1; rem.hpMax = 20;
    getAbility('skill_rem')!.run(G, { movingPlayer: '0' }, { source: rem, target: ally });
    expect(ally.hp).toBe(1 + 4);
    expect(rem.hp).toBe(1 + 2);
    expect(ally.hpMax).toBe(20); // no max HP granted
    expect(ally.attached?.some((a) => a.cardId === 'hero_rem') ?? false).toBe(false);
    expect(G.players['0'].bench[0]).toBe(rem);
    expect(rem.remMergeTurnsLeft).toBeUndefined();
  });

  it("Tag Along's heal scales with Rem's Spirit", () => {
    const { G, ally, rem } = setup();
    rem.spiritMod = 2;
    ally.hp = 1; ally.hpMax = 20;
    getAbility('skill_rem')!.run(G, { movingPlayer: '0' }, { source: rem, target: ally });
    expect(ally.hp).toBe(1 + 4 + 2);
  });

  it('after 3 ticks a merged Rem returns to the bench and the max-HP reverts', () => {
    const { G, ally, rem } = setup();
    const baseMax = ally.hpMax;
    mergeByHand(G, rem, ally, 1);
    expect(ally.hpMax).toBe(baseMax + 1);
    tickRemMerges(G, G.players['0']); // 3→2
    tickRemMerges(G, G.players['0']); // 2→1
    expect(G.players['0'].bench[0]).toBeNull(); // still merged
    tickRemMerges(G, G.players['0']); // 1→0 → return
    expect(ally.hpMax).toBe(baseMax);
    expect(G.players['0'].bench[0]).toBe(rem);
    expect(rem.zone).toBe('bench');
    expect(ally.attached?.some((a) => a.cardId === 'hero_rem')).toBe(false);
  });

  it('returns a merged Rem to the bench if the bearer dies while merged', () => {
    const { G, ally, rem } = setup();
    mergeByHand(G, rem, ally, 1);
    expect(G.players['0'].bench[0]).toBeNull();
    damageUnit(G, ally, 999, 'pure'); // lethal
    reapDead(G, G.players['0']);
    expect(G.players['0'].bench[0]).toBe(rem); // rescued, not lost with the body
    expect(rem.zone).toBe('bench');
    expect(rem.remMergeTurnsLeft).toBeUndefined();
  });

  it('drafted first, bench-only Rem still starts on the bench (not Active)', () => {
    const ps = buildPlayer(allocatorFor(newCounters()), '0', ['hero_rem', 'hero_warden', 'hero_mo_krill', 'hero_lady_geist']);
    expect(ps.active?.cardId).toBe('hero_warden');       // first non-bench-only
    expect(ps.active?.cardId).not.toBe('hero_rem');
    expect(ps.bench.some((b) => b?.cardId === 'hero_rem')).toBe(true);
  });
});
