import { describe, it, expect } from 'vitest';
import { freshReadyGame, makeHero } from './_helpers';
import { resolveAttackPhase } from '@/engine/combat';
import { tickCastingPulses, addStatus } from '@/engine/statusOps';
import { effectiveAtk, grantExtraAttacks, MAX_EXTRA_ATTACKS } from '@/engine/util';
import { getAbility } from '@/abilities';
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
    resolveAttackPhase(G, '0');
    const shieldAfter = def.statuses.find((s) => s.id === 'shield')!.value;
    expect(shieldBefore - shieldAfter).toBe(dmg * 2); // primary + 1 full Extra Attack
  });

  it('Extra Attack sources STACK additively', () => {
    const atk = makeHero('hero_haze', '0');
    grantExtraAttacks(atk, 1); // Burst Fire
    grantExtraAttacks(atk, 1); // Active Reload
    grantExtraAttacks(atk, 1); // Fixation
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
    resolveAttackPhase(G, '0');
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
    resolveAttackPhase(G, '0');
    expect(def.statuses.find((s) => s.id === 'bleed')?.value).toBe(3);
  });

  it('Burst Fire (equipment) and Active Reload (spell) stack Extra Attack', () => {
    const G = freshReadyGame();
    const dyn = makeHero('hero_dynamo', '0', 'active', 0); // plain active
    G.players['0'].active = dyn;
    getAbility('eff_burst_fire')!.run(G, { movingPlayer: '0' }, { source: dyn }); // +1 (each turn)
    getAbility('eff_active_reload')!.run(G, { movingPlayer: '0' }, {});           // +1 (spell → active)
    expect(extraOf(dyn)).toBe(2);
  });

  it('Fixation grants Extra Attack only on the primary swing (no endless chain)', () => {
    const haze = makeHero('hero_haze', '0');
    // Primary swing → grants 1.
    getAbility('passive_haze_fixation')!.run({} as GameState, { movingPlayer: '0' }, { source: haze, params: { primary: true } });
    expect(extraOf(haze)).toBe(1);
    // A follow-up / extra swing (primary:false) does NOT re-grant.
    getAbility('passive_haze_fixation')!.run({} as GameState, { movingPlayer: '0' }, { source: haze, params: { primary: false } });
    expect(extraOf(haze)).toBe(1);
  });
});

describe('Haze Fixation — reactive follow-up swing', () => {
  it('Haze attacks twice (primary + Fixation extra) through the attack phase', () => {
    const G = freshReadyGame();
    const haze = makeHero('hero_haze', '0', 'active', 0);
    G.players['0'].active = haze;
    soloAttacker(G, '0');
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 99;
    const dmg = effectiveAtk(haze);
    resolveAttackPhase(G, '0'); // no start-of-turn grant; Fixation fires on her swing
    expect(def.hp).toBe(99 - dmg * 2); // primary + one Fixation Extra Attack
    expect(extraOf(haze)).toBe(0); // consumed + cleared
  });

  it('a disarmed Haze gets no Fixation extra (she never attacked)', () => {
    const G = freshReadyGame();
    const haze = makeHero('hero_haze', '0', 'active', 0);
    G.players['0'].active = haze;
    soloAttacker(G, '0');
    addStatus(G, haze, 'disarm', 1, 2); // can't attack → effectiveAtk 0
    const def = G.players['1'].active!;
    const hp0 = def.hp;
    resolveAttackPhase(G, '0');
    expect(def.hp).toBe(hp0); // no damage
    expect(extraOf(haze)).toBe(0); // Fixation never fired
  });
});

describe('Active Reload — Extra Attack spell', () => {
  it('grants the caster\'s Active hero Extra Attack 1', () => {
    const G = freshReadyGame();
    const dyn = makeHero('hero_dynamo', '0', 'active', 0);
    G.players['0'].active = dyn;
    getAbility('eff_active_reload')!.run(G, { movingPlayer: '0' }, {});
    expect(extraOf(dyn)).toBe(1);
  });
});

