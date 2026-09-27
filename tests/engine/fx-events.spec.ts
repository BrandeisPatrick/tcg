import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { freshReadyGame, makeHero, configureReadyMatch } from './_helpers';
import { damageUnit, healUnit } from '@/engine/damage';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import { withCast } from '@/engine/castContext';
import { getAbility } from '@/abilities';
import type { GameState, HitFx, StatusFx, HealFx, CastFx } from '@/engine/types';

/**
 * The board-FX stream (`G.fx`) is what the match screen animates. These pin
 * the contract the FxLayer relies on: who is named as the source, which hits
 * are left to the combat choreographer, and which tags the unique effects
 * carry.
 */

const hits = (G: GameState) => G.fx.filter((e): e is HitFx => e.kind === 'hit');

describe('board FX stream — hits', () => {
  it('a skill hit names its caster and cast kind', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    withCast(haze, 'skill', () => damageUnit(G, abrams, 2, 'spirit'));
    const h = hits(G);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      iid: abrams.iid, amount: 2, type: 'spirit', ko: false, cast: 'skill',
      source: { iid: haze.iid, cardId: 'hero_haze', owner: '0' },
    });
    expect(h[0].seq).toBeGreaterThan(0);
  });

  it('the basic swing is left to the choreographer (no untagged attack hit)', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    withCast(haze, 'attack', () => damageUnit(G, abrams, 2, 'attack', 'Haze'));
    expect(hits(G)).toHaveLength(0);
    expect(abrams.hp).toBe(3);
  });

  it('a tagged proc riding on a swing is kept and filed as a proc (Tesla)', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const bench = G.players['1'].bench[0]!;
    withCast(haze, 'attack', () => damageUnit(G, bench, 1, 'attack', 'Tesla Bullets', { tag: 'tesla' }));
    expect(hits(G)[0]).toMatchObject({ tag: 'tesla', cast: 'proc', type: 'attack', iid: bench.iid });
  });

  it('a start-of-turn tick with no cast frame is filed as a tick (Bleed)', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    addStatus(G, abrams, 'bleed', 2, 2);
    G.fx = [];
    tickStartOfTurn(G, G.players['1']);
    expect(hits(G)[0]).toMatchObject({ tag: 'bleed', type: 'pure', cast: 'tick', amount: 2 });
  });

  it('a KO is flagged on the hit that drops the unit to 0', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    withCast(haze, 'skill', () => damageUnit(G, abrams, 99, 'spirit'));
    expect(hits(G)[0].ko).toBe(true);
  });
});

describe("board FX stream — Djinn's Mark", () => {
  it('each stack stamps the mark and the 4th detonates with tag, stacks and Mirage as source', () => {
    const G = freshReadyGame();
    const mirage = makeHero('hero_mirage', '0');
    const target = G.players['1'].active!;
    target.hp = 30; target.hpMax = 30;
    const passive = getAbility('passive_mirage_djinns_mark')!;
    for (let i = 0; i < 4; i++) passive.run(G, { movingPlayer: '0' }, { source: mirage, target });
    const marks = G.fx.filter((e): e is StatusFx => e.kind === 'status' && e.statusId === 'djinns_mark');
    expect(marks.map((m) => m.value)).toEqual([1, 2, 3, 4]);
    const det = hits(G).find((h) => h.tag === 'djinns_mark');
    expect(det).toBeDefined();
    expect(det).toMatchObject({ stacks: 4, amount: 12, type: 'spirit', cast: 'proc', source: { iid: mirage.iid } });
    expect(target.statuses.some((s) => s.id === 'djinns_mark')).toBe(false);
  });

  it('the expiry detonation is a tagged tick too', () => {
    const G = freshReadyGame();
    const target = G.players['1'].active!;
    target.hp = 30; target.hpMax = 30;
    addStatus(G, target, 'djinns_mark', 2, 1);
    G.fx = [];
    tickStartOfTurn(G, G.players['1']);
    expect(hits(G)[0]).toMatchObject({ tag: 'djinns_mark', stacks: 2, amount: 6, cast: 'tick' });
  });
});

