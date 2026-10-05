/**
 * The harness checks itself: a clean state passes every invariant, and each
 * invariant (and transition rule) fires on a state built to break it — so a quiet
 * run of the fuzz specs means "nothing found", not "nothing could be found".
 * Also pins the driver's contract (reproducible, accepts / rejects as the engine does).
 */
import { describe, expect, it } from 'vitest';
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { resolve } from '@/engine/death';
import { freshReadyGame, makeHero } from '../_helpers';
import { checkInvariants, checkTransition, collectInvariantViolations, collectTransitionViolations } from './invariants';
import { chaosMove, mulberry32, playGame } from './driver';
import { callMove, diffPaths, filterForHandCard, filterForSkill, targetLegal } from './oracle';
import { splitKnown, type Hit } from './hits';

const ctx = (over: Partial<Ctx> = {}): Ctx => ({ currentPlayer: '0', turn: 2, numPlayers: 2, ...over }) as unknown as Ctx;
const clean = (): GameState => freshReadyGame();
const ids = (G: GameState, c: Ctx = ctx()) => collectInvariantViolations(G, c).map((v) => v.id);

const equip = (cardId: string, owner: PlayerID, bearer: CardInstance): CardInstance => ({
  iid: `eq-${cardId}-${Math.random()}`, cardId, ownerId: owner, zone: 'equipment', attachedTo: bearer.iid, attached: [],
  hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
});

