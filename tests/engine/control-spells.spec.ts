import { describe, it, expect } from 'vitest';
import type { GameState } from '@/engine/types';
import { ABILITIES_BY_ID } from '@/abilities';
import { addStatus } from '@/engine/statusOps';
import { INVALID, perform } from '@/engine/engine';
import { playBlocked } from '@/engine/legality';
import { isBlocked, itemPrice } from '@/engine/query';
import { DEBUFF_IDS } from '@/statuses';
import { freshReadyGame, giveCard, makeHero } from './_helpers';

const run = (id: string, G: GameState, args: any) =>
  ABILITIES_BY_ID[id].run(G, { movingPlayer: '0' }, args);

describe('Knockdown — a 1-turn stun and the slam (one play, 2026-11-16)', () => {
  it('applies Stun 1 and no Disarm, and deals 1 + Spirit spirit damage', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    t.hpMax = 20; t.hp = 20;
    G.players['0'].active!.spiritMod = 2;
    run('eff_knockdown', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'stun')?.duration).toBe(1);
    expect(t.statuses.find((s) => s.id === 'disarm')).toBeUndefined();
    expect(t.hp).toBe(20 - 3);
  });

  it('brings a flying hero down: it loses Flying and is Stunned 2 turns, and the slam cannot miss', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const G = freshReadyGame();
      G.seed = seed;
      const t = G.players['1'].active!;
      t.hpMax = 20; t.hp = 20;
      addStatus(G, t, 'flying', 1, 3);
      run('eff_knockdown', G, { target: t });
      expect(t.statuses.find((s) => s.id === 'flying'), `seed ${seed}`).toBeUndefined();
      expect(t.statuses.find((s) => s.id === 'stun')?.duration, `seed ${seed}`).toBe(2);
      expect(t.hp, `seed ${seed}`).toBe(19);
    }
  });
});

describe('Disarming Hex (one play, 2026-11-16)', () => {
  it('Disarms any enemy and cuts its Bullet Resist by 3, both for 2 turns', () => {
    const G = freshReadyGame();
    const t = G.players['1'].bench[0]!;
    run('eff_disarming_hex', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'disarm')?.duration).toBe(2);
    expect(t.statuses.find((s) => s.id === 'bullet_resist_down')).toMatchObject({ value: 3, duration: 2 });
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
  it('applies Silence 4 + Disarm 4 (one play, 2026-11-16: it was 3)', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    run('eff_curse', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'silenced')?.duration).toBe(4);
    expect(t.statuses.find((s) => s.id === 'disarm')?.duration).toBe(4);
  });

  it('strips its buffs — a channel with them, so a curse interrupts one — and leaves its debuffs', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    addStatus(G, t, 'shield', 7, 999);
    addStatus(G, t, 'bullet_resist', 6, 3);
    addStatus(G, t, 'casting', 2, 2);
    addStatus(G, t, 'bleed', 2, 2);
    run('eff_curse', G, { target: t });
    expect(t.statuses.map((s) => s.id).sort()).toEqual(['bleed', 'disarm', 'silenced']);
  });

  it('lands on any one enemy hero, bench included: no skill and no attack', () => {
    const G = freshReadyGame();
    const curse = giveCard(G, '0', 'curse');
    G.players['0'].souls = itemPrice('curse');
    const benched = G.players['1'].bench[0]!;
    // Never one of your own.
    expect(playBlocked(G, '0', curse.iid, G.players['0'].active!.iid)).toBe('target');
    expect(playBlocked(G, '0', curse.iid, G.players['1'].active!.iid)).toBeNull();
    expect(perform(G, '0', { type: 'playCard', cardIid: curse.iid, heroIid: benched.iid })).not.toBe(INVALID);
    expect(isBlocked(benched, 'skill')).toBe(true);
    expect(isBlocked(benched, 'attack')).toBe(true);
    expect(G.players['0'].discard).toContain(curse); // a spell: played once, then on the discard pile
  });
});

