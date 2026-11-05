/**
 * The harness checks itself: a clean state passes every invariant, and each
 * invariant (and transition rule) fires on a state built to break it — so a quiet
 * run of the fuzz specs means "nothing found", not "nothing could be found".
 * Most transition cases start from a REAL move made on a clone (`made`): the pair
 * it leaves must be clean, and the same pair with the rule broken by hand must not.
 * Also pins the driver's contract (reproducible, accepts / rejects as the engine
 * does) and the rules oracles against hand-built boards.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { resolve } from '@/engine/death';
import { DeadlockGame } from '@/engine/game';
import * as query from '@/engine/query';
import { getAbility } from '@/abilities';
import { ITEMS } from '@/cards';
import { openingMarket } from '@/engine/market';
import { BOSS_CARD_ID, BOSS_HP, HARD_CC_CHARGES, PRICE, REVIVE_CREDITS, ROUND_CAP } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, makeHero, nextTestIid, setTrack } from '../_helpers';
import { SOULS_ON_USE, checkInvariants, checkTransition, collectInvariantViolations, collectTransitionViolations } from './invariants';
import { chaosMove, marketSeedFor, mulberry32, playGame } from './driver';
import {
  COOLDOWN_CUT, activateBlockedOracle, activateTargetsOracle, activeCooldownOracle, boughtAtDiscountOracle, bountyOracle,
  buyBlockedOracle, buyPriceOracle, callMove, copiesOnSideOracle, diffPaths, everyCard, filterForItem, filterForSkill,
  freeCopiesOracle, heroesOfSide, itemPriceOracle, moveItemBlockedOracle, netWorthOracle, netWorthOracleWithoutHand,
  playBlockedOracle, playConsumesOracle, restoredBySaleOracle, sellBlockedOracle, sellRefundOracle, slotCapOracle, targetLegal,
  wornWorth,
} from './oracle';
import { splitKnown, type Hit } from './hits';

const ctx = (over: Partial<Ctx> = {}): Ctx => ({ currentPlayer: '0', turn: 2, numPlayers: 2, ...over }) as unknown as Ctx;
const clean = (): GameState => freshReadyGame();
const ids = (G: GameState, c: Ctx = ctx()) => collectInvariantViolations(G, c).map((v) => v.id);

/** A loose item instance (worn by nobody yet): the component an upgrade keeps aside. */
const loose = (G: GameState, cardId: string, owner: PlayerID): CardInstance => {
  const host = makeHero('hero_shiv', owner, 'bench', 1);
  const it = giveItem(G, host, cardId);
  it.attachedTo = undefined;
  return it;
};
/** `pid` has felled the enemy Guardian and Walker: the flex slot is its, as the rules give it. */
const flex = (G: GameState, pid: PlayerID) => {
  G.players[pid].flexSlot = true;
  for (const s of G.players[pid === '0' ? '1' : '0'].structures) if (s.kind !== 'patron') s.hp = 0;
};
/** Push `n` off `pid`'s structures, front first, as the engine does. */
const pushOff = (G: GameState, pid: PlayerID, n: number) => {
  for (const s of G.players[pid].structures) { const k = Math.min(s.hp, n); s.hp -= k; n -= k; }
};
/** The Mid-Boss in the pit, at `hp`, as the engine raises it (round 4 on). */
const raiseBoss = (G: GameState, hp = BOSS_HP): CardInstance => {
  G.turnNumber = 8; G.draftTurnsOffset = 0; // round 4, P0's turn (P1 moved first): read with ctx turn 8
  const boss: CardInstance = {
    iid: 'boss1', cardId: BOSS_CARD_ID, ownerId: 'none', zone: 'pit', attached: [], hp, hpMax: BOSS_HP,
    atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  G.boss = boss;
  G.bossDamage = { '0': BOSS_HP - hp, '1': 0 };
  G.bossRespawnRound = 4;
  return boss;
};
/** P0's heroes on the clean board: Haze (Active), Vindicta, Lash, Paige. */
const p0 = (G: GameState) => ({ haze: G.players['0'].active!, vindicta: G.players['0'].bench[0]!, lash: G.players['0'].bench[1]!, paige: G.players['0'].bench[2]! });
/** A merged Rem: she sits on P0's bench slot 3 in place of Paige, then merges into `bearer`. */
function mergeRem(G: GameState, bearer: CardInstance): CardInstance {
  const rem = makeHero('hero_rem', '0', 'bench', 3);
  G.players['0'].bench[2] = rem;
  const r = callMove(G, ctx(), '0', 'useSkill', [rem.iid, bearer.iid]);
  expect(r.outcome).toBe('accepted');
  Object.assign(G, r.G);
  return G.players['0'].active!.iid === bearer.iid
    ? G.players['0'].active!.attached!.find((a) => a.cardId === 'hero_rem')!
    : [...G.players['0'].bench].find((b) => b?.iid === bearer.iid)!.attached!.find((a) => a.cardId === 'hero_rem')!;
}

describe('the invariants fire on states built to break them', () => {
  it('a fresh ready game is clean, in either step', () => {
    expect(checkInvariants(clean(), ctx())).toEqual([]);
    expect(checkInvariants(freshReadyGame({ step: 'shop' }), ctx())).toEqual([]);
  });

  const cases: [string, (G: GameState) => void][] = [
    ['hero-hp-range', (G) => { G.players['0'].active!.hp = G.players['0'].active!.hpMax + 1; }],
    ['hero-hp-range', (G) => { G.players['0'].active!.hpMax = 0; G.players['0'].active!.hp = 0; }],
    ['corpse-state', (G) => { const h = G.players['1'].bench[0]!; h.respawnTurnsLeft = 2; h.hp = 0; h.statuses.push({ id: 'shield', value: 1, duration: 9 }); }],
    ['corpse-state', (G) => { const h = G.players['1'].bench[0]!; h.respawnTurnsLeft = 2; h.hp = 3; }],
    ['corpse-state', (G) => { G.players['1'].bench[0]!.respawnTurnsLeft = -1; }],
    ['living-hero-zero-hp', (G) => { G.players['1'].bench[0]!.hp = 0; }],
    // one item worn in two places
    ['iid-unique', (G) => { const it = giveItem(G, p0(G).haze, 'extra_spirit'); const v = p0(G).vindicta; v.attached = [{ ...it, attachedTo: v.iid }]; }],
    ['owner-matches', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').ownerId = '1'; }],
    ['bench-length', (G) => { G.players['0'].bench.push(null); }],
    ['bench-length', (G) => { (G.players['0'].bench as unknown[])[1] = undefined; }],
    ['zone-slot-match', (G) => { G.players['0'].bench[0]!.slot = 3; }],
    ['zone-slot-match', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').attachedTo = p0(G).vindicta.iid; }],
    ['zone-slot-match', (G) => { giveItem(G, p0(G).haze, 'grit').zone = 'bench'; }],
    ['item-slot-cap', (G) => { for (const id of ['extra_spirit', 'extra_health', 'extended_magazine', 'grit']) giveItem(G, p0(G).haze, id); }],
    ['item-duplicate', (G) => { giveItem(G, p0(G).haze, 'extra_spirit'); giveItem(G, p0(G).haze, 'extra_spirit'); }],
    ['attached-foreign', (G) => { p0(G).haze.attached = [{ ...G.players['1'].bench[0]!, ownerId: '0' }]; }],
    ['attached-foreign', (G) => { const it = giveItem(G, p0(G).haze, 'extra_spirit'); it.attached = [loose(G, 'grit', '0')]; }],
    ['souls-range', (G) => { G.players['0'].souls = 1.5; }],
    ['souls-range', (G) => { G.players['0'].souls = -1; }],
    // ---- the map ----
    ['structure-range', (G) => { G.players['0'].structures[0].hp = G.players['0'].structures[0].max + 1; }],
    ['structure-range', (G) => { G.players['0'].structures[1].hp = -1; }],
    ['structures-shape', (G) => { G.players['0'].structures.reverse(); }],
    ['structures-shape', (G) => { G.players['1'].structures.pop(); }],
    // the Walker scratched while the Guardian in front of it stands
    ['structure-order', (G) => { G.players['1'].structures[1].hp -= 1; }],
    ['patron-dead-no-gameover', (G) => { for (const s of G.players['1'].structures) s.hp = 0; }],
    // the flex slot without the enemy Walker felled, and the Walker felled without it
    ['flex-slot-walker', (G) => { G.players['0'].flexSlot = true; }],
    ['flex-slot-walker', (G) => { for (const s of G.players['1'].structures) if (s.kind !== 'patron') s.hp = 0; }],
    ['revive-credits', (G) => { G.players['0'].reviveCredits = REVIVE_CREDITS + 1; G.players['0'].reviveUntilRound = 9; }],
    // credits good through round 0, still held in round 1
    ['revive-lapsed', (G) => { G.players['0'].reviveCredits = 1; G.players['0'].reviveUntilRound = 0; }],
    ['boss-early', (G) => { raiseBoss(G); G.turnNumber = 2; }],
    ['boss-state', (G) => { raiseBoss(G).statuses.push({ id: 'bleed', value: 1, duration: 2 }); }],
    ['boss-state', (G) => { raiseBoss(G).ownerId = '1'; }],
    ['boss-state', (G) => { raiseBoss(G).hp = 0; }],
    ['boss-tally', (G) => { raiseBoss(G, 6); G.bossDamage = { '0': 1, '1': 1 }; }],
    ['boss-tally', (G) => { raiseBoss(G); G.bossDamage = { '0': -1, '1': 1 }; }],
    // round 4 has begun and no boss is up
    ['boss-due', (G) => { raiseBoss(G); G.boss = null; }],
    ['round-cap', (G) => { G.capped = true; }],
    ['round-cap', (G) => { G.turnNumber = 2 * ROUND_CAP + 2; }],
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
    ['turn-number-sync', (G) => { G.turnNumber = 9; }],
    // Engine turn 2 is the second mover's: with P0 moving first it is not P0's.
    ['turn-owner-parity', (G) => { G.firstMover = '0'; }],
    // An AI seat is promoted on the spot; with no human seat, P0 is one too.
    ['active-corpse-unresolved', (G) => { G.humanSeat = null; const a = G.players['0'].active!; a.hp = 0; a.respawnTurnsLeft = 3; G.pendingPromotion = '0'; }],
    ['log-cap', (G) => { for (let i = 0; i < 201; i++) G.log.push({ turn: 1, text: 'x' }); }],
    ['fx-seq-monotonic', (G) => { G.fx = [{ kind: 'revive', iid: 'a', seq: 5 }, { kind: 'revive', iid: 'b', seq: 5 }]; }],
    ['roster-duplicate', (G) => { G.players['1'].bench[0] = makeHero('hero_haze', '1', 'bench', 1); }],
    ['draft-picks', (G) => { G.draft = { pool: ['hero_haze'], order: [], currentIndex: 0, picks: { '0': ['hero_haze'], '1': [] } }; }],
    ['rem-merge-turns', (G) => { const b = G.players['0'].active!; const rem = makeHero('hero_rem', '0', 'equipment', 0); rem.attachedTo = b.iid; rem.remMergeTurnsLeft = 0; b.attached = [rem]; }],
    ['rem-on-corpse', (G) => { const b = G.players['0'].bench[0]!; b.hp = 0; b.respawnTurnsLeft = 2; const rem = makeHero('hero_rem', '0', 'equipment', 0); rem.attachedTo = b.iid; rem.remMergeTurnsLeft = 2; b.attached = [rem]; }],
    // hard crowd control holds 0..2 charges; nothing else holds any
    ['item-charges', (G) => { giveItem(G, p0(G).haze, 'knockdown').charges = HARD_CC_CHARGES + 1; }],
    ['item-charges', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').charges = 1; }],
    // Cold Front is tier 2: its full cooldown is 2
    ['cooldown-range', (G) => { giveItem(G, p0(G).haze, 'cold_front').cooldowns = { cold_front: 3 }; }],
    ['cooldown-range', (G) => { p0(G).lash.cooldowns = { skill_lash: 1.5 }; }],
    ['cooldown-range', (G) => { p0(G).lash.cooldowns = { skill_lash: -1 }; }],
    ['item-cooldown-key', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').cooldowns = { extra_spirit: 1 }; }],
    ['item-cooldown-key', (G) => { giveItem(G, p0(G).haze, 'knockdown').cooldowns = { knockdown: 1 }; }],
    ['item-cooldown-key', (G) => { giveItem(G, p0(G).haze, 'cold_front').cooldowns = { grit: 1 }; }],
    ['vitality-spike-sync', (G) => { for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(G, p0(G).haze, id); p0(G).haze.vitalitySpike = undefined; }],
    ['vitality-spike-sync', (G) => { p0(G).haze.vitalitySpike = true; }],
    ['step-value', (G) => { (G as { step: string }).step = 'draw'; }],
    ['shop-step-flags', (G) => { G.step = 'shop'; G.attackUsed = true; }],
    ['shop-step-flags', (G) => { G.step = 'shop'; G.retreatUsed = true; }],
    ['shop-step-flags', (G) => { G.step = 'shop'; p0(G).vindicta.skillUsedThisTurn = true; }],
    ['item-purchase-record', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').boughtOnTurn = 9; }],
    // a tier 1 item lists at 2
    ['item-purchase-record', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').paid = 7; }],
    // an upgrade bought last turn no longer holds its component
    ['item-purchase-record', (G) => { const it = giveItem(G, p0(G).haze, 'titanic_magazine'); it.boughtOnTurn = 1; it.paid = 2; it.replaced = loose(G, 'extended_magazine', '0'); }],
    // …nor does one of the player not on turn
    ['item-purchase-record', (G) => { const it = giveItem(G, G.players['1'].active!, 'titanic_magazine'); it.boughtOnTurn = 2; it.paid = 2; it.replaced = loose(G, 'extended_magazine', '1'); }],
    // where a held component came from, with no component held; or a rival's hero named
    ['item-purchase-record', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').replacedFrom = p0(G).vindicta.iid; }],
    ['item-purchase-record', (G) => { const it = giveItem(G, p0(G).haze, 'titanic_magazine'); it.boughtOnTurn = 2; it.paid = 2; it.replaced = loose(G, 'extended_magazine', '0'); it.replacedFrom = G.players['1'].active!.iid; }],
    // ---- the hands ----
    // a card in P0's hand that is P1's
    ['hand-owner', (G) => { giveCard(G, '0', 'extra_spirit').ownerId = '1'; }],
    // one card both held and worn
    ['iid-unique', (G) => { const it = giveItem(G, p0(G).haze, 'extra_spirit'); G.players['0'].hand.push({ ...it, zone: 'hand', attachedTo: undefined }); }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'extra_spirit').zone = 'equipment'; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'extra_spirit').attachedTo = p0(G).haze.iid; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'extra_spirit').attached = [loose(G, 'grit', '0')]; }],
    // a card in the hand is set going by nothing: its cooldown starts when it is played, and only
    // hard crowd control carries charges there (those it had left, put back by a same-turn sale)
    ['hand-card-state', (G) => { giveCard(G, '0', 'cold_front').cooldowns = { cold_front: 2 }; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'cold_front').charges = 1; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'knockdown').charges = HARD_CC_CHARGES + 1; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 2 }).replaced = loose(G, 'extended_magazine', '0'); }],
    ['hand-card-state', (G) => { G.players['0'].hand.push(makeHero('hero_shiv', '0', 'hand')); }],
    // bought on a turn not played yet, on no turn at all, or on half of one
    ['hand-bought-turn', (G) => { giveCard(G, '0', 'extra_spirit', { turn: 9, paid: 2 }); }],
    ['hand-bought-turn', (G) => { giveCard(G, '0', 'extra_spirit', { turn: 0, paid: 2 }); }],
    ['hand-bought-turn', (G) => { giveCard(G, '0', 'extra_spirit', { turn: 1.5, paid: 2 }); }],
    // a tier 1 card lists at 2
    ['hand-purchase-record', (G) => { giveCard(G, '0', 'extra_spirit', { turn: 2, paid: 7 }); }],
    ['hand-purchase-record', (G) => { giveCard(G, '0', 'extra_spirit', { turn: 2, paid: -1 }); }],
  ];
  it.each(cases.map((c, i) => [`${c[0]} #${i}`, c] as const))('%s', (_label, [id, mutate]) => {
    const G = clean();
    mutate(G);
    expect(ids(G)).toContain(id);
  });

  it('what the rules allow is not reported: the flex slot\'s fourth item, a merged Rem beside three items, a same-turn upgrade holding its component, cards held', () => {
    const G = clean();
    flex(G, '0');
    for (const id of ['extra_spirit', 'extra_health', 'extended_magazine', 'grit']) giveItem(G, p0(G).haze, id);
    expect(ids(G)).toEqual([]);
    const H = clean();
    for (const id of ['extra_spirit', 'extra_health', 'extended_magazine']) giveItem(H, p0(H).vindicta, id);
    mergeRem(H, p0(H).vindicta);
    expect(ids(H)).toEqual([]);
    const U = clean();
    const up = giveItem(U, p0(U).haze, 'titanic_magazine');
    up.boughtOnTurn = 2; up.paid = 2; up.replaced = loose(U, 'extended_magazine', '0'); up.replacedFrom = p0(U).vindicta.iid;
    expect(ids(U)).toEqual([]);
    // Cards held: bought this turn or before, for the difference, given free, duplicates, the rival's too.
    const K = clean();
    giveCard(K, '0', 'extra_spirit', { turn: 2, paid: 2 });
    giveCard(K, '0', 'titanic_magazine', { turn: 1, paid: 2 });
    giveCard(K, '0', 'titanic_magazine');
    giveCard(K, '1', 'cold_front', { turn: 1, paid: 4 });
    expect(ids(K)).toEqual([]);
  });

  it('net worth counts the hand: an engine reading that leaves the hand out is reported', () => {
    const G = clean();
    giveCard(G, '0', 'glass_cannon');
    expect(netWorthOracle(G, '0')).toBe(PRICE[4]);
    expect(netWorthOracleWithoutHand(G, '0')).toBe(0);
    expect(ids(G)).not.toContain('net-worth-hand');
    const spy = vi.spyOn(query, 'netWorth').mockImplementation((g, pid) => netWorthOracleWithoutHand(g, pid));
    try {
      expect(ids(G)).toContain('net-worth-hand');
    } finally {
      spy.mockRestore();
    }
  });

  it('a state that is merely finished (game over) is not reported for the winner\'s patron or a corpse Active', () => {
    const G = clean();
    for (const s of G.players['1'].structures) s.hp = 0;
    expect(ids(G, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('patron-dead-no-gameover');
  });

  it('a match over names the winner the rules give: the side whose Patron stands, or — the round cap — what stands', () => {
    const G = clean();
    for (const s of G.players['1'].structures) s.hp = 0;
    expect(ids(G, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('game-over-winner');
    expect(ids(G, ctx({ gameover: { winner: '1' } } as Partial<Ctx>))).toContain('game-over-winner');
    // No Patron fell and no cap: no reason for a result.
    expect(ids(clean(), ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).toContain('game-over-winner');
    // The cap: more structure HP wins; a tie, more net worth; still tied, the second mover (P0 here).
    const C = clean();
    C.capped = true;
    pushOff(C, '0', 3);
    expect(ids(C, ctx({ gameover: { winner: '1' } } as Partial<Ctx>))).not.toContain('game-over-winner');
    expect(ids(C, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).toContain('game-over-winner');
    const T = clean();
    T.capped = true;
    expect(ids(T, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('game-over-winner');
    T.players['1'].souls = 5;
    expect(ids(T, ctx({ gameover: { winner: '1' } } as Partial<Ctx>))).not.toContain('game-over-winner');
  });

  it('the map as the rules leave it is not reported: a felled Guardian, a Mid-Boss chipped by both, a live Rejuvenator, a Patron-only track', () => {
    const G = clean();
    pushOff(G, '1', 5); // the Guardian down, the Walker scratched
    G.players['0'].reviveCredits = 2; G.players['0'].reviveUntilRound = 6;
    const boss = raiseBoss(G, 7);
    G.bossDamage = { '0': 2, '1': 1 };
    expect(boss.hp).toBe(7);
    expect(ids(G, ctx({ turn: 8 }))).toEqual([]);
    const S = clean();
    setTrack(S, '0', { patron: 4 });
    setTrack(S, '1', { patron: 1 });
    expect(ids(S)).toEqual([]);
  });
});

describe('the transition rules fire', () => {
  const pair = (mutate: (after: GameState) => void, base: GameState = clean()) => {
    const before = base;
    const after = structuredClone(before) as GameState;
    mutate(after);
    return { before: { G: before, ctx: ctx() }, after: { G: after, ctx: ctx() } };
  };
  type Pair = ReturnType<typeof pair>;
  const ids2 = (p: Pair, move = 'useSkill', accepted = true, c?: Ctx) =>
    collectTransitionViolations(p.before, c ? { G: p.after.G, ctx: c } : p.after, { name: move, args: [] }, accepted).map((v) => v.id);
  const moveIds = (p: Pair, name: string, args: unknown[], c?: Ctx) =>
    collectTransitionViolations(p.before, c ? { G: p.after.G, ctx: c } : p.after, { name, args }, true).map((v) => v.id);
  const heroIid = (p: Pair) => p.before.G.players['0'].active!.iid;

  /** A real move made by P0 on a clone of `G`: the pair it leaves, and a way to break it. */
  function made(G: GameState, name: string, args: unknown[]) {
    const r = callMove(G, ctx(), '0', name, args);
    expect(r.outcome, `${name}(${JSON.stringify(args)})`).toBe('accepted');
    const p = { before: { G, ctx: ctx() }, after: { G: r.G, ctx: ctx() } };
    const check = (mutate?: (after: GameState) => void) => {
      const after = structuredClone(r.G) as GameState;
      mutate?.(after);
      return collectTransitionViolations(p.before, { G: after, ctx: ctx() }, { name, args }, true).map((v) => v.id);
    };
    return { ...p, check };
  }
  it('structures lose HP with no hero falling', () => {
    expect(ids2(pair((G) => { pushOff(G, '1', 1); }))).toContain('structure-delta');
  });
  it('a hero falls and pushes nothing', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 1; }))).toContain('structure-delta');
  });
  it('a hero falls and pushes its level + 1 (2 for a fresh one): fine; the old 1 is not', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 1; pushOff(G, '1', 2); }))).not.toContain('structure-delta');
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 1; pushOff(G, '1', 1); }))).toContain('structure-delta');
  });
  it('a hero that falls in round 1 waits one own turn — not the old three', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 1; pushOff(G, '1', 2); }))).not.toContain('respawn-timer-start');
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 3; pushOff(G, '1', 2); }))).toContain('respawn-timer-start');
  });
  it('a side with a live Rejuvenator has its fallen hero back in place, a credit spent', () => {
    const base = clean();
    base.players['1'].reviveCredits = 2; base.players['1'].reviveUntilRound = 3;
    const stayedDown = pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 1; pushOff(G, '1', 2); }, base);
    expect(ids2(stayedDown)).toContain('revive-owed');
    const kept = pair((G) => { G.players['1'].reviveCredits = 1; }, base);
    expect(ids2(kept)).toContain('revive-spend');
  });
  it('an item vanishes from the board; one appears from nowhere', () => {
    const base = clean();
    giveItem(base, p0(base).haze, 'extra_spirit');
    expect(ids2(pair((G) => { G.players['0'].active!.attached = []; G.players['0'].active!.spiritMod -= 1; }, base))).toContain('card-vanished');
    expect(ids2(pair((G) => { giveItem(G, G.players['0'].bench[0]!, 'grit'); }))).toContain('card-appeared');
  });
  it('a purchase brings exactly one card into the hand, a play may take its component away, and a same-turn sale bring it back', () => {
    const G = shopGame();
    giveItem(G, p0(G).haze, 'extended_magazine');
    const buy = made(G, 'buy', ['titanic_magazine']);
    expect(buy.check()).toEqual([]);
    expect(buy.check((A) => { giveCard(A, '0', 'grit'); })).toContain('card-appeared');
    const card = buy.after.G.players['0'].hand[0];
    const play = made(buy.after.G, 'playCard', [card.iid, p0(G).haze.iid]);
    expect(play.check()).toEqual([]); // the magazine is consumed: it may go
    const sale = made(play.after.G, 'sell', [card.iid]);
    expect(sale.check()).toEqual([]); // the component is back: it may appear
    expect(sale.check((A) => { giveItem(A, A.players['0'].bench[0]!, 'grit'); })).toContain('card-appeared');
  });
  it('a card vanishes from the hand; one appears in it from nowhere', () => {
    const base = clean();
    giveCard(base, '0', 'extra_spirit');
    expect(ids2(pair((G) => { G.players['0'].hand = []; }, base))).toContain('card-vanished');
    expect(ids2(pair((G) => { giveCard(G, '1', 'grit'); }))).toContain('card-appeared');
  });
  it('a non-endTurn move hands the turn over / endTurn does not', () => {
    expect(ids2(pair(() => undefined), 'useSkill', true, ctx({ currentPlayer: '1' }))).toContain('turn-owner');
    expect(ids2(pair(() => undefined), 'endTurn', true)).toContain('turn-owner');
  });
  it('turn flags survive an endTurn', () => {
    const p = pair((G) => { G.players['0'].active!.skillUsedThisTurn = true; G.turnNumber = 3; G.step = 'shop'; });
    expect(ids2(p, 'endTurn', true, ctx({ currentPlayer: '1' }))).toContain('end-turn-flags');
  });
  it('a hero\'s level never goes down', () => {
    const base = clean();
    p0(base).lash.level = 2;
    expect(ids2(pair((G) => { G.players['0'].bench[1]!.level = 1; }, base))).toContain('level-monotonic');
  });

  it('souls: an ability that charges any, or a bounty with no KO', () => {
    const p = pair((G) => { G.players['0'].souls -= 1; });
    expect(moveIds(p, 'useSkill', [heroIid(p)])).toContain('souls-delta'); // abilities are free
    const q = pair((G) => { G.players['1'].souls += 2; });
    expect(moveIds(q, 'useSkill', [heroIid(q)])).toContain('souls-delta'); // a bounty nobody earned
    const r = pair(() => undefined);
    expect(moveIds(r, 'useSkill', [heroIid(r)])).not.toContain('souls-delta');
  });
  it('a kill pays the victim\'s level + 1 to its opponent, and 2 more for the richest hero (by the list price of every worn item, actives too)', () => {
    const fall = (G: GameState) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 1; pushOff(G, '1', 2); };
    const right = pair((G) => { fall(G); G.players['0'].souls += 2; });
    expect(moveIds(right, 'attack', [])).not.toContain('souls-delta');
    const flat = pair((G) => { fall(G); G.players['0'].souls += 1; }); // the old flat bounty
    expect(moveIds(flat, 'attack', [])).toContain('souls-delta');
    // The fallen hero wears the only item on the board — an ACTIVE one: it was the richest.
    const before = clean();
    giveItem(before, before.players['1'].bench[0]!, 'grit');
    const after = structuredClone(before) as GameState;
    fall(after);
    after.players['0'].souls += 4;
    expect(collectTransitionViolations({ G: before, ctx: ctx() }, { G: after, ctx: ctx() }, { name: 'attack', args: [] }, true).map((v) => v.id)).not.toContain('souls-delta');
  });
  it('souls: a purchase costs its price (an upgrade the difference while a free copy is on the side), a sale refunds, a play, a move and the close are free', () => {
    const G = shopGame(10);
    const buy = made(G, 'buy', ['extended_magazine']);
    expect(buy.check()).toEqual([]);
    expect(buy.check((A) => { A.players['0'].souls += 1; })).toContain('souls-delta');
    const up = made(buy.after.G, 'buy', ['titanic_magazine']); // 4 - 2: the magazine in the hand is a free copy
    expect(up.after.G.players['0'].souls).toBe(6);
    expect(up.check()).toEqual([]);
    expect(up.check((A) => { A.players['0'].souls -= 2; })).toContain('souls-delta'); // the full price
    const titanic = up.after.G.players['0'].hand[1];
    const play = made(up.after.G, 'playCard', [titanic.iid, p0(G).haze.iid]);
    expect(play.after.G.players['0'].souls).toBe(6);
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { A.players['0'].souls -= 1; })).toContain('souls-delta'); // a play is free
    // sold on the turn it was bought: what was paid comes back (and the magazine, to the hand)
    const sale = made(play.after.G, 'sell', [titanic.iid]);
    expect(sale.after.G.players['0'].souls).toBe(8);
    expect(sale.check()).toEqual([]);
    expect(sale.check((A) => { A.players['0'].souls += 2; })).toContain('souls-delta');
    // a card sold from the hand on its buy turn: what was paid
    const handSale = made(buy.after.G, 'sell', [buy.after.G.players['0'].hand[0].iid]);
    expect(handSale.after.G.players['0'].souls).toBe(10);
    expect(handSale.check()).toEqual([]);
    expect(handSale.check((A) => { A.players['0'].souls = 9; })).toContain('souls-delta');
    // an item worn from before: half its price, rounded down
    const H = shopGame(0);
    const old = giveItem(H, p0(H).haze, 'extra_health');
    const half = made(H, 'sell', [old.iid]);
    expect(half.after.G.players['0'].souls).toBe(1);
    expect(half.check()).toEqual([]);
    expect(half.check((A) => { A.players['0'].souls = 2; })).toContain('souls-delta');
    const mv = made(H, 'moveItem', [old.iid, p0(H).vindicta.iid]);
    expect(mv.check()).toEqual([]);
    expect(mv.check((A) => { A.players['0'].souls += 1; })).toContain('souls-delta');
    const close = made(H, 'closeShop', []);
    expect(close.check()).toEqual([]);
    expect(close.check((A) => { A.players['0'].souls += 4; })).toContain('souls-delta');
  });
  it('souls: an item used pays what its text says (Golden Goose Egg: 2), a Retreat costs 1', () => {
    const G = clean();
    const egg = giveItem(G, p0(G).vindicta, 'golden_goose_egg');
    const use = made(G, 'activate', [egg.iid]);
    expect(use.after.G.players['0'].souls).toBe(2);
    expect(use.check()).toEqual([]);
    expect(use.check((A) => { A.players['0'].souls = 3; })).toContain('souls-delta');
    const H = clean();
    H.players['0'].souls = 3;
    const retreat = made(H, 'moveHero', [1, 0]);
    expect(retreat.check()).toEqual([]);
    expect(retreat.check((A) => { A.players['0'].souls = 3; })).toContain('souls-delta');
  });
  it('the Act: after the attack only endTurn and a promotion are accepted — no card played either; one Retreat a turn', () => {
    const p = pair(() => undefined);
    p.before.G.attackUsed = true;
    expect(moveIds(p, 'useSkill', [heroIid(p)])).toContain('act-over');
    expect(moveIds(p, 'playCard', [])).toContain('act-over');
    expect(moveIds(p, 'promoteToActive', [])).not.toContain('act-over');
    const q = pair(() => undefined);
    q.before.G.retreatUsed = true;
    expect(moveIds(q, 'moveHero', [1, 0])).toContain('retreat-once');
    expect(moveIds(q, 'moveHero', [1, 2])).not.toContain('retreat-once');
  });
  it('a Retreat spends the leaving hero\'s Swift', () => {
    const G = clean();
    p0(G).haze.statuses.push({ id: 'swift', value: 1, duration: 1 });
    const retreat = made(G, 'moveHero', [1, 0]);
    expect(retreat.check()).toEqual([]);
    expect(retreat.check((A) => { A.players['0'].bench[0]!.statuses.push({ id: 'swift', value: 1, duration: 1 }); })).toContain('swift-spent');
  });
  it('an ability arms its cooldown: a skill its own, an ultimate ULT_COOLDOWN less the Cooldown family; a locked ultimate is never used', () => {
    const skill = pair((G) => { G.players['0'].bench[1]!.cooldowns = { skill_lash: 1 }; });
    const lash = skill.before.G.players['0'].bench[1]!.iid;
    expect(moveIds(skill, 'useSkill', [lash])).not.toContain('ability-cooldown');
    const unarmed = pair(() => undefined);
    expect(moveIds(unarmed, 'useSkill', [lash])).toContain('ability-cooldown');
    const ult = pair((G) => { G.players['0'].bench[1]!.cooldowns = { eff_ult_lash: 3 }; });
    expect(moveIds(ult, 'useSkill', [lash, undefined, 'eff_ult_lash'])).toContain('ult-locked'); // Lash is level 1
    ult.before.G.players['0'].bench[1]!.level = 2;
    expect(moveIds(ult, 'useSkill', [lash, undefined, 'eff_ult_lash'])).not.toContain('ult-locked');
    // Compress Cooldown takes a turn off the ultimate: 2, not 3.
    const G = clean();
    p0(G).lash.level = 2;
    giveItem(G, p0(G).lash, 'improved_cooldown');
    const cut = made(G, 'useSkill', [p0(G).lash.iid, undefined, 'eff_ult_lash']);
    expect(cut.after.G.players['0'].bench[1]!.cooldowns?.eff_ult_lash).toBe(2);
    expect(cut.check()).toEqual([]);
    expect(cut.check((A) => { A.players['0'].bench[1]!.cooldowns = { eff_ult_lash: 3 }; })).toContain('ability-cooldown');
  });

  it('a purchase: exactly one card joins the buyer\'s hand, its turn and its price recorded — the difference, while a free copy is on the side', () => {
    const G = shopGame();
    const last = (A: GameState) => A.players['0'].hand.at(-1)!;
    const buy = made(G, 'buy', ['cold_front']);
    expect(last(buy.after.G)).toMatchObject({ cardId: 'cold_front', zone: 'hand', ownerId: '0', boughtOnTurn: 2, paid: 4 });
    expect(buy.check()).toEqual([]);
    expect(buy.check((A) => { last(A).paid = 2; })).toContain('bought-card-state');
    expect(buy.check((A) => { last(A).boughtOnTurn = 1; })).toContain('bought-card-state');
    expect(buy.check((A) => { last(A).cardId = 'spirit_sap'; })).toContain('bought-card-state');
    expect(buy.check((A) => { giveCard(A, '0', 'grit'); })).toContain('bought-card-state'); // two came
    expect(buy.check((A) => { A.players['0'].hand = []; giveItem(A, A.players['0'].active!, 'cold_front'); })).toContain('bought-card-state'); // worn, not held
    // The second upgrade against one copy pays the full price.
    const U = shopGame();
    giveItem(U, p0(U).vindicta, 'extended_magazine');
    const first = made(U, 'buy', ['titanic_magazine']);
    expect(last(first.after.G).paid).toBe(2);
    expect(first.check()).toEqual([]);
    expect(first.check((A) => { last(A).paid = 4; A.players['0'].souls -= 2; })).toContain('bought-card-state');
    const second = made(first.after.G, 'buy', ['titanic_magazine']);
    expect(last(second.after.G).paid).toBe(4);
    expect(second.check()).toEqual([]);
    expect(second.check((A) => { last(A).paid = 2; A.players['0'].souls += 2; })).toContain('bought-card-state');
  });
  it('a play: the card goes from the hand onto the hero named; an active starts on its full cooldown (less the Cooldown family) or with its charges', () => {
    const at = (A: GameState, iid: string) => everyCard(A).find((x) => x.card.iid === iid)!.card;
    const G = shopGame();
    const cold = giveCard(G, '0', 'cold_front', { turn: 2, paid: 4 });
    const play = made(G, 'playCard', [cold.iid, p0(G).haze.iid]);
    expect(at(play.after.G, cold.iid)).toMatchObject({ zone: 'equipment', attachedTo: p0(G).haze.iid, cooldowns: { cold_front: 2 }, boughtOnTurn: 2, paid: 4 });
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { at(A, cold.iid).cooldowns = { cold_front: 1 }; })).toContain('played-card-state');
    expect(play.check((A) => { at(A, cold.iid).paid = 2; })).toContain('played-card-state');
    // left in the hand, or put on another hero than the one named
    expect(play.check((A) => {
      const h = A.players['0'].active!;
      const it = at(A, cold.iid);
      h.attached = h.attached!.filter((x) => x !== it);
      A.players['0'].hand.push({ ...it, zone: 'hand', attachedTo: undefined, cooldowns: undefined });
    })).toContain('played-card-state');
    expect(play.check((A) => {
      const it = at(A, cold.iid);
      A.players['0'].active!.attached = [];
      const v = A.players['0'].bench[0]!;
      v.attached = [{ ...it, attachedTo: v.iid }];
    })).toContain('played-card-state');
    const knock = giveCard(G, '0', 'knockdown', { turn: 2, paid: 8 });
    const k = made(G, 'playCard', [knock.iid, p0(G).lash.iid]);
    expect(at(k.after.G, knock.iid).charges).toBe(HARD_CC_CHARGES);
    expect(k.check()).toEqual([]);
    expect(k.check((A) => { at(A, knock.iid).charges = 1; })).toContain('played-card-state');
    // Superior Cooldown: a tier 3 active starts on 2, not 3.
    const H = shopGame();
    giveItem(H, p0(H).haze, 'superior_cooldown');
    const fire = giveCard(H, '0', 'alchemical_fire', { turn: 2, paid: 8 });
    const f = made(H, 'playCard', [fire.iid, p0(H).haze.iid]);
    expect(at(f.after.G, fire.iid).cooldowns).toEqual({ alchemical_fire: 2 });
    expect(f.check()).toEqual([]);
    expect(f.check((A) => { at(A, fire.iid).cooldowns = { alchemical_fire: 3 }; })).toContain('played-card-state');
    // In the act step too, a card given free (no purchase recorded).
    const act = clean();
    const spirit = giveCard(act, '0', 'extra_spirit');
    const a = made(act, 'playCard', [spirit.iid, p0(act).lash.iid]);
    expect(a.check()).toEqual([]);
  });
  it('a play consumes what the rules name — the hero\'s own copy, else another hero\'s for a card bought for the difference, and a hand copy\'s own settlement — and holds it for a same-turn sale', () => {
    const at = (A: GameState, iid: string) => everyCard(A).find((x) => x.card.iid === iid)!.card;
    const G = shopGame();
    const mag = giveItem(G, p0(G).haze, 'extended_magazine');
    const titanic = giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    const own = made(G, 'playCard', [titanic.iid, p0(G).haze.iid]);
    expect(at(own.after.G, titanic.iid)).toMatchObject({ replaced: { iid: mag.iid }, replacedFrom: p0(G).haze.iid });
    expect(own.check()).toEqual([]);
    expect(own.check((A) => { at(A, titanic.iid).replaced = undefined; })).toContain('played-card-state');
    expect(own.check((A) => { at(A, titanic.iid).replacedFrom = undefined; })).toContain('played-card-state');
    expect(own.check((A) => { const h = A.players['0'].active!; h.attached!.push({ ...mag, attachedTo: h.iid }); h.atkMod += 1; })).toContain('played-card-state');
    // Bought on an earlier turn, it holds nothing.
    const later = shopGame();
    giveItem(later, p0(later).haze, 'extended_magazine');
    const older = giveCard(later, '0', 'titanic_magazine', { turn: 1, paid: 2 });
    const o = made(later, 'playCard', [older.iid, p0(later).haze.iid]);
    expect(at(o.after.G, older.iid).replaced).toBeUndefined();
    expect(o.check()).toEqual([]);
    // Another hero's copy, for a card bought for the difference only.
    const O = shopGame();
    const vinMag = giveItem(O, p0(O).vindicta, 'extended_magazine');
    const cheap = giveCard(O, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    const dear = giveCard(O, '0', 'titanic_magazine', { turn: 2, paid: 4 });
    const other = made(O, 'playCard', [cheap.iid, p0(O).haze.iid]);
    expect(at(other.after.G, cheap.iid)).toMatchObject({ replaced: { iid: vinMag.iid }, replacedFrom: p0(O).vindicta.iid });
    expect(other.check()).toEqual([]);
    const plain = made(O, 'playCard', [dear.iid, p0(O).haze.iid]);
    expect(plain.check()).toEqual([]);
    expect(plain.check((A) => { A.players['0'].bench[0]!.attached = []; A.players['0'].bench[0]!.atkMod -= 1; })).toContain('card-vanished');
    // A hand copy bought for the difference settles its own component: Vindicta's Extra Spirit.
    const S = shopGame();
    const extra = giveItem(S, p0(S).vindicta, 'extra_spirit');
    const improved = giveCard(S, '0', 'improved_spirit', { turn: 2, paid: 2 });
    const boundless = giveCard(S, '0', 'boundless_spirit', { turn: 2, paid: 12 });
    const settle = made(S, 'playCard', [boundless.iid, p0(S).haze.iid]);
    expect(at(settle.after.G, boundless.iid).replaced).toMatchObject({ iid: improved.iid, replaced: { iid: extra.iid }, replacedFrom: p0(S).vindicta.iid });
    expect(settle.check()).toEqual([]);
    expect(settle.check((A) => { at(A, boundless.iid).replaced!.replaced = undefined; })).toContain('played-card-state');
    expect(settle.check((A) => { const v = A.players['0'].bench[0]!; v.attached = [{ ...extra, attachedTo: v.iid }]; v.spiritMod += 1; })).toContain('played-card-state');
  });
  it('a play never leaves a hero over its slot cap', () => {
    const G = shopGame();
    for (const id of ['extra_health', 'extra_regen']) giveItem(G, p0(G).haze, id);
    const card = giveCard(G, '0', 'extra_spirit', { turn: 2, paid: 2 });
    const play = made(G, 'playCard', [card.iid, p0(G).haze.iid]);
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { giveItem(A, A.players['0'].active!, 'mystic_burst'); })).toContain('play-slot-cap');
    // with the flex slot a fourth is no breach
    const F = shopGame();
    flex(F, '0');
    for (const id of ['extra_health', 'extra_regen', 'mystic_burst']) giveItem(F, p0(F).haze, id);
    const fourth = giveCard(F, '0', 'extra_spirit', { turn: 2, paid: 2 });
    expect(made(F, 'playCard', [fourth.iid, p0(F).haze.iid]).check()).toEqual([]);
  });
  it('a move carries the item\'s cooldown, charges and purchase record, and lets an upgrade\'s component go', () => {
    const G = shopGame();
    const cold = giveItem(G, p0(G).haze, 'cold_front', { cooldown: 1 });
    const knock = giveItem(G, p0(G).haze, 'knockdown');
    const on = (A: GameState, iid: string) => A.players['0'].bench[0]!.attached!.find((a) => a.iid === iid)!;
    const mv = made(G, 'moveItem', [cold.iid, p0(G).vindicta.iid]);
    expect(mv.check()).toEqual([]);
    expect(mv.check((A) => { delete on(A, cold.iid).cooldowns; })).toContain('moved-item-state');
    const mk = made(G, 'moveItem', [knock.iid, p0(G).vindicta.iid]);
    expect(mk.check()).toEqual([]);
    expect(mk.check((A) => { on(A, knock.iid).charges = 1; })).toContain('moved-item-state');
    expect(mk.check((A) => { const it = on(A, knock.iid); A.players['0'].bench[0]!.attached = []; A.players['0'].bench[1]!.attached = [{ ...it, attachedTo: A.players['0'].bench[1]!.iid }]; })).toContain('moved-item-state');
  });
  it('a sale takes the card out of play — from the hand or off its hero — and a same-turn upgrade\'s sale puts its component back where the rules say', () => {
    const G = shopGame();
    giveItem(G, p0(G).haze, 'extended_magazine');
    const titanic = giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    const played = made(G, 'playCard', [titanic.iid, p0(G).haze.iid]);
    const sale = made(played.after.G, 'sell', [titanic.iid]);
    expect(sale.after.G.players['0'].active!.attached!.map((a) => a.cardId)).toEqual(['extended_magazine']);
    expect(sale.check()).toEqual([]);
    expect(sale.check((A) => { A.players['0'].active!.attached = []; A.players['0'].active!.atkMod -= 1; })).toContain('sold-item-gone');
    expect(sale.check((A) => { const h = A.players['0'].active!; h.attached!.push({ ...titanic, zone: 'equipment', attachedTo: h.iid }); h.atkMod += 2; })).toContain('sold-item-gone');
    expect(sale.check((A) => { A.players['0'].active!.attached![0].replaced = titanic; })).toContain('sold-item-gone');
    // Into the hand when the hero it came from has no room.
    const F = shopGame();
    const vMag = giveItem(F, p0(F).vindicta, 'extended_magazine');
    const cheap = giveCard(F, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    const onHaze = made(F, 'playCard', [cheap.iid, p0(F).haze.iid]).after.G;
    for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(onHaze, onHaze.players['0'].bench[0]!, id);
    const back = made(onHaze, 'sell', [cheap.iid]);
    expect(back.after.G.players['0'].hand.map((c) => c.iid)).toEqual([vMag.iid]);
    expect(back.check()).toEqual([]);
    expect(back.check((A) => {
      const v = A.players['0'].bench[0]!;
      const m = A.players['0'].hand.pop()!;
      v.attached!.push({ ...m, zone: 'equipment', attachedTo: v.iid });
      v.atkMod += 1;
    })).toContain('sold-item-gone');
    // A card from the hand: gone from it.
    const handSale = made(F, 'sell', [cheap.iid]);
    expect(handSale.check()).toEqual([]);
    expect(handSale.check((A) => { A.players['0'].hand.push({ ...cheap }); })).toContain('sold-item-gone');
  });
  it('the bonus goes on with a play, off with a sale (HP clamped, never healed), across with a move, off the hero a consumed component leaves — and a purchase touches no hero', () => {
    const G = shopGame();
    const buy = made(G, 'buy', ['extended_magazine']);
    expect(buy.check()).toEqual([]);
    expect(buy.check((A) => { A.players['0'].active!.atkMod += 1; })).toContain('equip-bonus');
    const mag = buy.after.G.players['0'].hand[0];
    const play = made(buy.after.G, 'playCard', [mag.iid, p0(G).haze.iid]);
    expect(play.after.G.players['0'].active!.atkMod).toBe(p0(G).haze.atkMod + 1);
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { A.players['0'].active!.atkMod += 1; })).toContain('equip-bonus');
    expect(play.check((A) => { A.players['0'].bench[0]!.hp -= 1; })).toContain('equip-bonus');
    // Extra Health's +2 HP: current HP rises with it…
    const eh = giveCard(G, '0', 'extra_health', { turn: 2, paid: 2 });
    const hp = made(G, 'playCard', [eh.iid, p0(G).haze.iid]);
    expect([hp.after.G.players['0'].active!.hp, hp.after.G.players['0'].active!.hpMax]).toEqual([7, 7]);
    expect(hp.check((A) => { A.players['0'].active!.hp = 5; })).toContain('equip-bonus');
    // …and a sale clamps it to the new max: a hero at 6/7 ends 5/5, one at 3/7 stays 3/5.
    const H = shopGame();
    const worn = giveItem(H, p0(H).haze, 'extra_health');
    p0(H).haze.hp = 6;
    const sale = made(H, 'sell', [worn.iid]);
    expect([sale.after.G.players['0'].active!.hp, sale.after.G.players['0'].active!.hpMax]).toEqual([5, 5]);
    expect(sale.check()).toEqual([]);
    expect(sale.check((A) => { A.players['0'].active!.hp = 4; })).toContain('equip-bonus');
    // a move: off the one hero, onto the other
    const mv = made(H, 'moveItem', [worn.iid, p0(H).vindicta.iid]);
    expect(mv.check()).toEqual([]);
    expect(mv.check((A) => { A.players['0'].bench[0]!.hpMax -= 2; })).toContain('equip-bonus');
    // the Vitality spike: a third Vitality item played adds 1 more max HP
    const V = shopGame();
    giveItem(V, p0(V).haze, 'extra_regen');
    giveItem(V, p0(V).haze, 'sprint_boots');
    const third = giveCard(V, '0', 'extra_health', { turn: 2, paid: 2 });
    const spike = made(V, 'playCard', [third.iid, p0(V).haze.iid]);
    expect(spike.after.G.players['0'].active!.hpMax).toBe(5 + 2 + 1);
    expect(spike.check()).toEqual([]);
    expect(spike.check((A) => { A.players['0'].active!.hpMax -= 1; A.players['0'].active!.hp -= 1; })).toContain('equip-bonus');
    // a component another hero wore takes its bonus off that hero
    const O = shopGame();
    giveItem(O, p0(O).vindicta, 'extended_magazine');
    const cheap = giveCard(O, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    const other = made(O, 'playCard', [cheap.iid, p0(O).haze.iid]);
    expect(other.after.G.players['0'].bench[0]!.atkMod).toBe(p0(O).vindicta.atkMod - 1);
    expect(other.check()).toEqual([]);
    expect(other.check((A) => { A.players['0'].bench[0]!.atkMod += 1; })).toContain('equip-bonus');
  });
  it('exp: +1 for a hero\'s first wearing of an item played onto it — not for a purchase, a re-play, a corpse or a move; a hero never forgets', () => {
    const G = shopGame();
    const buy = made(G, 'buy', ['extra_spirit']);
    expect(buy.after.G.players['0'].active!.exp).toBe(0);
    expect(buy.check()).toEqual([]);
    expect(buy.check((A) => { A.players['0'].active!.exp = 1; })).toContain('equip-exp');
    const card = giveCard(G, '0', 'extra_spirit', { turn: 2, paid: 2 });
    const first = made(G, 'playCard', [card.iid, p0(G).haze.iid]);
    expect(first.after.G.players['0'].active!.exp).toBe(1);
    expect(first.check()).toEqual([]);
    expect(first.check((A) => { A.players['0'].active!.exp = 0; })).toContain('equip-exp');
    expect(first.check((A) => { A.players['0'].active!.equippedIds = []; })).toContain('equip-exp');
    const H = shopGame();
    p0(H).haze.equippedIds = ['extra_spirit'];
    const again = giveCard(H, '0', 'extra_spirit', { turn: 2, paid: 2 });
    const replay = made(H, 'playCard', [again.iid, p0(H).haze.iid]);
    expect(replay.after.G.players['0'].active!.exp).toBe(0);
    expect(replay.check()).toEqual([]);
    expect(replay.check((A) => { A.players['0'].active!.exp = 1; })).toContain('equip-exp');
    const C = shopGame();
    const corpse = p0(C).vindicta;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    const held = giveCard(C, '0', 'extra_spirit', { turn: 2, paid: 2 });
    const dead = made(C, 'playCard', [held.iid, corpse.iid]);
    expect(dead.check()).toEqual([]);
    expect(dead.check((A) => { A.players['0'].bench[0]!.exp = 1; })).toContain('equip-exp');
    const M = shopGame();
    const it = giveItem(M, p0(M).haze, 'extra_spirit');
    const mv = made(M, 'moveItem', [it.iid, p0(M).vindicta.iid]);
    expect(mv.check()).toEqual([]);
    expect(mv.check((A) => { A.players['0'].bench[0]!.exp = 1; })).toContain('equip-exp');
  });
  it('an item used spends its bearer\'s ability and arms its cooldown — or spends a charge', () => {
    const G = clean();
    const cold = giveItem(G, p0(G).vindicta, 'cold_front');
    const use = made(G, 'activate', [cold.iid, G.players['1'].active!.iid]);
    expect(use.check()).toEqual([]);
    expect(use.check((A) => { A.players['0'].bench[0]!.skillUsedThisTurn = false; })).toContain('activate-spends');
    expect(use.check((A) => { A.players['0'].bench[0]!.attached![0].cooldowns = { cold_front: 1 }; })).toContain('activate-spends');
    const knock = giveItem(G, p0(G).lash, 'knockdown');
    const k = made(G, 'activate', [knock.iid, G.players['1'].active!.iid]);
    expect(k.after.G.players['0'].bench[1]!.attached![0].charges).toBe(1);
    expect(k.check()).toEqual([]);
    expect(k.check((A) => { A.players['0'].bench[1]!.attached![0].charges = 2; })).toContain('activate-spends');
  });
  it('cooldowns: the new player\'s tick down at its turn start, the ender\'s stay; nothing else moves one but what starts it, and Refresher', () => {
    const before = clean();
    before.players['1'].active!.cooldowns = { passive_abrams_heal: 2 };
    giveItem(before, before.players['1'].bench[0]!, 'cold_front', { cooldown: 2 });
    giveItem(before, p0(before).haze, 'decay', { cooldown: 3 });
    const end = (mutate: (A: GameState) => void) => {
      const after = structuredClone(before) as GameState;
      after.turnNumber = 3; after.step = 'shop'; after.players['1'].souls = 4;
      after.players['1'].active!.cooldowns = { passive_abrams_heal: 1 };
      after.players['1'].bench[0]!.attached![0].cooldowns = { cold_front: 1 };
      mutate(after);
      return collectTransitionViolations({ G: before, ctx: ctx() }, { G: after, ctx: ctx({ currentPlayer: '1', turn: 3 }) }, { name: 'endTurn', args: [] }, true).map((v) => v.id);
    };
    expect(end(() => undefined)).toEqual([]);
    expect(end((A) => { A.players['1'].bench[0]!.attached![0].cooldowns = { cold_front: 2 }; })).toContain('cooldown-bookkeeping'); // not ticked
    // a turn handed over has begun even when its start ends the match (a Bleed tick that fells
    // a hero and the patron with it): its ticks have run
    const over = (cd: number) => {
      const after = structuredClone(before) as GameState;
      after.turnNumber = 3;
      after.players['1'].active!.cooldowns = { passive_abrams_heal: 1 };
      after.players['1'].bench[0]!.attached![0].cooldowns = { cold_front: cd };
      return collectTransitionViolations({ G: before, ctx: ctx() }, { G: after, ctx: ctx({ currentPlayer: '1', turn: 3, gameover: { winner: '0' } } as Partial<Ctx>) }, { name: 'endTurn', args: [] }, true).map((v) => v.id);
    };
    expect(over(1)).not.toContain('cooldown-bookkeeping');
    expect(over(2)).toContain('cooldown-bookkeeping');
    expect(end((A) => { A.players['0'].active!.attached![0].cooldowns = { decay: 2 }; })).toContain('cooldown-bookkeeping'); // the ender's ticked
    // a skill moves only its own cooldown
    const p = pair((G) => { G.players['0'].bench[1]!.cooldowns = { skill_lash: 1 }; G.players['0'].active!.cooldowns = { x: 1 }; });
    expect(moveIds(p, 'useSkill', [p.before.G.players['0'].bench[1]!.iid])).toContain('cooldown-bookkeeping');
    // Refresher takes the Active and the items it wears off cooldown
    const R = clean();
    p0(R).haze.cooldowns = { eff_ult_haze: 2 };
    giveItem(R, p0(R).haze, 'decay', { cooldown: 2 });
    const refresher = giveItem(R, p0(R).paige, 'refresher');
    const use = made(R, 'activate', [refresher.iid]);
    expect(use.after.G.players['0'].active!.cooldowns).toBeUndefined();
    expect(use.check()).toEqual([]);
    expect(use.check((A) => { A.players['0'].bench[0]!.cooldowns = { skill_vindicta: 1 }; })).toContain('cooldown-bookkeeping');
  });
  it('respawn timers and the new turn', () => {
    const before = clean();
    const corpse = before.players['1'].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 3;
    const base = (mutate: (g: GameState) => void) => {
      const after = structuredClone(before) as GameState;
      after.step = 'shop';
      mutate(after);
      return { before: { G: before, ctx: ctx() }, after: { G: after, ctx: ctx({ currentPlayer: '1', turn: 3 }) } };
    };
    // P1's turn starts: the corpse must tick to 2 — not tick, wrong
    let p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 4; });
    let ids3 = moveIds(p, 'endTurn', [], p.after.ctx);
    expect(ids3).toContain('respawn-timer');
    expect(ids3).not.toContain('souls-income');
    // the income: 4 on top of what was banked (0 here); 5 is wrong, and so is a refill to 2
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 5; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    ids3 = moveIds(p, 'endTurn', [], p.after.ctx);
    expect(ids3).toContain('souls-income');
    expect(ids3).not.toContain('respawn-timer');
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 2; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('souls-income');
    // a side 8 behind on net worth gets 1 more: P0 banked 8, P1 nothing
    before.players['0'].souls = 8;
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 5; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).not.toContain('souls-income');
    // …and worn items count at their list price: P0's 6 souls and a tier 1 item are worth 8
    before.players['0'].souls = 6;
    giveItem(before, before.players['0'].bench[2]!, 'grit');
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 5; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toEqual([]);
    // …and so do the cards in the hand: 4 souls, the item worn and a tier 1 card held are 8. An
    // income with no comeback is the one that left the hand out: `net-worth-hand`.
    before.players['0'].souls = 4;
    giveCard(before, '0', 'extended_magazine');
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 5; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toEqual([]);
    p = base((G) => { G.turnNumber = 3; G.players['1'].souls = 4; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    ids3 = moveIds(p, 'endTurn', [], p.after.ctx);
    expect(ids3).toContain('net-worth-hand');
    expect(ids3).not.toContain('souls-income');
    before.players['0'].hand = [];
    before.players['0'].souls = 0;
    // the turn counter must step by one
    p = base((G) => { G.turnNumber = 7; G.players['1'].bench[0]!.respawnTurnsLeft = 2; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('turn-number-step');
  });
  it('the step: a new turn opens on the shop, closeShop opens the act, and nothing goes back', () => {
    const turn = (step: GameState['step']) => pair((G) => { G.turnNumber = 3; G.step = step; G.players['1'].souls = 4; });
    expect(moveIds(turn('shop'), 'endTurn', [], ctx({ currentPlayer: '1', turn: 3 }))).toEqual([]);
    expect(moveIds(turn('act'), 'endTurn', [], ctx({ currentPlayer: '1', turn: 3 }))).toContain('step-new-turn');
    const shop = freshReadyGame({ step: 'shop' });
    const close = made(shop, 'closeShop', []);
    expect(close.check()).toEqual([]);
    expect(close.check((A) => { A.step = 'shop'; })).toContain('step-close-shop');
    expect(moveIds(pair((G) => { G.step = 'shop'; }), 'useSkill', [heroIid(pair(() => undefined))])).toContain('step-change');
    expect(moveIds(pair((G) => { G.step = 'act'; }, freshReadyGame({ step: 'shop' })), 'buy', [])).toContain('step-change');
  });
  it('the step: the shop step takes the shop\'s moves only, the act step none of them — a card is played in either', () => {
    const inShop = pair(() => undefined, freshReadyGame({ step: 'shop' }));
    expect(moveIds(inShop, 'useSkill', [])).toContain('step-shop-moves');
    expect(moveIds(inShop, 'attack', [])).toContain('step-shop-moves');
    expect(moveIds(inShop, 'promoteToActive', [])).not.toContain('step-shop-moves');
    expect(moveIds(inShop, 'playCard', [])).not.toContain('step-shop-moves');
    const inAct = pair(() => undefined);
    expect(moveIds(inAct, 'sell', [])).toContain('step-act-moves');
    expect(moveIds(inAct, 'closeShop', [])).toContain('step-act-moves');
    expect(moveIds(inAct, 'activate', [])).not.toContain('step-act-moves');
    expect(moveIds(inAct, 'playCard', [])).not.toContain('step-act-moves');
  });
  it('a shop move, a card play or an item use the rules refuse, accepted', () => {
    // a purchase in the act step
    expect(moveIds(pair(() => undefined), 'buy', ['extra_spirit'])).toContain('accepted-illegal');
    // a card played onto a rival's hero; one played after the attack; one not in the hand
    const P = clean();
    const card = giveCard(P, '0', 'extra_spirit');
    expect(moveIds(pair(() => undefined, P), 'playCard', [card.iid, P.players['0'].active!.iid])).not.toContain('accepted-illegal');
    expect(moveIds(pair(() => undefined, P), 'playCard', [card.iid, P.players['1'].active!.iid])).toContain('accepted-illegal');
    expect(moveIds(pair(() => undefined, P), 'playCard', ['ghost', P.players['0'].active!.iid])).toContain('accepted-illegal');
    P.attackUsed = true;
    expect(moveIds(pair(() => undefined, P), 'playCard', [card.iid, P.players['0'].active!.iid])).toContain('accepted-illegal');
    // the rival's item sold in the shop step
    const G = freshReadyGame({ step: 'shop' });
    const theirs = giveItem(G, G.players['1'].active!, 'grit');
    expect(moveIds(pair(() => undefined, G), 'sell', [theirs.iid])).toContain('accepted-illegal');
    // an item used while it cools down
    const H = clean();
    const cold = giveItem(H, p0(H).haze, 'cold_front', { cooldown: 1 });
    expect(moveIds(pair(() => undefined, H), 'activate', [cold.iid, H.players['1'].active!.iid])).toContain('accepted-illegal');
  });
  it('a wiped board is no loss: nothing is reported while the game runs on', () => {
    const G = clean();
    for (const c of [G.players['1'].active!, ...G.players['1'].bench]) { c!.hp = 0; c!.respawnTurnsLeft = 3; }
    expect(ids(G)).toEqual([]);
  });
  it('the empty-lane push: at the end of a turn the rival\'s structures may lose the Active\'s bullet power', () => {
    const before = clean();
    for (const c of [before.players['1'].active!, ...before.players['1'].bench]) { c!.hp = 0; c!.respawnTurnsLeft = 3; }
    const after = structuredClone(before) as GameState;
    pushOff(after, '1', 3); // Haze's 3 Bullet Power
    const end = (a: GameState, name: string) => collectTransitionViolations({ G: before, ctx: ctx() }, { G: a, ctx: ctx({ currentPlayer: '1', turn: 3 }) }, { name, args: [] }, true).map((v) => v.id);
    expect(end(after, 'endTurn')).not.toContain('structure-delta');
    expect(end(after, 'useSkill')).toContain('structure-delta');
    pushOff(after, '1', 1);
    expect(end(after, 'endTurn')).toContain('structure-delta');
  });
  it('a rejected move that replaced G', () => {
    expect(ids2(pair(() => undefined), 'useSkill', false)).toContain('rejected-move-changed-state');
    expect(checkTransition({ G: clean(), ctx: ctx() }, { G: clean(), ctx: ctx() }, { name: 'completeAction', args: [] }, true)).toEqual([]);
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
    expect(a.policyThrew).toEqual([]);
  });

  it('a seed is a market: the match seed is drawn from it, so the same seed sells the same items and another seed others', () => {
    const a = playGame({ seed: 21, policies });
    const b = playGame({ seed: 22, policies });
    expect(a.final.G.seed).toBe(marketSeedFor(21));
    expect(a.final.G.market.slice(0, openingMarket(marketSeedFor(21)).length)).toEqual(openingMarket(marketSeedFor(21)));
    expect(a.final.G.market).not.toEqual(b.final.G.market);
  });

  it('reports accepted correctly: a move the engine refuses is not accepted, and a chaos game sees both', () => {
    let refused = 0;
    let taken = 0;
    playGame({
      seed: 13, policies: { '0': 'chaos', '1': 'randomLegal' },
      afterMove: (_b, _a, m, accepted) => { if (m.chaos) (accepted ? taken++ : refused++); },
    });
    expect(refused).toBeGreaterThan(0);
    expect(taken).toBeGreaterThan(0);
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

  it('the heuristic seat shops by its build — each card it buys played at once — and closes the shop; a random seat buys, sells, moves and plays too', () => {
    const made: Record<string, Set<string>> = { heuristic: new Set(), randomLegal: new Set() };
    const held = { heuristic: 0, randomLegal: 0 };
    for (const seed of [31, 32, 33]) {
      playGame({
        seed, policies,
        afterMove: (_b, a, m, accepted) => {
          if (!accepted || m.chaos || !(m.policy in made)) return;
          made[m.policy].add(m.name);
          // A turn handed over with cards still in the ending seat's hand.
          if (m.name === 'endTurn' && a.G.players[m.player].hand.length) held[m.policy as keyof typeof held]++;
        },
      });
    }
    const shopMoves = ['buy', 'sell', 'moveItem', 'playCard', 'closeShop'];
    expect([...made.heuristic].filter((n) => shopMoves.includes(n)).sort()).toEqual(['buy', 'closeShop', 'playCard']);
    expect(held.heuristic).toBe(0); // the AI never holds a card into the next turn
    expect(shopMoves.every((n) => made.randomLegal.has(n))).toBe(true);
  });

  it('chaos moves name every move the engine has and nothing else, with ids from the state', () => {
    const G = clean();
    giveItem(G, G.players['0'].active!, 'cold_front');
    const held = giveCard(G, '0', 'extra_spirit');
    const rnd = mulberry32(3);
    const names = new Set<string>();
    const iids = new Set<unknown>();
    for (let i = 0; i < 600; i++) {
      const m = chaosMove(G, '0', rnd);
      names.add(m.name);
      if (m.name === 'sell' || m.name === 'activate' || m.name === 'playCard') iids.add(m.args[0]);
    }
    expect([...names].sort()).toEqual(Object.keys(DeadlockGame.moves!).sort());
    expect(iids.has(G.players['0'].active!.attached![0].iid)).toBe(true); // a worn item's own iid
    expect(iids.has(held.iid)).toBe(true); // a hand card's own iid
  });

  it('callMove runs on a clone', () => {
    const G = freshReadyGame({ step: 'shop' });
    G.players['0'].souls = 5;
    const before = JSON.stringify(G);
    const r = callMove(G, ctx(), '0', 'buy', ['extra_spirit']);
    expect(r.outcome).toBe('accepted');
    expect(JSON.stringify(G)).toBe(before);
    expect(callMove(G, ctx(), '0', 'noSuchMove', []).outcome).toBe('rejected');
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

describe('the rules oracles', () => {
  it('the target oracle matches the TargetFilter doc; an item is aimed by its first ability, a passive is never used', () => {
    const G = clean();
    const me = G.players['0'];
    const foe = G.players['1'];
    const dead = foe.bench[0]!;
    dead.hp = 0; dead.respawnTurnsLeft = 3;
    expect(filterForItem(giveItem(G, me.active!, 'cold_front'))).toBe('enemyActive');
    expect(filterForItem(giveItem(G, me.active!, 'grit'))).toBe('noTarget');
    expect(filterForItem(giveItem(G, me.active!, 'extra_spirit'))).toBe('passive');
    expect(filterForItem(me.bench[0]!)).toBeNull();
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

  it('prices: PRICE by tier; an upgrade costs the difference while a free copy of its component is on the side; a sale refunds what was paid on its turn, else half rounded down', () => {
    const G = clean();
    expect(['extended_magazine', 'titanic_magazine', 'decay', 'curse', 'hero_haze'].map(itemPriceOracle)).toEqual([2, 4, 8, 16, 0]);
    const { haze } = p0(G);
    expect(buyPriceOracle(G, '0', 'titanic_magazine')).toBe(4);
    const mag = giveItem(G, haze, 'extended_magazine');
    expect(buyPriceOracle(G, '0', 'titanic_magazine')).toBe(2);
    expect(buyPriceOracle(G, '1', 'titanic_magazine')).toBe(4); // P0's copy is not P1's
    expect(buyPriceOracle(G, '0', 'boundless_spirit')).toBe(16); // its component is Improved Spirit, not on the side
    // A claim: an upgrade in the hand bought for the difference spends the one free copy.
    const claim = giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    expect([boughtAtDiscountOracle(claim), freeCopiesOracle(G, '0', 'extended_magazine')]).toEqual([true, 0]);
    expect(buyPriceOracle(G, '0', 'titanic_magazine')).toBe(4);
    expect(boughtAtDiscountOracle(giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 4 }))).toBe(false); // full price claims nothing
    expect(freeCopiesOracle(G, '0', 'extended_magazine')).toBe(0);
    giveCard(G, '0', 'extended_magazine', { turn: 2, paid: 2 }); // a second copy, in the hand
    expect(copiesOnSideOracle(G, '0', 'extended_magazine')).toHaveLength(2);
    expect(buyPriceOracle(G, '0', 'titanic_magazine')).toBe(2);
    // A corpse's copy counts.
    const C = clean();
    const corpse = p0(C).vindicta;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    giveItem(C, corpse, 'extended_magazine');
    expect(buyPriceOracle(C, '0', 'titanic_magazine')).toBe(2);
    // Refunds.
    expect(sellRefundOracle(G, mag)).toBe(1); // worn from before: half of 2
    mag.boughtOnTurn = G.turnNumber; mag.paid = 2;
    expect(sellRefundOracle(G, mag)).toBe(2);
    expect(sellRefundOracle(G, claim)).toBe(2); // held, bought this turn for the difference
    claim.boughtOnTurn = 1;
    expect(sellRefundOracle(G, claim)).toBe(2); // half of 4
    expect(sellRefundOracle(G, giveCard(G, '0', 'decay'))).toBe(4); // given free: half its price
  });
  it('slots and worth: three items (four with the flex slot); every worn item and every card in the hand counts; a merged Rem is a hero, not an item, and her items are copies on the side', () => {
    const G = clean();
    expect(slotCapOracle(G, '0')).toBe(3);
    G.players['0'].flexSlot = true;
    expect(slotCapOracle(G, '0')).toBe(4);
    const vind = p0(G).vindicta;
    giveItem(G, vind, 'grit');
    giveItem(G, vind, 'extra_health');
    const rem = mergeRem(G, G.players['0'].bench[0]!);
    expect(wornWorth(G.players['0'].bench[0]!)).toBe(4); // two tier 1 items, Rem not among them
    expect(bountyOracle(G, G.players['0'].bench[0]!)).toBe(1 + 1 + 2); // the richest hero on the board
    giveItem(G, rem, 'cold_front');
    expect(heroesOfSide(G.players['0']).map((h) => h.cardId)).toContain('hero_rem');
    expect(netWorthOracle(G, '0')).toBe(4 + 4);
    expect(bountyOracle(G, rem)).toBe(1 + 1); // a tie for the richest: no bonus
    expect(copiesOnSideOracle(G, '0', 'cold_front').map((c) => c.cardId)).toEqual(['cold_front']); // hers counts while she rides
    expect(buyPriceOracle(G, '0', 'arctic_blast')).toBe(16 - 4);
    giveItem(G, rem, 'decay');
    expect(bountyOracle(G, rem)).toBe(1 + 1 + 2);
    // The hand counts at list price — in net worth, not in a hero's worth.
    giveCard(G, '0', 'glass_cannon');
    expect(netWorthOracle(G, '0')).toBe(4 + 4 + 8 + 16);
    expect(netWorthOracleWithoutHand(G, '0')).toBe(4 + 4 + 8);
    expect(bountyOracle(G, rem)).toBe(1 + 1 + 2);
  });
  it('the shop oracle: the turn, the step, the market, souls — a buy names no hero; a sale takes a hand card or a worn item, never a claimed copy', () => {
    const G = shopGame();
    const haze = p0(G).haze;
    expect(buyBlockedOracle(G, '0', 'extra_spirit')).toBeNull();
    expect(buyBlockedOracle(G, '1', 'extra_spirit')).toBe('not-your-turn');
    expect(buyBlockedOracle(clean(), '0', 'extra_spirit')).toBe('not-shop-step');
    expect(buyBlockedOracle(G, '0', 'hero_haze')).toBe('no-item');
    expect(buyBlockedOracle(G, '0', 'curse')).toBe('off-market');
    expect(buyBlockedOracle(G, '0', 'titanic_magazine', 3)).toBe('souls');
    giveItem(G, haze, 'extended_magazine');
    expect(buyBlockedOracle(G, '0', 'titanic_magazine', 3)).toBeNull(); // 2, over the worn magazine
    const worn = haze.attached![0];
    expect(sellBlockedOracle(G, '0', worn.iid)).toBeNull();
    expect(sellBlockedOracle(G, '1', worn.iid)).toBe('not-your-turn');
    const held = giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    expect(sellBlockedOracle(G, '0', held.iid)).toBeNull();
    expect(sellBlockedOracle(G, '0', worn.iid)).toBe('claimed');
    expect(sellBlockedOracle(G, '0', G.players['1'].active!.iid)).toBe('not-owned');
    expect(sellBlockedOracle(G, '0', 'ghost')).toBe('not-owned');
    const corpse = p0(G).vindicta;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expect(moveItemBlockedOracle(G, '0', worn.iid, haze.iid)).toBe('same-hero');
    expect(moveItemBlockedOracle(G, '0', worn.iid, corpse.iid)).toBeNull();
    expect(moveItemBlockedOracle(G, '0', held.iid, corpse.iid)).toBe('not-worn');
    giveItem(G, p0(G).lash, 'extended_magazine');
    expect(moveItemBlockedOracle(G, '0', worn.iid, p0(G).lash.iid)).toBe('duplicate');
    G.pendingPromotion = '0';
    expect(buyBlockedOracle(G, '0', 'extra_health')).toBe('promotion-owed');
  });
  it('the play oracle: either step, not after the attack; a card in the hand onto a hero of the side in a slot — a corpse too — never a duplicate, never past the cap unless it upgrades one worn', () => {
    const G = shopGame();
    const { haze, vindicta, paige } = p0(G);
    const card = giveCard(G, '0', 'extra_spirit');
    expect(playBlockedOracle(G, '0', card.iid, haze.iid)).toBeNull();
    G.step = 'act';
    expect(playBlockedOracle(G, '0', card.iid, haze.iid)).toBeNull();
    paige.hp = 0; paige.respawnTurnsLeft = 2;
    expect(playBlockedOracle(G, '0', card.iid, paige.iid)).toBeNull();
    expect(playBlockedOracle(G, '1', card.iid, haze.iid)).toBe('not-your-turn');
    expect(playBlockedOracle(G, '0', 'ghost', haze.iid)).toBe('not-in-hand');
    expect(playBlockedOracle(G, '0', giveItem(G, vindicta, 'grit').iid, haze.iid)).toBe('not-in-hand');
    expect(playBlockedOracle(G, '0', giveCard(G, '1', 'grit').iid, haze.iid)).toBe('not-in-hand');
    expect(playBlockedOracle(G, '0', card.iid, G.players['1'].active!.iid)).toBe('no-hero');
    expect(playBlockedOracle(G, '0', card.iid, undefined)).toBe('no-hero');
    giveItem(G, vindicta, 'extra_spirit');
    expect(playBlockedOracle(G, '0', card.iid, vindicta.iid)).toBe('duplicate');
    for (const id of ['extended_magazine', 'extra_health', 'extra_regen']) giveItem(G, haze, id);
    expect(playBlockedOracle(G, '0', card.iid, haze.iid)).toBe('full');
    expect(playBlockedOracle(G, '0', giveCard(G, '0', 'titanic_magazine').iid, haze.iid)).toBeNull(); // takes the magazine's place
    G.attackUsed = true;
    expect(playBlockedOracle(G, '0', card.iid, p0(G).lash.iid)).toBe('act-over');
    G.attackUsed = false;
    G.pendingPromotion = '0';
    expect(playBlockedOracle(G, '0', card.iid, p0(G).lash.iid)).toBe('promotion-owed');
    // A merged Rem is no hero in a slot.
    const R = clean();
    const rem = mergeRem(R, p0(R).haze);
    const held = giveCard(R, '0', 'extra_spirit');
    expect(playBlockedOracle(R, '0', held.iid, rem.iid)).toBe('no-hero');
  });
  it('what a play consumes: the hero\'s own copy; else one from the hand, full price first; else, bought for the difference, another hero\'s — and a hand copy bought for the difference settles its own', () => {
    const G = shopGame();
    const { haze, vindicta } = p0(G);
    const vinMag = giveItem(G, vindicta, 'extended_magazine');
    const cheap = giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 2 });
    const dear = giveCard(G, '0', 'titanic_magazine', { turn: 2, paid: 4 });
    expect(playConsumesOracle(G, '0', cheap, haze)).toEqual([{ item: vinMag, from: vindicta }]);
    expect(playConsumesOracle(G, '0', dear, haze)).toEqual([]);
    expect(playConsumesOracle(G, '0', dear, vindicta)).toEqual([{ item: vinMag, from: vindicta }]); // the hero's own, whatever was paid
    const heldMag = giveCard(G, '0', 'extended_magazine', { turn: 2, paid: 2 });
    expect(playConsumesOracle(G, '0', dear, haze)).toEqual([{ item: heldMag }]); // the hand before another hero
    expect(playConsumesOracle(G, '0', giveCard(G, '0', 'extra_spirit'), haze)).toEqual([]); // upgrades nothing
    const S = shopGame();
    const extra = giveItem(S, p0(S).vindicta, 'extra_spirit');
    const improvedCheap = giveCard(S, '0', 'improved_spirit', { turn: 2, paid: 2 });
    const boundless = giveCard(S, '0', 'boundless_spirit', { turn: 2, paid: 12 });
    expect(playConsumesOracle(S, '0', boundless, p0(S).haze)).toEqual([{ item: improvedCheap }, { item: extra, from: p0(S).vindicta }]);
    const improvedDear = giveCard(S, '0', 'improved_spirit', { turn: 2, paid: 4 });
    expect(playConsumesOracle(S, '0', boundless, p0(S).haze)).toEqual([{ item: improvedDear }]); // full price first: it settles nothing
  });
  it('what a same-turn sale puts back: onto the hero it came from while it has room and wears no copy, else into the hand — and what that one settled, after it', () => {
    const G = shopGame();
    const { haze, vindicta } = p0(G);
    const mag = loose(G, 'extended_magazine', '0');
    const titanic = giveItem(G, haze, 'titanic_magazine');
    titanic.boughtOnTurn = 2; titanic.paid = 2; titanic.replaced = mag; titanic.replacedFrom = vindicta.iid;
    expect(restoredBySaleOracle(G, '0', titanic, haze)).toEqual([{ item: mag, to: vindicta }]);
    titanic.replacedFrom = haze.iid;
    expect(restoredBySaleOracle(G, '0', titanic, haze)).toEqual([{ item: mag, to: haze }]); // into the slot the sale frees
    titanic.replacedFrom = undefined;
    expect(restoredBySaleOracle(G, '0', titanic, haze)).toEqual([{ item: mag, to: 'hand' }]); // it came from the hand
    titanic.replacedFrom = vindicta.iid;
    giveItem(G, vindicta, 'extended_magazine');
    expect(restoredBySaleOracle(G, '0', titanic, haze)).toEqual([{ item: mag, to: 'hand' }]); // she wears a copy
    titanic.boughtOnTurn = 1;
    expect(restoredBySaleOracle(G, '0', titanic, haze)).toEqual([]); // bought before this turn: nothing
    const S = shopGame();
    const extra = loose(S, 'extra_spirit', '0');
    const improved = loose(S, 'improved_spirit', '0');
    improved.replaced = extra; improved.replacedFrom = p0(S).vindicta.iid;
    const boundless = giveItem(S, p0(S).haze, 'boundless_spirit');
    boundless.boughtOnTurn = 2; boundless.paid = 12; boundless.replaced = improved;
    expect(restoredBySaleOracle(S, '0', boundless, p0(S).haze)).toEqual([{ item: improved, to: 'hand' }, { item: extra, to: p0(S).vindicta }]);
    for (const id of ['grit', 'extra_health', 'extra_regen']) giveItem(S, p0(S).vindicta, id);
    expect(restoredBySaleOracle(S, '0', boundless, p0(S).haze)).toEqual([{ item: improved, to: 'hand' }, { item: extra, to: 'hand' }]); // she is full
  });
  it('the item-use oracle: the act step, an active worn by a standing bearer who has not used its ability, unlocked, ready, on a legal target', () => {
    const G = clean();
    const foeActive = G.players['1'].active!.iid;
    const lash = p0(G).lash;
    const cold = giveItem(G, lash, 'cold_front');
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBeNull(); // a bench bearer, "the enemy Active"
    expect(activateTargetsOracle(G, '0', cold, lash)).toEqual([G.players['1'].active]);
    expect(activateBlockedOracle(G, '0', cold.iid)).toBe('missing-target');
    expect(activateBlockedOracle(G, '0', cold.iid, G.players['1'].bench[0]!.iid)).toBe('bad-target');
    expect(activateBlockedOracle(G, '1', cold.iid, foeActive)).toBe('not-worn');
    expect(activateBlockedOracle(G, '0', giveItem(G, lash, 'extra_spirit').iid)).toBe('passive');
    expect(activateBlockedOracle(G, '0', giveItem(G, p0(G).paige, 'grit', { cooldown: 1 }).iid)).toBe('cooling');
    const knock = giveItem(G, p0(G).vindicta, 'knockdown');
    knock.charges = 0;
    expect(activateBlockedOracle(G, '0', knock.iid, foeActive)).toBe('no-charges');
    knock.charges = 1;
    p0(G).vindicta.statuses.push({ id: 'silenced', value: 1, duration: 1 });
    expect(activateBlockedOracle(G, '0', knock.iid, foeActive)).toBe('bearer-locked');
    lash.skillUsedThisTurn = true;
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBe('bearer-used');
    lash.skillUsedThisTurn = false;
    lash.hp = 0; lash.respawnTurnsLeft = 2;
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBe('bearer-down');
    G.step = 'shop';
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBe('shop-step');
    // the Cooldown family: Superior Cooldown takes a turn off a tier 3 active (never under 1)
    const haze = p0(G).haze;
    expect(activeCooldownOracle(haze, 3)).toBe(3);
    giveItem(G, haze, 'superior_cooldown');
    expect([activeCooldownOracle(haze, 3), activeCooldownOracle(haze, 1)]).toEqual([2, 1]);
  });

  it('the oracles\' tables are the cards\': the Cooldown family\'s cuts are its hooks\', and the souls an item pays are its text\'s', () => {
    for (const item of ITEMS) {
      const hooks = item.type === 'equipment' ? (item.abilities ?? []).map(getAbility).filter((a) => a?.cooldownCut) : [];
      const cut = COOLDOWN_CUT[item.id];
      if (!hooks.length) { expect(cut, item.id).toBeUndefined(); continue; }
      const hero = makeHero('hero_haze', '0');
      expect(cut, item.id).toEqual({ ult: hooks[0]!.cooldownCut!(hero, 'ult'), item: hooks[0]!.cooldownCut!(hero, 'item') });
    }
    const paying = Object.fromEntries(ITEMS.flatMap((i) => {
      const m = /Gain (\d+) souls/.exec(i.text ?? '');
      return m ? [[i.id, Number(m[1])]] : [];
    }));
    expect(SOULS_ON_USE).toEqual(paying);
  });

  it('an oracle answers for a hand-built iid too (the shop and the board, not a test\'s own counter)', () => {
    const G = shopGame();
    const stray = makeHero('hero_shiv', '0', 'bench', 1);
    expect(stray.iid).toMatch(/^t/);
    const card = giveCard(G, '0', 'extra_spirit');
    expect(playBlockedOracle(G, '0', card.iid, stray.iid)).toBe('no-hero');
    expect(playBlockedOracle(G, '0', card.iid, nextTestIid())).toBe('no-hero');
    expect(sellBlockedOracle(G, '0', nextTestIid())).toBe('not-owned');
  });
});

/** The shop step of P0's turn with souls to spend. */
function shopGame(souls = 30): GameState {
  const G = freshReadyGame({ step: 'shop' });
  G.players['0'].souls = souls;
  return G;
}