describe('the invariants fire on states built to break them', () => {
  it('a fresh ready game is clean', () => {
    expect(checkInvariants(clean(), ctx())).toEqual([]);
  });

  const cases: [string, (G: GameState) => void][] = [
    ['hero-hp-range', (G) => { G.players['0'].active!.hp = G.players['0'].active!.hpMax + 1; }],
    ['hero-hp-range', (G) => { G.players['0'].active!.hpMax = 0; G.players['0'].active!.hp = 0; }],
    ['corpse-state', (G) => { const h = G.players['1'].bench[0]!; h.respawnTurnsLeft = 2; h.hp = 0; h.statuses.push({ id: 'shield', value: 1, duration: 9 }); }],
    ['corpse-state', (G) => { const h = G.players['1'].bench[0]!; h.respawnTurnsLeft = 2; h.hp = 3; }],
    ['corpse-state', (G) => { G.players['1'].bench[0]!.respawnTurnsLeft = -1; }],
    ['living-hero-zero-hp', (G) => { G.players['1'].bench[0]!.hp = 0; }],
    ['iid-unique', (G) => { G.players['0'].hand.push({ ...G.players['0'].bench[0]! }); }],
    ['owner-matches', (G) => { G.players['0'].hand[0].ownerId = '1'; }],
    ['bench-length', (G) => { G.players['0'].bench.push(null); }],
    ['bench-length', (G) => { (G.players['0'].bench as unknown[])[1] = undefined; }],
    ['zone-slot-match', (G) => { G.players['0'].bench[0]!.slot = 3; }],
    ['zone-slot-match', (G) => { G.players['0'].hand[0].zone = 'deck'; }],
    ['equipment-cap', (G) => { const h = G.players['0'].active!; h.attached = ['extra_spirit', 'extra_health', 'extended_magazine', 'titanic_magazine'].map((id) => equip(id, '0', h)); }],
    ['equipment-duplicate', (G) => { const h = G.players['0'].active!; h.attached = [equip('extra_spirit', '0', h), equip('extra_spirit', '0', h)]; }],
    ['attached-foreign', (G) => { const h = G.players['0'].active!; h.attached = [{ ...G.players['0'].bench[0]! }]; }],
    ['hero-in-pile', (G) => { const h = makeHero('hero_shiv', '0', 'discard'); G.players['0'].discard.push(h); }],
    ['souls-range', (G) => { G.players['0'].souls = 11; }],
    ['souls-range', (G) => { G.players['0'].souls = -1; }],
    ['patron-range', (G) => { G.players['0'].hp = G.players['0'].hpMax + 1; }],
    ['patron-dead-no-gameover', (G) => { G.players['1'].hp = 0; }],
    ['hand-size', (G) => { for (let i = 0; i < 8; i++) G.players['0'].hand.push({ ...G.players['0'].hand[0], iid: `x${i}` }); }],
    ['active-present', (G) => { G.players['0'].active = null; }],
    ['active-not-bench-only', (G) => { G.players['0'].active = makeHero('hero_rem', '0', 'active', 0); }],
    ['active-corpse-unresolved', (G) => { const a = G.players['1'].active!; a.hp = 0; a.respawnTurnsLeft = 3; }],
    ['pending-promotion-stale', (G) => { G.pendingPromotion = '0'; }],
    ['status-sanity', (G) => { G.players['0'].active!.statuses.push({ id: 'stun', value: 1, duration: 0 }); }],
    ['status-sanity', (G) => { G.players['0'].active!.statuses.push({ id: 'made_up', value: 1, duration: 1 }); }],
    ['status-duplicate', (G) => { G.players['0'].active!.statuses.push({ id: 'shield', value: 1, duration: 9 }, { id: 'shield', value: 2, duration: 9 }); }],
    ['level-exp', (G) => { G.players['0'].active!.level = 2; G.players['0'].active!.exp = 7; }],
    ['level-exp', (G) => { G.players['0'].active!.level = 4; G.players['0'].active!.exp = 2; }],
    ['level-range', (G) => { G.players['0'].active!.level = 5 as 4; }],
    ['stale-turn-flag', (G) => { G.players['1'].active!.skillUsedThisTurn = true; }],
    ['attack-flag', (G) => { G.attackUsed = true; }],
    ['attack-flag', (G) => { G.players['0'].active!.attackedThisTurn = true; }],
    ['turn-number-sync', (G) => { G.turnNumber = 9; }],
    ['log-cap', (G) => { for (let i = 0; i < 201; i++) G.log.push({ turn: 1, text: 'x' }); }],
    ['fx-seq-monotonic', (G) => { G.fx = [{ kind: 'revive', iid: 'a', seq: 5 }, { kind: 'revive', iid: 'b', seq: 5 }]; }],
    ['roster-duplicate', (G) => { G.players['1'].bench[0] = makeHero('hero_haze', '1', 'bench', 1); }],
    ['draft-picks', (G) => { G.draft = { pool: ['hero_haze'], order: [], currentIndex: 0, picks: { '0': ['hero_haze'], '1': [] } }; }],
    ['rem-merge-turns', (G) => { const b = G.players['0'].active!; const rem = makeHero('hero_rem', '0', 'equipment', 0); rem.attachedTo = b.iid; rem.remMergeTurnsLeft = 0; b.attached = [rem]; }],
  ];
  it.each(cases.map((c, i) => [`${c[0]} #${i}`, c] as const))('%s', (_label, [id, mutate]) => {
    const G = clean();
    mutate(G);
    expect(ids(G)).toContain(id);
  });

  it('a state that is merely finished (game over) is not reported for the winner\'s patron or a corpse Active', () => {
    const G = clean();
    G.players['1'].hp = 0;
    expect(ids(G, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('patron-dead-no-gameover');
  });
});

describe('the transition rules fire', () => {
  const pair = (mutate: (after: GameState) => void) => {
    const before = clean();
    const after = structuredClone(before) as GameState;
    mutate(after);
    return { before: { G: before, ctx: ctx() }, after: { G: after, ctx: ctx() } };
  };
  const ids2 = (p: ReturnType<typeof pair>, move = 'playCard', accepted = true, c?: Ctx) =>
    collectTransitionViolations(p.before, c ? { G: p.after.G, ctx: c } : p.after, { name: move, args: [] }, accepted).map((v) => v.id);

  it('patron loses hp with no hero falling', () => {
    expect(ids2(pair((G) => { G.players['1'].hp -= 1; }))).toContain('patron-delta');
  });
  it('a hero falls and the patron does not pay', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 3; }))).toContain('patron-delta');
  });
  it('a hero falls and the patron pays exactly 1: fine', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 3; G.players['1'].hp -= 1; }))).not.toContain('patron-delta');
  });
  it('a card vanishes', () => {
    expect(ids2(pair((G) => { G.players['0'].hand.pop(); }))).toContain('card-vanished');
  });
  it('a non-endTurn move hands the turn over / endTurn does not', () => {
    expect(ids2(pair(() => undefined), 'playCard', true, ctx({ currentPlayer: '1' }))).toContain('turn-owner');
    expect(ids2(pair(() => undefined), 'endTurn', true)).toContain('turn-owner');
  });
  it('turn flags survive an endTurn', () => {
    const p = pair((G) => { G.players['0'].active!.skillUsedThisTurn = true; });
    expect(ids2(p, 'endTurn', true, ctx({ currentPlayer: '1' }))).toContain('end-turn-flags');
  });
  const moveIds = (p: ReturnType<typeof pair>, name: string, args: unknown[], c?: Ctx) =>
    collectTransitionViolations(p.before, c ? { G: p.after.G, ctx: c } : p.after, { name, args }, true).map((v) => v.id);
  const heroIid = (p: ReturnType<typeof pair>) => p.before.G.players['0'].active!.iid;

  it('souls: a skill that costs 2, or a bounty with no KO', () => {
    const p = pair((G) => { G.players['0'].souls -= 2; });
    expect(moveIds(p, 'useSkill', [heroIid(p)])).toContain('souls-delta');
    const q = pair((G) => { G.players['0'].souls = G.players['0'].souls; });
    expect(moveIds(q, 'useSkill', [heroIid(q)])).toContain('souls-delta'); // the soul was not charged
    const r = pair((G) => { G.players['0'].souls -= 1; });
    expect(moveIds(r, 'useSkill', [heroIid(r)])).not.toContain('souls-delta');
  });
  it('a card played stays in the hand / ends nowhere / gives a different bonus', () => {
    const before = clean();
    const card = before.players['0'].hand[0];
    const mk = (mutate: (after: GameState) => void) => {
      const after = structuredClone(before) as GameState;
      mutate(after);
      return { before: { G: before, ctx: ctx() }, after: { G: after, ctx: ctx() } };
    };
    // still in hand
    expect(moveIds(mk(() => undefined), 'playCard', [card.iid])).toContain('play-card-leaves-hand');
    // gone from the hand but nowhere else
    expect(moveIds(mk((G) => { G.players['0'].hand = G.players['0'].hand.filter((c) => c.iid !== card.iid); }), 'playCard', [card.iid])).toContain('card-vanished');
  });
  it('equipment adds exactly its bonus', () => {
    const before = clean();
    const me = before.players['0'];
    const gear = { ...me.hand[0], cardId: 'extra_health' } as CardInstance;
    me.hand[0] = gear;
    const hero = me.active!;
    const after = structuredClone(before) as GameState;
    const a = after.players['0'];
    a.hand = a.hand.slice(1);
    const worn = { ...gear, zone: 'equipment' as const, attachedTo: hero.iid };
    a.active!.attached = [worn];
    a.active!.hpMax += 2; // right: +2 HP
    a.active!.atkMod += 5; // wrong
    const ids = collectTransitionViolations({ G: before, ctx: ctx() }, { G: after, ctx: ctx() }, { name: 'playCard', args: [gear.iid, hero.iid] }, true).map((v) => v.id);
    expect(ids).toContain('equip-bonus');
    expect(ids).not.toContain('play-card-destination');
  });
  it('respawn timers and the new turn', () => {
    const before = clean();
    const corpse = before.players['1'].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 3;
    const base = (mutate: (g: GameState) => void) => {
      const after = structuredClone(before) as GameState;
      mutate(after);
      return { before: { G: before, ctx: ctx() }, after: { G: after, ctx: ctx({ currentPlayer: '1', turn: 3 }) } };
    };
    // P1's turn starts: the corpse must tick to 2 — not tick, wrong
    let p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 2; });
    let ids3 = moveIds(p, 'endTurn', [], p.after.ctx);
    expect(ids3).toContain('respawn-timer');
    // refill table: turn 3 -> 2 souls; 5 is wrong
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 5; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    ids3 = moveIds(p, 'endTurn', [], p.after.ctx);
    expect(ids3).toContain('souls-refill');
    expect(ids3).not.toContain('respawn-timer');
    // the turn counter must step by one
    p = base((G) => { G.turnNumber = 7; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('turn-number-step');
    // a draw is owed: deck unchanged with room in hand
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 2; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('turn-draw');
  });
  it('a wiped board with the game still running', () => {
    const G = clean();
    for (const c of [G.players['1'].active!, ...G.players['1'].bench]) { c!.hp = 0; c!.respawnTurnsLeft = 3; }
    expect(ids(G)).toContain('board-wiped-no-gameover');
    expect(ids(G, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('board-wiped-no-gameover');
  });
  it('a rejected move that replaced G', () => {
    expect(ids2(pair(() => undefined), 'playCard', false)).toContain('rejected-move-changed-state');
    expect(checkTransition({ G: clean(), ctx: ctx() }, { G: clean(), ctx: ctx() }, { name: 'playCard', args: [] }, true)).toEqual([]);
  });
});