describe('Debuff Remover', () => {
  it('cleanses debuffs (incl. CC) and grants Shield 4', () => {
    const G = freshReadyGame();
    const t = G.players['0'].active!;
    addStatus(G, t, 'bleed', 2, 3);
    addStatus(G, t, 'stun', 1, 2);
    run('eff_debuff_remover', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'bleed')).toBeUndefined();
    expect(t.statuses.find((s) => s.id === 'stun')).toBeUndefined();
    expect(t.statuses.find((s) => s.id === 'shield')?.value).toBe(4);
  });
});

describe('Unstoppable (spell)', () => {
  it('grants Unstoppable for 3 turns and Invulnerable for 1, and cleanses every debuff (one play, 2026-11-16)', () => {
    const G = freshReadyGame();
    const t = G.players['0'].active!;
    addStatus(G, t, 'stun', 1, 2);
    addStatus(G, t, 'bleed', 2, 2);
    addStatus(G, t, 'bullet_resist_down', 2, 2);
    run('eff_unstoppable_cast', G, { target: t });
    expect(t.statuses.find((s) => s.id === 'unstoppable')?.duration).toBe(3);
    expect(t.statuses.find((s) => s.id === 'invulnerable')?.duration).toBe(1);
    expect(t.statuses.filter((s) => DEBUFF_IDS.has(s.id))).toEqual([]); // every debuff, not the CC alone
  });
});

describe('Echo Shard', () => {
  // Every hero of the side echoes its skill since 2026-11-16; these read the
  // Active's own, so the bench is cleared first.
  const alone = (G: GameState) => { G.players['0'].bench = [null, null, null]; };

  it("recasts the active hero's skill (damage lands again)", () => {
    const G = freshReadyGame();
    G.players['0'].active = makeHero('hero_lady_geist', '0', 'active', 0); // Essence Bomb: {sp:1} to every enemy
    const enemy = G.players['1'].active!;
    enemy.hpMax = 20; enemy.hp = 20;
    G.players['0'].souls = 0;
    alone(G);
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(19); // Essence Bomb, Spirit 0
    expect(G.players['0'].souls).toBe(0); // the recast costs no souls
  });

  it('bypasses the once-a-turn skill limit', () => {
    const G = freshReadyGame();
    G.players['0'].active = makeHero('hero_lady_geist', '0', 'active', 0);
    G.players['0'].active.skillUsedThisTurn = true; // already skilled this turn
    const enemy = G.players['1'].active!;
    enemy.hpMax = 20; enemy.hp = 20;
    alone(G);
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(19); // still recast despite the flag
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
    alone(G);
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(18); // 1 (Essence Bomb) + 1 (Mystic Burst on skill use)
  });

  it('fizzles on a skill-less (passive) hero', () => {
    const G = freshReadyGame(); // P0 active = Haze (passive, no skill)
    const enemy = G.players['1'].active!;
    const hp0 = enemy.hp;
    alone(G);
    expect(() => run('eff_echo_shard', G, {})).not.toThrow();
    expect(enemy.hp).toBe(hp0);
  });

  it('every standing hero of the side echoes its skill, and the Active gains Bullet Resist 3 and Spirit Resist 3 for 2 turns', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active = makeHero('hero_lady_geist', '0', 'active', 0);              // Essence Bomb: 1 to every enemy
    me.bench = [makeHero('hero_lady_geist', '0', 'bench', 1), null, null];  // a second one on the bench
    const enemy = G.players['1'].active!;
    enemy.hpMax = 20; enemy.hp = 20;
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(18);                                               // both bombs
    expect(me.active.statuses.find((s) => s.id === 'bullet_resist')).toMatchObject({ value: 3, duration: 2 });
    expect(me.active.statuses.find((s) => s.id === 'spirit_resist')).toMatchObject({ value: 3, duration: 2 });
  });

  it('passes over a hero a Silence holds', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active = makeHero('hero_lady_geist', '0', 'active', 0);
    me.bench = [makeHero('hero_lady_geist', '0', 'bench', 1), null, null];
    addStatus(G, me.bench[0]!, 'silenced', 1, 2);
    const enemy = G.players['1'].active!;
    enemy.hpMax = 20; enemy.hp = 20;
    run('eff_echo_shard', G, {});
    expect(enemy.hp).toBe(19);
  });
});