describe('board FX stream — mitigation, heals, statuses', () => {
  it('a Shield absorb is surfaced even when HP does not move; a break is flagged', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    addStatus(G, abrams, 'shield', 3, 999);
    G.fx = [];
    damageUnit(G, abrams, 2, 'spirit');
    expect(G.fx.map((e) => e.kind)).toEqual(['shield']);
    expect(G.fx[0]).toMatchObject({ absorbed: 2, broken: false, type: 'spirit' });
    G.fx = [];
    damageUnit(G, abrams, 3, 'spirit');   // 1 left on the shield, 2 spill
    expect(G.fx.map((e) => e.kind)).toEqual(['shield', 'hit']);
    expect(G.fx[0]).toMatchObject({ absorbed: 1, broken: true });
    expect(G.fx[1]).toMatchObject({ amount: 2 });
  });

  it('Unstoppable shrugging off damage or CC is surfaced as immune', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    addStatus(G, abrams, 'unstoppable', 1, 1);
    G.fx = [];
    damageUnit(G, abrams, 5, 'spirit');
    addStatus(G, abrams, 'stun', 1, 1);
    expect(G.fx).toMatchObject([
      { kind: 'immune', what: 'damage' },
      { kind: 'immune', what: 'stun' },
    ]);
    expect(abrams.hp).toBe(5);
  });

  it('a heal is emitted with its amount; lifesteal points back at the victim', () => {
    const G = freshReadyGame();
    const geist = makeHero('hero_lady_geist', '0');
    geist.hp = 1;
    const target = G.players['1'].active!;
    withCast(geist, 'skill', () => getAbility('skill_lady_geist')!.run(G, { movingPlayer: '0' }, { source: geist, target }));
    const hit = hits(G)[0];
    expect(hit).toMatchObject({ tag: 'life_drain', amount: 3 });
    const heal = G.fx.find((e): e is HealFx => e.kind === 'heal')!;
    expect(heal).toMatchObject({ iid: geist.iid, amount: 1, tag: 'lifesteal', from: { iid: target.iid } });
    // A full-HP unit heals for 0 — nothing to animate.
    const fresh = G.players['1'].bench[0]!;
    G.fx = [];
    healUnit(G, fresh, 3);
    expect(G.fx).toHaveLength(0);
  });

  it('a status landing carries its resulting magnitude and class', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    addStatus(G, abrams, 'bleed', 2, 2);
    addStatus(G, abrams, 'bleed', 2, 2);   // stacks to 3 (cap)
    addStatus(G, abrams, 'shield', 4, 999);
    const st = G.fx.filter((e): e is StatusFx => e.kind === 'status');
    expect(st.map((s) => [s.statusId, s.value, s.debuff])).toEqual([
      ['bleed', 2, true], ['bleed', 3, true], ['shield', 4, false],
    ]);
  });

  it('Charged running out stamps the Stun with the discharge tag', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    addStatus(G, abrams, 'charged', 1, 1);
    G.fx = [];
    tickStartOfTurn(G, G.players['1']);
    const stun = G.fx.find((e): e is StatusFx => e.kind === 'status' && e.statusId === 'stun');
    expect(stun).toMatchObject({ tag: 'discharge' });
  });
});

describe('board FX stream — casts and the turn flush', () => {
  beforeAll(configureReadyMatch);

  it('useSkill pushes the cast first, then its effects; turn start flushes the stream', () => {
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    // Give P0 a caster: swap Lash (bench, enemyAny skill) into the Active slot
    // via the promotion-free path — build state directly through moves is
    // awkward, so read the bench and use the skill from the bench-only-safe
    // hero list. Lash's Ground Strike targets any enemy and can be cast from
    // the Active slot only, so retreat is not needed: use P0's Active (Haze)
    // has no skill — instead pick Paige's Plot Armor (allyHero) from bench?
    // Skills are Active-only, so move Lash up (retreat costs 2 souls: give them).
    let s = client.getState()!;
    let G = s.G as GameState;
    const lash = G.players['0'].bench.find((b) => b?.cardId === 'hero_lash')!;
    // Fund the retreat + the skill.
    (client as any).store.dispatch({ type: 'UPDATE', state: { ...s, G: { ...G, players: { ...G.players, '0': { ...G.players['0'], souls: 5 } } } } });
    client.moves.moveHero!(lash.slot, 0);
    s = client.getState()!; G = s.G as GameState;
    expect(G.players['0'].active?.cardId).toBe('hero_lash');
    const enemy = G.players['1'].active!;
    const before = G.fx.length;
    client.moves.useSkill!(G.players['0'].active!.iid, enemy.iid);
    s = client.getState()!; G = s.G as GameState;
    const fresh = G.fx.slice(before);
    expect(fresh[0].kind).toBe('cast');
    expect(fresh[0] as CastFx).toMatchObject({ castKind: 'skill', by: '0', cardId: 'hero_lash', targetIid: enemy.iid });
    expect((fresh[0] as CastFx).iid).toBe(G.players['0'].active!.iid);
    const kinds = fresh.map((e) => e.kind);
    expect(kinds).toContain('hit');
    expect(kinds.filter((k) => k === 'status')).toHaveLength(2);  // Vulnerable: bullet + spirit resist down
    // seq strictly increases in push order
    for (let i = 1; i < fresh.length; i++) expect(fresh[i].seq).toBeGreaterThan(fresh[i - 1].seq);

    client.moves.completeAction!();
    client.moves.endTurn!();
    s = client.getState()!; G = s.G as GameState;
    // The rival's turn began: the stream was flushed before its own ticks.
    expect(G.fx.every((e) => e.kind !== 'cast')).toBe(true);
  });
});