describe('Lifesteal — heal half the damage dealt', () => {
  it('Drifter Bloodscent heals floor(damage/2) per attack', () => {
    const G = freshReadyGame();
    const drifter = makeHero('hero_drifter', '0', 'active', 0);
    drifter.hp = 1; drifter.hpMax = 20;
    // Bloodscent reads the dealt amount plumbed in via params.dealt.
    getAbility('passive_drifter_bloodscent')!.run(G, { movingPlayer: '0' }, { source: drifter, params: { dealt: 4 } });
    expect(drifter.hp).toBe(1 + 2); // floor(4/2) = 2
  });

  it('Drifter heals through a real attack phase (half his dealt damage)', () => {
    const G = freshReadyGame();
    const drifter = makeHero('hero_drifter', '0', 'active', 0); // atk 3
    drifter.hp = 1; drifter.hpMax = 20;
    G.players['0'].active = drifter;
    soloAttacker(G, '0');
    const def = G.players['1'].active!;
    def.hp = def.hpMax = 99; // survives; no retaliation KO concerns
    const retal = effectiveAtk(def); // defender's swing back at Drifter
    resolveAttackPhase(G, '0');
    // Drifter dealt 3 → heals floor(3/2)=1, then ate `retal` from retaliation.
    expect(drifter.hp).toBe(1 + 1 - retal);
  });

  it('Lady Geist Life Drain heals for half the spirit damage dealt', () => {
    const G = freshReadyGame();
    const geist = makeHero('hero_lady_geist', '0', 'active', 0);
    geist.hp = 1; geist.hpMax = 10;
    G.players['0'].active = geist;
    const enemy = G.players['1'].active!;
    enemy.hp = enemy.hpMax = 20;
    getAbility('skill_lady_geist')!.run(G, { movingPlayer: '0' }, { source: geist, target: enemy });
    expect(enemy.hp).toBe(20 - 3);          // dealt 3 spirit
    expect(geist.hp).toBe(1 + Math.floor(3 / 2)); // healed half = 1
  });
});

describe('Ricochet — canon AoE on attack', () => {
  it('each attack bounces 2 to every enemy bench hero, scaling with Extra Attack', () => {
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
    grantExtraAttacks(atk, 1); // 2 swings → 2 ricochet pulses → 4 to the bench hero
    resolveAttackPhase(G, '0');
    expect(before - bench0.hp).toBe(4);
  });
});

describe('Channeled board-wipe archetype', () => {
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

  it('Dynamo: heavy channel locks out attacks AND skills', () => {
    const { G, self } = channelGame('hero_dynamo');
    getAbility('eff_ult_dynamo')!.run(G, { movingPlayer: '0' }, {});
    expect(self.statuses.find((s) => s.id === 'casting')?.duration).toBe(3);
    expect(effectiveAtk(self)).toBe(0); // attack gate
    expect(self.statuses.some((s) => s.id === 'casting')).toBe(true); // skill gate keys off this
  });

  it('Dynamo: pulses clear the enemy board over the channel duration', () => {
    const { G, self, enemies } = channelGame('hero_dynamo');
    enemies.forEach((e) => { e.hp = e.hpMax = 9; }); // 3/turn × 3 turns = 9 → dead by pulse 3
    getAbility('eff_ult_dynamo')!.run(G, { movingPlayer: '0' }, {});
    // Simulate three end-of-turn pulses (channel value stays flat at 3).
    for (let i = 0; i < 3; i++) tickCastingPulses(G, G.players['0']);
    expect(self.statuses.find((s) => s.id === 'casting')?.value).toBe(3); // no escalation
    expect(enemies.every((e) => e.hp <= 0)).toBe(true);
  });

  it('Seven: channel escalates 2 → 3 → 4 each pulse', () => {
    const { G, self } = channelGame('hero_seven');
    getAbility('eff_ult_seven')!.run(G, { movingPlayer: '0' }, {});
    const casting = () => self.statuses.find((s) => s.id === 'casting')!;
    expect(casting().value).toBe(2);
    tickCastingPulses(G, G.players['0']);
    expect(casting().value).toBe(3);
    tickCastingPulses(G, G.players['0']);
    expect(casting().value).toBe(4);
  });

  it('Warden: light channel keeps him attacking and heals him from the drain', () => {
    const { G, self, enemies } = channelGame('hero_warden');
    self.hp = 1; // hurt so the drain heal is visible
    getAbility('eff_ult_warden')!.run(G, { movingPlayer: '0' }, {});
    expect(self.statuses.some((s) => s.id === 'casting_light')).toBe(true);
    expect(self.statuses.some((s) => s.id === 'casting')).toBe(false);
    expect(effectiveAtk(self)).toBeGreaterThan(0); // NOT locked out
    const before = self.hp;
    tickCastingPulses(G, G.players['0']);
    expect(self.hp).toBeGreaterThan(before); // drained HP back
    expect(enemies.every((e) => e.hp < 10)).toBe(true);
  });

  it('Stun interrupts a channel pulse (no damage that turn)', () => {
    const { G, self, enemies } = channelGame('hero_dynamo');
    getAbility('eff_ult_dynamo')!.run(G, { movingPlayer: '0' }, {});
    addStatus(G, self, 'stun', 1, 2);
    const before = enemies.map((e) => e.hp);
    tickCastingPulses(G, G.players['0']);
    enemies.forEach((e, i) => expect(e.hp).toBe(before[i])); // pulse skipped
  });
});