describe('the driver', () => {
  const policies = { '0': 'heuristic', '1': 'randomLegal' } as const;

  it('replays a seed exactly and plays a whole game', () => {
    const a = playGame({ seed: 5, policies });
    const b = playGame({ seed: 5, policies });
    expect(b.moves.map((m) => m.name + JSON.stringify(m.args))).toEqual(a.moves.map((m) => m.name + JSON.stringify(m.args)));
    expect(a.steps).toBeGreaterThan(30);
    expect(a.accepted).toBeGreaterThan(20);
    expect(a.final.G.draft).toBeNull();
  });

  it('reports accepted correctly: a move the engine refuses is not accepted, and a chaos game sees both', () => {
    let refused = 0;
    let taken = 0;
    playGame({
      seed: 8, policies: { '0': 'chaos', '1': 'randomLegal' },
      afterMove: (_b, _a, m, accepted) => { if (m.chaos) (accepted ? taken++ : refused++); },
    });
    expect(refused).toBeGreaterThan(0);
    expect(taken + refused).toBeGreaterThan(5);
  });

  it('the hooks see the state the move is made from and the one it leaves', () => {
    let seen = 0;
    playGame({
      seed: 9, policies,
      beforeMove: (snap, info) => { expect(snap.ctx.currentPlayer).toBe(info.player); seen++; },
      afterMove: (b, a, _m, accepted) => { if (accepted) expect(a.G).not.toBe(b.G); },
    });
    expect(seen).toBeGreaterThan(20);
  });

  it('chaos moves name only the moves the engine has, with ids from the state', () => {
    const G = clean();
    const rnd = mulberry32(3);
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) names.add(chaosMove(G, '0', rnd).name);
    expect([...names].sort()).toEqual(['attack', 'completeAction', 'draftPick', 'endTurn', 'mulligan', 'moveHero', 'playCard', 'promoteToActive', 'useSkill'].sort());
  });

  it('callMove runs on a clone', () => {
    const G = clean();
    const before = JSON.stringify(G);
    const r = callMove(G, ctx(), '0', 'playCard', [G.players['0'].hand[0].iid, G.players['1'].active!.iid]);
    expect(['accepted', 'rejected']).toContain(r.outcome);
    expect(JSON.stringify(G)).toBe(before);
  });

  it('diffPaths treats undefined as missing and finds a real difference', () => {
    expect(diffPaths({ a: 1, b: undefined }, { a: 1 })).toEqual([]);
    expect(diffPaths({ a: [1, 2] }, { a: [1, 3] })).toEqual(['a[1]: 2 != 3']);
  });

  it('splitKnown honours wildcards and `when`', () => {
    const hit = (signature: string, tags: string[] = []): Hit => ({ signature, mix: 'm', seed: 1, step: 1, move: 'x', args: [], chaos: false, tags, message: '' });
    const known = [{ id: 'a:*@m', why: 'w', when: (h: Hit) => h.tags.includes('t') }, { id: 'exact@m', why: 'w' }];
    const r = splitKnown([hit('a:zzz@m', ['t']), hit('a:zzz@m'), hit('exact@m'), hit('other@m')], known);
    expect(r.expected.length).toBe(2);
    expect(r.unexpected.map((h) => h.signature)).toEqual(['a:zzz@m', 'other@m']);
  });
});

