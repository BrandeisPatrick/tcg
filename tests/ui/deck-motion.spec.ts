/**
 * The deck's motion is planned from the engine's `deck` FX events
 * (src/ui/motion/deckMotionPlan.ts), never from state diffs: pin what a batch
 * becomes — the opening's heroes into the deck and the riffle, a draw's
 * staggered flights and the deck's ticks, a discard from the hand or off a
 * hero, an upgrade appearing and going in, a fallen hero back to the hand —
 * on real engine runs, and the piles' count ticker that holds the numbers
 * until the card leaves or lands.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckFx, FxEvent, GameState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { upgradesOf } from '@/cards/decks';
import { openDraftedMatch } from '@/engine/actions/setup';
import { discardFromHand, heroToHand } from '@/engine/deck';
import { OPENING_HAND } from '@/engine/constants';
import {
  DECK_MOTION as T, EMPTY_PLAN, arrivingIids, deckEvents, locate, planDeckMotion, PileTicker,
} from '@/ui/motion';
import { TEST_ROSTERS, freshReadyGame, playNew, stackDeck, useItem } from '../engine/_helpers';

const snapshot = (G: GameState): GameState => structuredClone(G);
const ofKind = (plan: ReturnType<typeof planDeckMotion>, what: DeckFx['what']) => plan.flights.filter((f) => f.what === what);

describe('deck motion plan', () => {
  it('a batch with no deck events plans nothing', () => {
    const G = freshReadyGame();
    const batch: FxEvent[] = [{ kind: 'hit', seq: 1, iid: 'x', amount: 1, type: 'attack', ko: false, cast: 'attack' } as FxEvent];
    expect(planDeckMotion(batch, { me: '0', before: G, after: G })).toBe(EMPTY_PLAN);
    expect(deckEvents(batch)).toEqual([]);
  });

  it('a draw card: each card flies deck → hand, one stagger apart, and the deck ticks as each leaves', () => {
    const G = freshReadyGame();
    const stacked = stackDeck(G, '0', ['headshot_booster', 'extra_health', 'extra_spirit']);
    const before = snapshot(G);
    useItem(G, '0', 'improved_cooldown'); // Compress Cooldown: draw 2, discard 1
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const draws = ofKind(plan, 'draw');
    expect(draws).toHaveLength(2);
    expect(draws.map((f) => f.iid)).toEqual([stacked[0].iid, stacked[1].iid]);
    expect(draws.map((f) => f.at)).toEqual([0, T.stagger]);
    expect(draws.every((f) => f.dur === T.flight && f.hold === 0)).toBe(true);
    expect(draws.every((f) => f.from.kind === 'pile' && f.from.pile === 'deck')).toBe(true);
    expect(draws.map((f) => f.to)).toEqual([
      { kind: 'hand', pid: '0', iid: stacked[0].iid },
      { kind: 'hand', pid: '0', iid: stacked[1].iid },
    ]);
    // Yours land face up, out of a face-down deck; the real card stays hidden until then.
    expect(draws.every((f) => f.faces.start === 'back' && f.faces.end === 'face' && f.hide === f.iid)).toBe(true);
    expect(plan.ticks).toEqual([
      { pile: 'deck', pid: '0', at: 0, delta: -1 },
      { pile: 'deck', pid: '0', at: T.stagger, delta: -1 },
    ]);
    expect(plan.total).toBe(T.stagger + T.flight);
    expect(plan.opening).toBe(false);
    expect(arrivingIids(plan, '0')).toEqual([stacked[0].iid, stacked[1].iid]);
    expect(arrivingIids(plan, '1')).toEqual([]);
  });

  it('a draw of 8 lands in well under two seconds and never waits on the card before', () => {
    const G = freshReadyGame();
    stackDeck(G, '0', Array(8).fill('headshot_booster'));
    const before = snapshot(G);
    useItem(G, '0', 'transcendent_cooldown'); // draw 8, discard 4
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const draws = ofKind(plan, 'draw');
    expect(draws).toHaveLength(8);
    draws.forEach((f, i) => expect(f.at).toBe(i * T.stagger));
    expect(plan.total).toBe(7 * T.stagger + T.flight);
    expect(plan.total).toBeLessThan(2000);
  });

  it("the rival's draws stay face down and land in its hand", () => {
    const G = freshReadyGame();
    stackDeck(G, '1', ['headshot_booster']);
    const before = snapshot(G);
    G.fx = [];
    useItem(G, '1', 'improved_cooldown', undefined, G.players['1'].active!);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const [draw] = ofKind(plan, 'draw');
    expect(draw.pid).toBe('1');
    expect(draw.faces).toEqual({ start: 'back', end: 'back' });
    expect(draw.to).toEqual({ kind: 'hand', pid: '1', iid: draw.iid });
    expect(arrivingIids(plan, '0')).toEqual([]);
  });

  it('a discard from the hand flies hand → discard pile, face up, and the pile ticks as it lands', () => {
    const G = freshReadyGame();
    const [a, b] = stackDeck(G, '0', ['headshot_booster', 'extra_health']);
    useItem(G, '0', 'improved_cooldown');
    G.fx = [];
    const before = snapshot(G);
    discardFromHand(G, '0', [a.iid, b.iid]);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const discards = ofKind(plan, 'discard');
    expect(discards).toHaveLength(2);
    expect(discards[0].from).toEqual({ kind: 'hand', pid: '0', iid: a.iid });
    expect(discards[0].to).toEqual({ kind: 'pile', pile: 'discard', pid: '0' });
    expect(discards[0].faces).toEqual({ start: 'face', end: 'face' });
    expect(discards[0].hide).toBe(a.iid);
    expect(discards.map((f) => f.at)).toEqual([0, T.stagger]);
    expect(plan.ticks).toEqual([
      { pile: 'discard', pid: '0', at: T.flight, delta: 1 },
      { pile: 'discard', pid: '0', at: T.stagger + T.flight, delta: 1 },
    ]);
    // Nothing lands in the hand: nothing is arriving.
    expect(arrivingIids(plan, '0')).toEqual([]);
  });

  it("the rival's discard turns over: a back leaves its hand, a face lands on the pile", () => {
    const G = freshReadyGame();
    const [a] = stackDeck(G, '1', ['headshot_booster']);
    useItem(G, '1', 'improved_cooldown', undefined, G.players['1'].active!);
    G.fx = [];
    const before = snapshot(G);
    discardFromHand(G, '1', [a.iid]);
    const [d] = ofKind(planDeckMotion(G.fx, { me: '0', before, after: G }), 'discard');
    expect(d.faces).toEqual({ start: 'back', end: 'face' });
    expect(d.from).toEqual({ kind: 'hand', pid: '1', iid: a.iid });
  });

  it('an upgrade appears over the table, holds, then flies into the deck; the deck ticks up as it lands', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const before = snapshot(G);
    G.fx = [];
    playNew(G, '0', 'improved_cooldown', hero);
    const made = upgradesOf('improved_cooldown');
    expect(made.length).toBeGreaterThan(0);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const [up] = ofKind(plan, 'upgrade');
    expect(up).toBeDefined();
    expect(made).toContain(up.cardId);
    expect(up.from).toEqual({ kind: 'stage', pid: '0', i: 0, n: 1 });
    expect(up.to).toEqual({ kind: 'pile', pile: 'deck', pid: '0' });
    expect(up.hold).toBe(T.appear);
    expect(up.faces).toEqual({ start: 'face', end: 'face' });
    expect(plan.ticks).toEqual([{ pile: 'deck', pid: '0', at: T.appear + T.flight, delta: 1 }]);
    expect(plan.total).toBe(T.appear + T.flight);
  });

  it('an evolved upgrade: the item it replaced flies off the hero to the discard pile', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    const worn = playNew(G, '0', 'improved_cooldown', hero);
    const [upgradeId] = upgradesOf('improved_cooldown');
    G.fx = [];
    const before = snapshot(G);
    expect(locate(before, '0', worn.iid)).toEqual({ kind: 'worn', heroIid: hero.iid });
    playNew(G, '0', upgradeId, hero); // evolves over Compress Cooldown
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const off = ofKind(plan, 'discard').find((f) => f.iid === worn.iid);
    expect(off).toBeDefined();
    expect(off!.from).toEqual({ kind: 'slot', iid: hero.iid });
    expect(off!.hide).toBeUndefined();
  });

  it('a discard whose card cannot be placed is a tick on the pile alone', () => {
    const G = freshReadyGame();
    const ev: FxEvent = { kind: 'deck', seq: 9, what: 'discard', pid: '0', iid: 'nowhere', cardId: 'headshot_booster' };
    const plan = planDeckMotion([ev], { me: '0', before: G, after: G });
    expect(plan.flights).toEqual([]);
    expect(plan.ticks).toEqual([{ pile: 'discard', pid: '0', at: 0, delta: 1 }]);
    // No game before the batch at all: the same.
    expect(planDeckMotion([ev], { me: '0', before: null, after: G }).flights).toEqual([]);
  });

  it('a fallen hero back in the hand flies from its slot to the hand', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    const hero = ps.bench[0]!;
    const before = snapshot(G);
    G.fx = [];
    heroToHand(G, ps, hero);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const [back] = ofKind(plan, 'toHand');
    expect(back.from).toEqual({ kind: 'slot', iid: hero.iid });
    expect(back.to).toEqual({ kind: 'hand', pid: '0', iid: hero.iid });
    expect(back.faces).toEqual({ start: 'face', end: 'face' });
    expect(back.hide).toBe(hero.iid);
    expect(arrivingIids(plan, '0')).toEqual([hero.iid]);
    expect(plan.ticks).toEqual([]);
  });

  it('the opening: each side’s heroes fly into its deck, it riffles, then the hand is dealt — both sides at once', () => {
    const G = freshReadyGame();
    const before = snapshot(G);
    before.draft = { pool: [], order: [], currentIndex: 8, picks: { '0': [], '1': [] } };
    G.fx = [];
    const picks = { '0': TEST_ROSTERS['0'].slice(0, 4), '1': TEST_ROSTERS['1'].slice(0, 4) };
    openDraftedMatch(G, picks);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    expect(plan.opening).toBe(true);

    for (const pid of ['0', '1'] as const) {
      const heroesIn = ofKind(plan, 'shuffle').filter((f) => f.pid === pid);
      expect(heroesIn.map((f) => f.cardId).sort()).toEqual([...picks[pid]].sort());
      expect(heroesIn.every((f) => CARDS_BY_ID[f.cardId!]?.type === 'hero')).toBe(true);
      heroesIn.forEach((f, i) => {
        expect(f.at).toBe(T.lead + i * T.fanIn);
        expect(f.from).toEqual({ kind: 'stage', pid, i, n: 4 });
        expect(f.to).toEqual({ kind: 'pile', pile: 'deck', pid });
      });
      const riffle = plan.riffles.find((r) => r.pid === pid)!;
      const lastHeroIn = T.lead + 3 * T.fanIn + T.flight;
      expect(riffle.at).toBe(lastHeroIn);
      const draws = ofKind(plan, 'draw').filter((f) => f.pid === pid);
      expect(draws).toHaveLength(OPENING_HAND);
      // The deal waits for the riffle, then runs.
      expect(draws[0].at).toBe(lastHeroIn + T.riffle);
      draws.forEach((f, i) => expect(f.at).toBe(lastHeroIn + T.riffle + i * T.stagger));
    }
    // The sides run on their own clocks: the rival's first hero leaves with yours.
    expect(ofKind(plan, 'shuffle').filter((f) => f.at === T.lead)).toHaveLength(2);
    // What arrives in your hand is in your hand.
    const inHand = new Set(G.players['0'].hand.map((c) => c.iid));
    for (const iid of arrivingIids(plan, '0')) expect(inHand.has(iid)).toBe(true);
    // The prompt for the first Active waits for all of it.
    expect(plan.total).toBeGreaterThanOrEqual(T.lead + 3 * T.fanIn + T.flight + T.riffle + (OPENING_HAND - 1) * T.stagger + T.flight);
    expect(plan.total).toBeLessThan(3000);
  });

  it('a shuffle outside the opening is the riffle alone, and the run after it waits', () => {
    const G = freshReadyGame();
    const events: FxEvent[] = [
      { kind: 'deck', seq: 1, what: 'shuffle', pid: '0' },
      { kind: 'deck', seq: 2, what: 'draw', pid: '0', iid: 'c1', cardId: 'headshot_booster' },
    ];
    const plan = planDeckMotion(events, { me: '0', before: G, after: G });
    expect(plan.opening).toBe(false);
    expect(ofKind(plan, 'shuffle')).toEqual([]);
    expect(plan.riffles).toEqual([{ pid: '0', at: 0, dur: T.riffle }]);
    expect(ofKind(plan, 'draw')[0].at).toBe(T.riffle);
  });
});

describe('pile ticker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const ownerOf = (pid: '0' | '1'): 'you' | 'rival' => (pid === '0' ? 'you' : 'rival');

  it('holds a pile’s count until each tick fires, then lets it through, telling its subscribers', () => {
    const ticker = new PileTicker();
    const seen: number[] = [];
    ticker.subscribe(() => seen.push(ticker.pendingFor('deck-you')));
    ticker.schedule([
      { pile: 'deck', pid: '0', at: 0, delta: -1 },
      { pile: 'deck', pid: '0', at: 110, delta: -1 },
      { pile: 'discard', pid: '1', at: 380, delta: 1 },
    ], ownerOf);
    // Two draws not yet left: the deck shows two more than the engine's count.
    expect(ticker.pendingFor('deck-you')).toBe(-2);
    expect(ticker.pendingFor('discard-rival')).toBe(1);
    vi.advanceTimersByTime(0);
    expect(ticker.pendingFor('deck-you')).toBe(-1);
    vi.advanceTimersByTime(110);
    expect(ticker.pendingFor('deck-you')).toBe(0);
    expect(ticker.pendingFor('discard-rival')).toBe(1);
    vi.advanceTimersByTime(300);
    expect(ticker.pendingFor('discard-rival')).toBe(0);
    expect(seen).toEqual([-2, -1, 0, 0]);
  });

  it('clear drops what has not fired', () => {
    const ticker = new PileTicker();
    ticker.schedule([{ pile: 'deck', pid: '0', at: 500, delta: -1 }], ownerOf);
    expect(ticker.pendingFor('deck-you')).toBe(-1);
    ticker.clear();
    expect(ticker.pendingFor('deck-you')).toBe(0);
    vi.advanceTimersByTime(600);
    expect(ticker.pendingFor('deck-you')).toBe(0);
  });

  it('an unsubscribed listener hears nothing more', () => {
    const ticker = new PileTicker();
    let n = 0;
    const off = ticker.subscribe(() => { n++; });
    ticker.schedule([{ pile: 'deck', pid: '0', at: 10, delta: -1 }], ownerOf);
    expect(n).toBe(1);
    off();
    vi.advanceTimersByTime(20);
    expect(n).toBe(1);
  });
});
