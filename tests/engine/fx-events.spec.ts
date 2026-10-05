import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { freshReadyGame, makeAttack, makeHero, configureReadyMatch } from './_helpers';
import { damageUnit, healUnit } from '@/engine/damage';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import { withCast } from '@/engine/castContext';
import { getAbility } from '@/abilities';
import type { CardInstance, GameState, HitFx, ShieldFx, StatusFx, HealFx, CastFx, SwingFx } from '@/engine/types';

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

  it('the basic swing is reported like any other hit, filed cast "attack"', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    withCast(haze, 'attack', () => damageUnit(G, abrams, 2, 'attack', 'Haze'));
    expect(hits(G)).toHaveLength(1);
    expect(hits(G)[0]).toMatchObject({ iid: abrams.iid, amount: 2, type: 'attack', cast: 'attack', source: { iid: haze.iid } });
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

  it('a basic swing into a Shield is reported: the absorb is filed cast "attack"', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    addStatus(G, abrams, 'shield', 9, 999);
    G.fx = [];
    makeAttack(G, '0');
    const shield = G.fx.filter((e): e is ShieldFx => e.kind === 'shield' && e.iid === abrams.iid);
    expect(shield.length).toBeGreaterThan(0);
    expect(shield.every((e) => e.cast === 'attack' && e.type === 'attack')).toBe(true);
    expect(abrams.statuses.find((s) => s.id === 'shield')!.value).toBeLessThan(9); // it did absorb
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

describe('board FX stream — the turn\'s attack', () => {
  /** P0's Active is a plain Dynamo (no onAttack passive, so one swing) against Abrams. */
  function plainAttack(extra?: (G: GameState, attacker: CardInstance, defender: CardInstance) => void) {
    const G = freshReadyGame();
    const attacker = G.players['0'].active = makeHero('hero_dynamo', '0', 'active', 0);
    const defender = G.players['1'].active!;
    defender.hpMax = defender.hp = 40;
    extra?.(G, attacker, defender);
    G.fx = [];
    makeAttack(G, '0');
    return { G, attacker, defender };
  }
  const kinds = (G: GameState) => G.fx.map((e) => e.kind);

  it('each swing is reported BEFORE its damage: the swing, then the hit it made', () => {
    const { G, attacker, defender } = plainAttack();
    expect(kinds(G)).toEqual(['swing', 'hit']);
    expect(G.fx[0]).toMatchObject({ kind: 'swing', iid: attacker.iid, targetIid: defender.iid, index: 0, raw: 3, targetHp: 40 });
    expect((G.fx[0] as SwingFx).label).toBeUndefined();
    expect(G.fx[1]).toMatchObject({ kind: 'hit', iid: defender.iid, amount: 3, cast: 'attack', source: { iid: attacker.iid } });
    expect(G.fx[1].seq).toBeGreaterThan(G.fx[0].seq);
  });

  it('an Extra Attack is its own swing, labelled, indexed and starting from the HP the last one left', () => {
    const { G } = plainAttack((_G, attacker) => attacker.statuses.push({ id: 'extra_attack', value: 2, duration: 99 }));
    const swings = G.fx.filter((e): e is SwingFx => e.kind === 'swing');
    expect(swings.map((s) => [s.index, s.raw, s.label, s.targetHp])).toEqual([
      [0, 3, undefined, 40], [1, 3, 'Extra Attack', 37], [2, 3, 'Extra Attack', 34],
    ]);
    expect(kinds(G)).toEqual(['swing', 'hit', 'swing', 'hit', 'swing', 'hit']);
  });

  it("a swing that carries Frenzy's bonus says so, and its raw power includes it", () => {
    const { G } = plainAttack((_G, attacker) => {
      (attacker.attached ??= []).push({
        iid: 'eq-frenzy', cardId: 'frenzy', ownerId: '0', zone: 'equipment', attachedTo: attacker.iid,
        hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
      });
      attacker.hpMax = 10; attacker.hp = 2; // below half
    });
    expect(G.fx[0]).toMatchObject({ kind: 'swing', raw: 6, label: 'Frenzy: +3 <½ HP' });
  });

  it('a swing into a Shield is the swing, the absorb and the spill — all filed "attack"', () => {
    const { G } = plainAttack((G0, _a, defender) => addStatus(G0, defender, 'shield', 2, 999));
    expect(kinds(G)).toEqual(['swing', 'shield', 'hit']);
    expect(G.fx[1]).toMatchObject({ absorbed: 2, broken: true, cast: 'attack' });
    expect(G.fx[2]).toMatchObject({ amount: 1, cast: 'attack' });
  });

  it('a swing at an Unstoppable target is the swing and the shrug, filed "attack"', () => {
    const { G, defender } = plainAttack((G0, _a, def) => addStatus(G0, def, 'unstoppable', 1, 1));
    expect(kinds(G)).toEqual(['swing', 'immune']);
    expect(G.fx[1]).toMatchObject({ iid: defender.iid, what: 'damage', cast: 'attack' });
  });

  it('what a swing sets off keeps its own cast and tag, after the swing it rode on (Tesla)', () => {
    const { G } = plainAttack((G0, attacker) => {
      (attacker.attached ??= []).push({
        iid: 'eq-tesla', cardId: 'tesla_bullets', ownerId: '0', zone: 'equipment', attachedTo: attacker.iid,
        hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
      });
    });
    // The swing opens its stretch of the stream; the reaction (a hit on the
    // bench) is pushed from inside the swing's damage, ahead of the swing's own hit.
    expect(kinds(G)).toEqual(['swing', 'hit', 'hit']);
    expect(G.fx[1]).toMatchObject({ cast: 'proc', tag: 'tesla' });
    expect(G.fx[2]).toMatchObject({ cast: 'attack', tag: undefined });
  });
});

describe('board FX stream — casts and the turn flush', () => {
  beforeAll(configureReadyMatch);

  it('useSkill pushes the cast first, then its effects; the end of the turn flushes the stream', () => {
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
    // The rival's turn began: the stream was flushed before it, so the skill's cast is gone.
    expect(G.fx.every((e) => e.kind !== 'cast')).toBe(true);
  });

  it('what the end of the turn does reaches the board with the next turn\'s start, in one batch', () => {
    // P0 channels (a pulse at the end of its turn) and has a hero one exp short of a level;
    // P1's Abrams will regenerate when its turn starts. A stale event is left in the stream.
    const G0 = freshReadyGame();
    G0.turnNumber = 3;
    G0.draftTurnsOffset = 1 - 3;
    const p0 = G0.players['0'];
    addStatus(G0, p0.active!, 'casting_light', 2, 3);
    const lash = p0.bench[1]!;
    lash.level = 1; lash.exp = 4;
    G0.fx = [{ kind: 'revive', iid: 'stale', seq: 1 }];
    G0.counters.fx = 1;

    const client = Client({ game: { ...DeadlockGame, setup: () => G0 } as never, numPlayers: 2 });
    client.start();
    const snapshots: GameState[] = [];
    client.subscribe((s) => { if (s) snapshots.push(s.G as GameState); });
    client.moves.endTurn!();
    const G = client.getState()!.G as GameState;

    expect(G.fx.some((e) => 'iid' in e && e.iid === 'stale')).toBe(false); // flushed
    const labels = G.fx.map((e) => (e.kind === 'hit' || e.kind === 'heal' ? `${e.kind}:${e.tag}` : e.kind));
    const pulses = labels.filter((l) => l === 'hit:channel');
    expect(pulses.length).toBe(4);                      // the whole rival board
    expect(labels).toContain('levelup');                // the end-of-turn exp
    expect(labels).toContain('heal:regen');             // the rival's start-of-turn tick
    // end of P0's turn first, then the start of P1's
    expect(labels.lastIndexOf('hit:channel')).toBeLessThan(labels.indexOf('heal:regen'));
    expect(labels.indexOf('levelup')).toBeLessThan(labels.indexOf('heal:regen'));
    for (let i = 1; i < G.fx.length; i++) expect(G.fx[i].seq).toBeGreaterThan(G.fx[i - 1].seq);
    // and the board saw it as the ONE state after endTurn, not an intermediate one
    expect(snapshots.at(-1)!.fx.length).toBe(G.fx.length);
  });
});