describe('the target oracle', () => {
  it('matches the TargetFilter doc', () => {
    const G = clean();
    const me = G.players['0'];
    const foe = G.players['1'];
    const dead = foe.bench[0]!;
    dead.hp = 0; dead.respawnTurnsLeft = 3;
    const spell = (id: string) => ({ ...me.hand[0], cardId: id } as CardInstance);
    expect(filterForHandCard(spell('cold_front'))).toBe('enemyActive');
    expect(filterForHandCard(spell('extra_spirit'))).toBe('equipment');
    expect(filterForSkill(me.bench[2]!)).toBe('allyHero'); // Paige
    expect(targetLegal('enemyActive', foe.active!, undefined, '0')).toBe(true);
    expect(targetLegal('enemyActive', foe.bench[1]!, undefined, '0')).toBe(false);
    expect(targetLegal('enemyAny', dead, undefined, '0')).toBe(false);
    expect(targetLegal('allyHero', foe.active!, undefined, '0')).toBe(false);
    expect(targetLegal('self', me.active!, me.active!, '0')).toBe(true);
    expect(targetLegal('self', me.bench[0]!, me.active!, '0')).toBe(false);
    expect(targetLegal('noTarget', undefined, undefined, '0')).toBe(true);
    resolve(G);
  });
});
