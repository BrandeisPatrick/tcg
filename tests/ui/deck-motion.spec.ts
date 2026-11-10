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
import type { DeckFx, FxEvent, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { upgradesOf } from '@/cards/decks';
import { openDraftedMatch } from '@/engine/actions/setup';
import { discardFromHand, drawCards, heroToHand } from '@/engine/deck';
import { INVALID, perform } from '@/engine/engine';
import { OPENING_DRAW } from '@/engine/constants';
import {
  DECK_MOTION as T, EMPTY_PLAN, admitBatch, arrivingIids, deckEvents, locate, planDeckMotion, rivalPlacedBy, PileTicker,
} from '@/ui/motion';
import { freshBatch } from '@/ui/effects/fx/fxTimeline';
import { TEST_ROSTERS, freshReadyGame, giveCard, makeHero, playNew, stackDeck, useItem } from '../engine/_helpers';
import { tickRemMerges } from '@/engine/statusOps';
import { playGame } from '../engine/fuzz/driver';

const snapshot = (G: GameState): GameState => structuredClone(G);
const ofKind = (plan: ReturnType<typeof planDeckMotion>, what: DeckFx['what']) => plan.flights.filter((f) => f.what === what);

/** A drafted match's opening, as the board sees it: the draft's last pick
 *  stocks the decks and asks seat 0 (the human seat) for its first Active;
 *  the choice is the batch that places both Actives, shuffles the heroes in
 *  and deals. Returns the game before that batch and after it, with the hero
 *  chosen. */
function opening() {
  const G = freshReadyGame();
  const drafting = snapshot(G);
  drafting.draft = { pool: [], order: [], currentIndex: 8, picks: { '0': [], '1': [] } };
  G.fx = [];
  const picks = { '0': TEST_ROSTERS['0'].slice(0, 4), '1': TEST_ROSTERS['1'].slice(0, 4) };
  openDraftedMatch(G, picks);
  // The last pick's batch: nothing flies yet (the decks are stocked unseen; the picker is up).
  expect(planDeckMotion(G.fx, { me: '0', before: drafting, after: G })).toBe(EMPTY_PLAN);
  const before = snapshot(G);
  const chosen = G.players['0'].deck.find((c) => CARDS_BY_ID[c.cardId]?.type === 'hero')!;
  expect(perform(G, '0', { type: 'chooseActive', cardIid: chosen.iid })).not.toBe(INVALID);
  return { G, before, picks, chosen };
}

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

  it('a ride: Rem flies from her slot onto the bearer as Tag Along is used, and off it back to her bench slot when the ride is over', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    const bearer = ps.active!;
    const rem = ps.bench[1] = makeHero('hero_rem', '0', 'bench', 2);
    ps.souls = 10;
    const before = snapshot(G);
    G.fx = [];
    expect(perform(G, '0', { type: 'useSkill', heroIid: rem.iid, skillId: 'skill_rem', targetIid: bearer.iid })).not.toBe(INVALID);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const [on] = ofKind(plan, 'rideOn');
    expect(on).toMatchObject({ pid: '0', cardId: 'hero_rem', iid: rem.iid, at: 0, hold: 0, dur: T.flight, hide: rem.iid });
    expect(on.from).toEqual({ kind: 'slot', iid: rem.iid });
    expect(on.to).toEqual({ kind: 'worn', iid: rem.iid, bearerIid: bearer.iid });
    expect(on.faces).toEqual({ start: 'face', end: 'face' });
    expect(arrivingIids(plan, '0')).toEqual([]); // nothing lands in the hand
    expect(rivalPlacedBy(plan, '0')).toBe(0);    // nor is it a placement the AI waits on

    // The ride over, at her side's turn start: off the bearer, back to her slot.
    rem.remMergeTurnsLeft = 1;
    const riding = snapshot(G);
    G.fx = [];
    tickRemMerges(G, ps);
    expect(ps.bench[1]).toBe(rem);
    const [off] = ofKind(planDeckMotion(G.fx, { me: '0', before: riding, after: G }), 'rideOff');
    expect(off.from).toEqual({ kind: 'worn', iid: rem.iid, bearerIid: bearer.iid });
    expect(off.to).toEqual({ kind: 'slot', iid: rem.iid });
    expect(off.hide).toBe(rem.iid);
    expect(G.fx).toContainEqual(expect.objectContaining({ kind: 'deck', what: 'rideOff', slot: 2, bearerIid: bearer.iid }));
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

  it('the opening, in order: both Actives fly to the lane, each side’s other heroes fly into its deck, it riffles, then OPENING_DRAW is dealt — both sides at once', () => {
    const { G, before, picks, chosen } = opening();
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    expect(plan.opening).toBe(true);

    for (const pid of ['0', '1'] as const) {
      const ps = G.players[pid];
      const active = ps.active!;
      // 1. The Active, first: from the picker's card (yours) or the rival's hand, to the lane.
      const [placed, ...more] = ofKind(plan, 'place').filter((f) => f.pid === pid);
      expect(more).toEqual([]);
      expect(placed.iid).toBe(active.iid);
      expect(placed.at).toBe(T.lead);
      expect(placed.from).toEqual({ kind: 'hand', pid, iid: active.iid });
      expect(placed.to).toEqual({ kind: 'slot', iid: active.iid });
      expect(placed.hide).toBe(active.iid);
      const landed = T.lead + T.flight;
      // 2. The other three heroes into the deck — never the Active — then the riffle.
      const heroesIn = ofKind(plan, 'shuffle').filter((f) => f.pid === pid);
      expect(heroesIn.map((f) => f.cardId).sort()).toEqual([...picks[pid]].filter((id) => id !== active.cardId).sort());
      expect(heroesIn).toHaveLength(3);
      heroesIn.forEach((f, i) => {
        expect(f.at).toBe(landed + i * T.fanIn);
        expect(f.from).toEqual({ kind: 'stage', pid, i, n: 3 });
        expect(f.to).toEqual({ kind: 'pile', pile: 'deck', pid });
      });
      const riffle = plan.riffles.find((r) => r.pid === pid)!;
      const lastHeroIn = landed + 2 * T.fanIn + T.flight;
      expect(riffle.at).toBe(lastHeroIn);
      // 3. The deal of OPENING_DRAW waits for the riffle, then runs.
      const draws = ofKind(plan, 'draw').filter((f) => f.pid === pid);
      expect(draws).toHaveLength(OPENING_DRAW);
      draws.forEach((f, i) => expect(f.at).toBe(lastHeroIn + T.riffle + i * T.stagger));
    }
    // Yours leaves face up (the picker showed it); the rival's leaves as a back and turns over as it lands.
    expect(ofKind(plan, 'place').find((f) => f.pid === '0')!.faces).toEqual({ start: 'face', end: 'face' });
    expect(ofKind(plan, 'place').find((f) => f.pid === '1')!.faces).toEqual({ start: 'back', end: 'face' });
    expect(ofKind(plan, 'place').find((f) => f.pid === '0')!.iid).toBe(chosen.iid);
    // The sides run on their own clocks: both Actives leave together.
    expect(ofKind(plan, 'place').filter((f) => f.at === T.lead)).toHaveLength(2);
    // What arrives in your hand is in your hand.
    const inHand = new Set(G.players['0'].hand.map((c) => c.iid));
    expect(arrivingIids(plan, '0')).toHaveLength(OPENING_DRAW);
    for (const iid of arrivingIids(plan, '0')) expect(inHand.has(iid)).toBe(true);
    // The whole opening lands in under three seconds; the AI's first move waits for the rival's Active.
    expect(plan.total).toBe(T.lead + T.flight + 2 * T.fanIn + T.flight + T.riffle + (OPENING_DRAW - 1) * T.stagger + T.flight);
    expect(plan.total).toBeLessThan(3000);
    expect(rivalPlacedBy(plan, '0')).toBe(T.lead + T.flight);
  });

  it('a hero you place flies face up from its hand card to the slot you chose, the tile hidden until it lands', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.bench[1] = null;
    me.bench[2] = null;
    const kelvin = giveCard(G, '0', 'hero_kelvin');
    G.fx = [];
    const before = snapshot(G);
    expect(locate(before, '0', kelvin.iid)).toEqual({ kind: 'hand' });
    expect(perform(G, '0', { type: 'placeHero', cardIid: kelvin.iid, slot: 3 })).not.toBe(INVALID);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const [placed] = ofKind(plan, 'place');
    expect(placed).toMatchObject({ pid: '0', iid: kelvin.iid, cardId: 'hero_kelvin', at: 0, hold: 0, dur: T.flight });
    expect(placed.from).toEqual({ kind: 'hand', pid: '0', iid: kelvin.iid });
    expect(placed.to).toEqual({ kind: 'slot', iid: kelvin.iid });
    expect(placed.faces).toEqual({ start: 'face', end: 'face' });
    expect(placed.hide).toBe(kelvin.iid);
    expect(plan.ticks).toEqual([]);
    expect(plan.opening).toBe(false);
    expect(arrivingIids(plan, '0')).toEqual([]);
    // Nothing of the rival's was placed: the AI need not wait.
    expect(rivalPlacedBy(plan, '0')).toBe(0);
  });

  it("the rival's hero leaves its hand as a back and turns face up as it lands; after its turn's draw, the placement waits for the draw", () => {
    const G = freshReadyGame();
    const rival = G.players['1'];
    rival.bench[0] = null;
    const [kelvin] = stackDeck(G, '1', ['hero_kelvin']);
    G.turnNumber = 3; // the rival's turn
    G.fx = [];
    const before = snapshot(G);
    // Its draw and its placement in one batch (a turn's start, then the play).
    drawCards(G, '1', 1);
    expect(perform(G, '1', { type: 'placeHero', cardIid: kelvin.iid })).not.toBe(INVALID);
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    const [placed] = ofKind(plan, 'place');
    expect(placed.pid).toBe('1');
    expect(placed.faces).toEqual({ start: 'back', end: 'face' });
    expect(placed.from).toEqual({ kind: 'hand', pid: '1', iid: kelvin.iid });
    expect(placed.to).toEqual({ kind: 'slot', iid: kelvin.iid });
    expect(placed.hide).toBe(kelvin.iid);
    const draws = ofKind(plan, 'draw');
    const drawsEnd = Math.max(...draws.map((f) => f.at + f.dur));
    expect(placed.at).toBe(drawsEnd);
    expect(rivalPlacedBy(plan, '0')).toBe(placed.at + T.flight);
    // Under calm motion the board plans nothing, so there is nothing to wait for.
    expect(rivalPlacedBy(EMPTY_PLAN, '0')).toBe(0);
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

describe('the layer puts each batch up once', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const ownerOf = (pid: PlayerID): 'you' | 'rival' => (pid === '0' ? 'you' : 'rival');

  // The board shows only the draft until the last pick, so the layer mounts on
  // the render the opening's batch arrives, and React's StrictMode runs a
  // mount's effects twice in development. Put up twice, the opening's flights
  // and riffles were in the air twice under one key ("Encountered two children
  // with the same key") and each deck held every card dealt twice.
  it('the opening, put up again for the same batch (StrictMode replaying the mount), flies once — each placement included — and ticks each deck once', () => {
    const { G, before } = opening();
    const plan = planDeckMotion(G.fx, { me: '0', before, after: G });
    expect(ofKind(plan, 'place')).toHaveLength(2);
    const planKey = Math.max(...G.fx.map((e) => e.seq));
    const ticker = new PileTicker();
    const last = { current: 0 };
    const up: string[] = [];
    for (let run = 0; run < 2; run++) {
      if (admitBatch(last, planKey, plan, ticker, ownerOf)) up.push(...plan.flights.map((f) => f.key));
    }
    expect(up).toEqual(plan.flights.map((f) => f.key));
    expect(up.filter((k) => ofKind(plan, 'place').some((f) => f.key === k))).toHaveLength(2);
    for (const pid of ['0', '1'] as const) {
      const dealt = ofKind(plan, 'draw').filter((f) => f.pid === pid).length;
      expect(dealt).toBeGreaterThan(0);
      // The deck reads one more for each card still to leave it, once.
      expect(ticker.pendingFor(`deck-${ownerOf(pid)}`)).toBe(-dealt);
    }
    vi.runAllTimers();
    expect(ticker.pendingFor('deck-you')).toBe(0);
    expect(ticker.pendingFor('deck-rival')).toBe(0);
  });

  it('the next batch goes up; no batch (key 0) and an empty plan never do', () => {
    const G = freshReadyGame();
    const draw = (seq: number): FxEvent[] => [{ kind: 'deck', seq, what: 'draw', pid: '0', iid: `c${seq}`, cardId: 'headshot_booster' }];
    const ticker = new PileTicker();
    const last = { current: 0 };
    const first = planDeckMotion(draw(1), { me: '0', before: G, after: G });
    expect(admitBatch(last, 0, first, ticker, ownerOf)).toBe(false);
    expect(admitBatch(last, 1, EMPTY_PLAN, ticker, ownerOf)).toBe(false);
    expect(admitBatch(last, 1, first, ticker, ownerOf)).toBe(true);
    expect(admitBatch(last, 1, first, ticker, ownerOf)).toBe(false);
    expect(admitBatch(last, 2, planDeckMotion(draw(2), { me: '0', before: G, after: G }), ticker, ownerOf)).toBe(true);
    expect(ticker.pendingFor('deck-you')).toBe(-2);
  });

  // A flight's key is its event's seq: Board's batches never share an event,
  // through a drafted match with Victor's trigger prompt (answered from the
  // respond stage) and Silver's Wolf form.
  it('across a drafted match the AI plays to its end, with Victor and Silver, no card is planned to fly twice', () => {
    let seen = 0;
    let openings = 0;
    let asked = 0;
    const keys: string[] = [];
    playGame({
      seed: 8,
      policies: { '0': 'heuristic', '1': 'heuristic' },
      prefer: { '0': ['hero_victor'], '1': ['hero_silver'] },
      afterMove: (before, after, move, accepted) => {
        if (accepted && (move.name === 'useTrigger' || move.name === 'passTrigger')) asked++;
        const fx = after.G.fx ?? [];
        const fresh = freshBatch(fx, seen);
        seen = Math.max(seen, ...fx.map((e) => e.seq));
        if (fresh.length === 0) return;
        const plan = planDeckMotion(fresh, { me: '0', before: before.G, after: after.G });
        if (plan.opening) openings++;
        keys.push(...plan.flights.map((f) => f.key));
      },
    });
    expect(asked).toBeGreaterThan(0);
    expect(openings).toBe(1);
    expect(keys.length).toBeGreaterThan(20);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
