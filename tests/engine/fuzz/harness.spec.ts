/**
 * The harness checks itself: a clean state passes every invariant, and each
 * invariant (and transition rule) fires on a state built to break it — so a quiet
 * run of the fuzz specs means "nothing found", not "nothing could be found".
 * Most transition cases start from a REAL move made on a clone (`made`): the pair
 * it leaves must be clean, and the same pair with the rule broken by hand must not.
 * Also pins the driver's contract (reproducible, accepts / rejects as the engine
 * does) and the rules oracles against hand-built boards.
 */
import { describe, expect, it } from 'vitest';
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { resolve } from '@/engine/death';
import { DeadlockGame } from '@/engine/game';
import { getAbility } from '@/abilities';
import { ITEMS } from '@/cards';
import { openingMarket } from '@/engine/market';
import { HARD_CC_CHARGES } from '@/engine/constants';
import { freshReadyGame, giveItem, makeHero, nextTestIid } from '../_helpers';
import { SOULS_ON_USE, checkInvariants, checkTransition, collectInvariantViolations, collectTransitionViolations } from './invariants';
import { chaosMove, marketSeedFor, mulberry32, playGame } from './driver';
import {
  COOLDOWN_CUT, activateBlockedOracle, activateTargetsOracle, activeCooldownOracle, bountyOracle, buyBlockedOracle, buyPriceOracle,
  callMove, diffPaths, filterForItem, filterForSkill, heroesOfSide, itemPriceOracle, moveItemBlockedOracle, netWorthOracle,
  sellBlockedOracle, sellRefundOracle, slotCapOracle, targetLegal, wornWorth,
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
    ['patron-range', (G) => { G.players['0'].hp = G.players['0'].hpMax + 1; }],
    ['patron-dead-no-gameover', (G) => { G.players['1'].hp = 0; }],
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
  ];
  it.each(cases.map((c, i) => [`${c[0]} #${i}`, c] as const))('%s', (_label, [id, mutate]) => {
    const G = clean();
    mutate(G);
    expect(ids(G)).toContain(id);
  });

  it('what the rules allow is not reported: the flex slot\'s fourth item, a merged Rem beside three items, a same-turn upgrade holding its component', () => {
    const G = clean();
    G.players['0'].flexSlot = true;
    for (const id of ['extra_spirit', 'extra_health', 'extended_magazine', 'grit']) giveItem(G, p0(G).haze, id);
    expect(ids(G)).toEqual([]);
    const H = clean();
    for (const id of ['extra_spirit', 'extra_health', 'extended_magazine']) giveItem(H, p0(H).vindicta, id);
    mergeRem(H, p0(H).vindicta);
    expect(ids(H)).toEqual([]);
    const U = clean();
    const up = giveItem(U, p0(U).haze, 'titanic_magazine');
    up.boughtOnTurn = 2; up.paid = 2; up.replaced = loose(U, 'extended_magazine', '0');
    expect(ids(U)).toEqual([]);
  });

  it('a state that is merely finished (game over) is not reported for the winner\'s patron or a corpse Active', () => {
    const G = clean();
    G.players['1'].hp = 0;
    expect(ids(G, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('patron-dead-no-gameover');
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
  it('patron loses hp with no hero falling', () => {
    expect(ids2(pair((G) => { G.players['1'].hp -= 1; }))).toContain('patron-delta');
  });
  it('a hero falls and the patron does not pay', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 3; }))).toContain('patron-delta');
  });
  it('a hero falls and the patron pays exactly 1: fine', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 3; G.players['1'].hp -= 1; }))).not.toContain('patron-delta');
  });
  it('an item vanishes from the board; one appears from nowhere', () => {
    const base = clean();
    giveItem(base, p0(base).haze, 'extra_spirit');
    expect(ids2(pair((G) => { G.players['0'].active!.attached = []; G.players['0'].active!.spiritMod -= 1; }, base))).toContain('card-vanished');
    expect(ids2(pair((G) => { giveItem(G, G.players['0'].bench[0]!, 'grit'); }))).toContain('card-appeared');
  });
  it('a sale may take its item away, an upgrade its component, and a purchase brings exactly one', () => {
    const G = shopGame();
    giveItem(G, p0(G).haze, 'extended_magazine');
    const up = made(G, 'buy', ['titanic_magazine', p0(G).haze.iid]);
    expect(up.check()).toEqual([]);
    expect(up.check((A) => { giveItem(A, A.players['0'].bench[0]!, 'grit'); })).toContain('card-appeared');
    const sale = made(up.after.G, 'sell', [up.after.G.players['0'].active!.attached![0].iid]);
    expect(sale.check()).toEqual([]); // the component is back: it may appear
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
    const fall = (G: GameState) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 3; G.players['1'].hp -= 1; };
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
  it('souls: a purchase costs its price (an upgrade the difference), a sale refunds, a move and the close are free', () => {
    const G = shopGame(10);
    const buy = made(G, 'buy', ['extended_magazine', p0(G).haze.iid]);
    expect(buy.check()).toEqual([]);
    expect(buy.check((A) => { A.players['0'].souls += 1; })).toContain('souls-delta');
    const up = made(buy.after.G, 'buy', ['titanic_magazine', p0(G).haze.iid]); // 4 - 2
    expect(up.after.G.players['0'].souls).toBe(6);
    expect(up.check()).toEqual([]);
    expect(up.check((A) => { A.players['0'].souls -= 2; })).toContain('souls-delta'); // the full price
    // sold on the turn it was bought: what was paid comes back
    const sale = made(up.after.G, 'sell', [up.after.G.players['0'].active!.attached!.find((a) => a.cardId === 'titanic_magazine')!.iid]);
    expect(sale.after.G.players['0'].souls).toBe(8);
    expect(sale.check((A) => { A.players['0'].souls += 2; })).toContain('souls-delta');
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
  it('the Act: after the attack only endTurn and a promotion are accepted; one Retreat a turn', () => {
    const p = pair(() => undefined);
    p.before.G.attackUsed = true;
    expect(moveIds(p, 'useSkill', [heroIid(p)])).toContain('act-over');
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

  it('a purchase: an active starts on its full cooldown (less the Cooldown family) or with its charges; the purchase is recorded; an upgrade keeps its component aside', () => {
    const G = shopGame();
    const cold = made(G, 'buy', ['cold_front', p0(G).haze.iid]);
    const worn = (A: GameState, id: string) => A.players['0'].active!.attached!.find((a) => a.cardId === id)!;
    expect(worn(cold.after.G, 'cold_front').cooldowns).toEqual({ cold_front: 2 });
    expect(cold.check()).toEqual([]);
    expect(cold.check((A) => { worn(A, 'cold_front').cooldowns = { cold_front: 1 }; })).toContain('bought-item-state');
    expect(cold.check((A) => { worn(A, 'cold_front').paid = 2; })).toContain('bought-item-state');
    expect(cold.check((A) => { worn(A, 'cold_front').boughtOnTurn = 1; })).toContain('bought-item-state');
    const knock = made(G, 'buy', ['knockdown', p0(G).haze.iid]);
    expect(knock.check()).toEqual([]);
    expect(knock.check((A) => { worn(A, 'knockdown').charges = 1; })).toContain('bought-item-state');
    // Superior Cooldown: a tier 3 active starts on 2, not 3.
    const H = shopGame();
    giveItem(H, p0(H).haze, 'superior_cooldown');
    const fast = made(H, 'buy', ['silence_glyph', p0(H).haze.iid]);
    expect(worn(fast.after.G, 'silence_glyph').charges).toBe(HARD_CC_CHARGES); // hard crowd control: charges, no cooldown
    const glyph = made(H, 'buy', ['alchemical_fire', p0(H).haze.iid]);
    expect(worn(glyph.after.G, 'alchemical_fire').cooldowns).toEqual({ alchemical_fire: 2 });
    expect(glyph.check()).toEqual([]);
    expect(glyph.check((A) => { worn(A, 'alchemical_fire').cooldowns = { alchemical_fire: 3 }; })).toContain('bought-item-state');
    // An upgrade replaces its component and holds it for the turn.
    const U = shopGame();
    giveItem(U, p0(U).haze, 'grit');
    const ward = made(U, 'buy', ['guardian_ward', p0(U).haze.iid]);
    expect(ward.check()).toEqual([]);
    expect(ward.check((A) => { worn(A, 'guardian_ward').replaced = undefined; })).toContain('bought-item-state');
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
  it('a sale takes the item off the board, and a same-turn upgrade\'s sale gives its component back', () => {
    const G = shopGame();
    giveItem(G, p0(G).haze, 'extended_magazine');
    const up = made(G, 'buy', ['titanic_magazine', p0(G).haze.iid]);
    const titanic = up.after.G.players['0'].active!.attached!.find((a) => a.cardId === 'titanic_magazine')!;
    const sale = made(up.after.G, 'sell', [titanic.iid]);
    expect(sale.after.G.players['0'].active!.attached!.map((a) => a.cardId)).toEqual(['extended_magazine']);
    expect(sale.check()).toEqual([]);
    expect(sale.check((A) => { A.players['0'].active!.attached = []; A.players['0'].active!.atkMod -= 1; })).toContain('sold-item-gone');
    expect(sale.check((A) => { const h = A.players['0'].active!; h.attached!.push({ ...titanic, attachedTo: h.iid }); h.atkMod += 2; })).toContain('sold-item-gone');
  });
  it('the bonus goes on with a purchase, off with a sale (HP clamped, never healed), across with a move — and no other hero is touched', () => {
    const G = shopGame();
    const buy = made(G, 'buy', ['extended_magazine', p0(G).haze.iid]);
    expect(buy.check()).toEqual([]);
    expect(buy.check((A) => { A.players['0'].active!.atkMod += 1; })).toContain('equip-bonus');
    expect(buy.check((A) => { A.players['0'].bench[0]!.hp -= 1; })).toContain('equip-bonus');
    // Extra Health's +2 HP: current HP rises with it…
    const hp = made(G, 'buy', ['extra_health', p0(G).haze.iid]);
    expect([hp.after.G.players['0'].active!.hp, hp.after.G.players['0'].active!.hpMax]).toEqual([7, 7]);
    expect(hp.check((A) => { A.players['0'].active!.hp = 5; })).toContain('equip-bonus');
    // …and a sale clamps it to the new max: a hero at 6/7 ends 5/5, one at 3/7 stays 3/5.
    const H = shopGame();
    const eh = giveItem(H, p0(H).haze, 'extra_health');
    p0(H).haze.hp = 6;
    const sale = made(H, 'sell', [eh.iid]);
    expect([sale.after.G.players['0'].active!.hp, sale.after.G.players['0'].active!.hpMax]).toEqual([5, 5]);
    expect(sale.check()).toEqual([]);
    expect(sale.check((A) => { A.players['0'].active!.hp = 4; })).toContain('equip-bonus');
    // a move: off the one hero, onto the other
    const mv = made(H, 'moveItem', [eh.iid, p0(H).vindicta.iid]);
    expect(mv.check()).toEqual([]);
    expect(mv.check((A) => { A.players['0'].bench[0]!.hpMax -= 2; })).toContain('equip-bonus');
    // the Vitality spike: a third Vitality item adds 1 more max HP
    const V = shopGame();
    giveItem(V, p0(V).haze, 'extra_regen');
    giveItem(V, p0(V).haze, 'sprint_boots');
    const spike = made(V, 'buy', ['extra_health', p0(V).haze.iid]);
    expect(spike.after.G.players['0'].active!.hpMax).toBe(5 + 2 + 1);
    expect(spike.check()).toEqual([]);
    expect(spike.check((A) => { A.players['0'].active!.hpMax -= 1; A.players['0'].active!.hp -= 1; })).toContain('equip-bonus');
  });
  it('exp: +1 for a hero\'s first wearing of an item it buys — not for a rebuy, a corpse or a move; a hero never forgets', () => {
    const G = shopGame();
    const first = made(G, 'buy', ['extra_spirit', p0(G).haze.iid]);
    expect(first.after.G.players['0'].active!.exp).toBe(1);
    expect(first.check()).toEqual([]);
    expect(first.check((A) => { A.players['0'].active!.exp = 0; })).toContain('equip-exp');
    expect(first.check((A) => { A.players['0'].active!.equippedIds = []; })).toContain('equip-exp');
    const H = shopGame();
    p0(H).haze.equippedIds = ['extra_spirit'];
    const rebuy = made(H, 'buy', ['extra_spirit', p0(H).haze.iid]);
    expect(rebuy.after.G.players['0'].active!.exp).toBe(0);
    expect(rebuy.check()).toEqual([]);
    expect(rebuy.check((A) => { A.players['0'].active!.exp = 1; })).toContain('equip-exp');
    const C = shopGame();
    const corpse = p0(C).vindicta;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    const dead = made(C, 'buy', ['extra_spirit', corpse.iid]);
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
  it('the step: the shop step takes the shop\'s moves only, the act step none of them', () => {
    const inShop = pair(() => undefined, freshReadyGame({ step: 'shop' }));
    expect(moveIds(inShop, 'useSkill', [])).toContain('step-shop-moves');
    expect(moveIds(inShop, 'attack', [])).toContain('step-shop-moves');
    expect(moveIds(inShop, 'promoteToActive', [])).not.toContain('step-shop-moves');
    const inAct = pair(() => undefined);
    expect(moveIds(inAct, 'sell', [])).toContain('step-act-moves');
    expect(moveIds(inAct, 'closeShop', [])).toContain('step-act-moves');
    expect(moveIds(inAct, 'activate', [])).not.toContain('step-act-moves');
  });
  it('a shop move or an item use the rules refuse, accepted', () => {
    // a purchase in the act step
    expect(moveIds(pair(() => undefined), 'buy', ['extra_spirit', 'i1'])).toContain('accepted-illegal');
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
  it('the empty-lane push: at the end of a turn the rival\'s patron may lose the Active\'s bullet power', () => {
    const before = clean();
    for (const c of [before.players['1'].active!, ...before.players['1'].bench]) { c!.hp = 0; c!.respawnTurnsLeft = 3; }
    const after = structuredClone(before) as GameState;
    after.players['1'].hp -= 3; // Haze's 3 Bullet Power
    const end = (a: GameState, name: string) => collectTransitionViolations({ G: before, ctx: ctx() }, { G: a, ctx: ctx({ currentPlayer: '1', turn: 3 }) }, { name, args: [] }, true).map((v) => v.id);
    expect(end(after, 'endTurn')).not.toContain('patron-delta');
    expect(end(after, 'useSkill')).toContain('patron-delta');
    after.players['1'].hp -= 1;
    expect(end(after, 'endTurn')).toContain('patron-delta');
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

  it('the heuristic seat shops by its build and closes the shop; a random seat buys, sells and moves items too', () => {
    const made: Record<string, Set<string>> = { heuristic: new Set(), randomLegal: new Set() };
    for (const seed of [31, 32, 33]) {
      playGame({ seed, policies, afterMove: (_b, _a, m, accepted) => { if (accepted && !m.chaos) made[m.policy]?.add(m.name); } });
    }
    expect([...made.heuristic].filter((n) => ['buy', 'sell', 'moveItem', 'closeShop'].includes(n)).sort()).toEqual(['buy', 'closeShop']);
    expect(['buy', 'sell', 'moveItem', 'closeShop'].every((n) => made.randomLegal.has(n))).toBe(true);
  });

  it('chaos moves name every move the engine has and nothing else, with ids from the state', () => {
    const G = clean();
    giveItem(G, G.players['0'].active!, 'cold_front');
    const rnd = mulberry32(3);
    const names = new Set<string>();
    const iids = new Set<unknown>();
    for (let i = 0; i < 400; i++) {
      const m = chaosMove(G, '0', rnd);
      names.add(m.name);
      if (m.name === 'sell' || m.name === 'activate') iids.add(m.args[0]);
    }
    expect([...names].sort()).toEqual(Object.keys(DeadlockGame.moves!).sort());
    expect(iids.has(G.players['0'].active!.attached![0].iid)).toBe(true); // a worn item's own iid
  });

  it('callMove runs on a clone', () => {
    const G = freshReadyGame({ step: 'shop' });
    G.players['0'].souls = 5;
    const before = JSON.stringify(G);
    const r = callMove(G, ctx(), '0', 'buy', ['extra_spirit', G.players['0'].active!.iid]);
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

  it('prices: PRICE by tier; an upgrade costs the difference; a sale refunds what was paid on its turn, else half rounded down', () => {
    const G = clean();
    expect(['extended_magazine', 'titanic_magazine', 'decay', 'curse', 'hero_haze'].map(itemPriceOracle)).toEqual([2, 4, 8, 16, 0]);
    const haze = p0(G).haze;
    expect(buyPriceOracle(haze, 'titanic_magazine')).toBe(4);
    const mag = giveItem(G, haze, 'extended_magazine');
    expect(buyPriceOracle(haze, 'titanic_magazine')).toBe(2);
    expect(buyPriceOracle(haze, 'boundless_spirit')).toBe(16); // its component is Improved Spirit, not worn
    expect(sellRefundOracle(G, mag)).toBe(1); // worn from before: half of 2
    mag.boughtOnTurn = G.turnNumber; mag.paid = 2;
    expect(sellRefundOracle(G, mag)).toBe(2);
    const titanic = giveItem(G, p0(G).vindicta, 'titanic_magazine');
    titanic.boughtOnTurn = G.turnNumber; titanic.paid = 2; // bought over its component
    expect(sellRefundOracle(G, titanic)).toBe(2);
    titanic.boughtOnTurn = 1;
    expect(sellRefundOracle(G, titanic)).toBe(2); // half of 4
  });

  it('slots and worth: three items (four with the flex slot); every worn item counts, actives too; a merged Rem is a hero, not an item', () => {
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
    giveItem(G, rem, 'decay');
    expect(bountyOracle(G, rem)).toBe(1 + 1 + 2);
  });

  it('the shop oracle: the turn, the step, the market, the hero, duplicates, slots, upgrades at the cap, souls', () => {
    const G = shopGame();
    const haze = p0(G).haze;
    expect(buyBlockedOracle(G, '0', 'extra_spirit', haze.iid)).toBeNull();
    expect(buyBlockedOracle(G, '1', 'extra_spirit', G.players['1'].active!.iid)).toBe('not-your-turn');
    expect(buyBlockedOracle(clean(), '0', 'extra_spirit', 'i1')).toBe('not-shop-step');
    expect(buyBlockedOracle(G, '0', 'hero_haze', haze.iid)).toBe('no-item');
    expect(buyBlockedOracle(G, '0', 'curse', haze.iid)).toBe('off-market');
    expect(buyBlockedOracle(G, '0', 'extra_spirit', G.players['1'].active!.iid)).toBe('no-hero');
    giveItem(G, haze, 'extra_spirit');
    expect(buyBlockedOracle(G, '0', 'extra_spirit', haze.iid)).toBe('duplicate');
    giveItem(G, haze, 'extended_magazine');
    giveItem(G, haze, 'grit');
    expect(buyBlockedOracle(G, '0', 'extra_health', haze.iid)).toBe('full');
    expect(buyBlockedOracle(G, '0', 'titanic_magazine', haze.iid)).toBeNull(); // an upgrade takes its component's slot
    expect(buyBlockedOracle(G, '0', 'titanic_magazine', haze.iid, 1)).toBe('souls');
    const corpse = p0(G).vindicta;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    expect(buyBlockedOracle(G, '0', 'extra_health', corpse.iid)).toBeNull(); // a corpse may be shopped for
    const worn = haze.attached![0];
    expect(sellBlockedOracle(G, '0', worn.iid)).toBeNull();
    expect(sellBlockedOracle(G, '1', worn.iid)).toBe('not-your-turn');
    expect(moveItemBlockedOracle(G, '0', worn.iid, haze.iid)).toBe('same-hero');
    expect(moveItemBlockedOracle(G, '0', worn.iid, corpse.iid)).toBeNull();
    giveItem(G, p0(G).lash, 'extra_spirit');
    expect(moveItemBlockedOracle(G, '0', worn.iid, p0(G).lash.iid)).toBe('duplicate');
    G.pendingPromotion = '0';
    expect(buyBlockedOracle(G, '0', 'extra_health', corpse.iid)).toBe('promotion-owed');
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
    expect(buyBlockedOracle(G, '0', 'extra_spirit', stray.iid)).toBe('no-hero');
    expect(buyBlockedOracle(G, '0', 'extra_spirit', nextTestIid())).toBe('no-hero');
  });
});

/** The shop step of P0's turn with souls to spend. */
function shopGame(souls = 30): GameState {
  const G = freshReadyGame({ step: 'shop' });
  G.players['0'].souls = souls;
  return G;
}
