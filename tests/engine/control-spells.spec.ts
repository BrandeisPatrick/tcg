import { describe, it, expect } from 'vitest';
import type { GameState } from '@/engine/types';
import { ABILITIES_BY_ID } from '@/abilities';
import { addStatus } from '@/engine/statusOps';
import { freshReadyGame, makeHero } from './_helpers';

const run = (id: string, G: GameState, args: any) =>
  ABILITIES_BY_ID[id].run(G, { movingPlayer: '0' }, args);

describe('Knockdown — now a pure 1-turn stun', () => {
  it('applies Stun 1 and no Disarm', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    run('eff_knockdown', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'stun')?.duration).toBe(1);
    expect(t.statuses.find((s) => s.id === 'disarm')).toBeUndefined();
  });
});

describe('Silence Glyph', () => {
  it('deals 2 spirit and Silences the enemy Active for 2 turns', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    t.hpMax = 20; t.hp = 20;
    run('eff_silence_glyph', G, { target: t });
    expect(t.hp).toBe(18); // 2 spirit (caster has 0 spirit)
    expect(t.statuses.find((s) => s.id === 'silenced')?.duration).toBe(2);
  });
});

describe('Curse', () => {
  it('applies Silence 3 + Disarm 3', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    run('eff_curse', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'silenced')?.duration).toBe(3);
    expect(t.statuses.find((s) => s.id === 'disarm')?.duration).toBe(3);
  });
});

describe('Debuff Remover', () => {
  it('cleanses debuffs (incl. CC) and grants Shield 2', () => {
    const G = freshReadyGame();
    const t = G.players['0'].active!;
    addStatus(G, t, 'bleed', 2, 3);
    addStatus(G, t, 'stun', 1, 2);
    run('eff_debuff_remover', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'bleed')).toBeUndefined();
    expect(t.statuses.find((s) => s.id === 'stun')).toBeUndefined();
    expect(t.statuses.find((s) => s.id === 'shield')?.value).toBe(2);
  });
});

describe('Unstoppable (spell)', () => {
  it('grants Unstoppable 1 and cleanses existing CC', () => {
    const G = freshReadyGame();
    const t = G.players['0'].active!;
    addStatus(G, t, 'stun', 1, 2);
    run('eff_unstoppable_cast', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'unstoppable')?.duration).toBe(1);
    expect(t.statuses.find((s) => s.id === 'stun')).toBeUndefined(); // cleansed on apply
  });
});

describe('Echo Shard', () => {
  it("recasts the active hero's skill (damage lands again)", () => {
    const G = freshReadyGame();
    G.players['0'].active = makeHero('hero_lady_geist', '0', 'active', 0); // skill = 2 spirit
    const enemy = G.players['1'].active!;
    enemy.hpMax = 20; enemy.hp = 20;
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(18); // Lady Geist skill base 2
  });

  it('bypasses the one-skill-per-turn cap', () => {
    const G = freshReadyGame();
    G.players['0'].active = makeHero('hero_lady_geist', '0', 'active', 0);
    G.players['0'].skillUsedThisTurn = true; // already skilled this turn
    const enemy = G.players['1'].active!;
    enemy.hpMax = 20; enemy.hp = 20;
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(18); // still recast despite the flag
  });

  it('re-fires onBearerSkillUsed → cast-payoff gear procs again (Mystic Burst)', () => {
    const G = freshReadyGame();
    const hero = makeHero('hero_lady_geist', '0', 'active', 0);
    hero.attached = [{
      iid: 'eq-mb', cardId: 'mystic_burst', ownerId: '0', zone: 'equipment',
      attachedTo: hero.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false,
    }];
    G.players['0'].active = hero;
    const enemy = G.players['1'].active!;
    enemy.hpMax = 20; enemy.hp = 20;
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(16); // 2 (skill) + 2 (Mystic Burst on skill use)
  });

  it('fizzles on a skill-less (passive) hero', () => {
    const G = freshReadyGame(); // P0 active = Haze (passive, no skill)
    const enemy = G.players['1'].active!;
    const hp0 = enemy.hp;
    expect(() => run('eff_echo_shard', G, {})).not.toThrow();
    expect(enemy.hp).toBe(hp0);
  });
});
