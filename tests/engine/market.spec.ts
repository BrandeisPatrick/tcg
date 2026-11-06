/**
 * The market (src/engine/market.ts): what the shop sells in one match. It is
 * drawn from the match seed before the first pick — every tier 1 item, then per
 * tab MARKET_SLICE items of each higher tier from the items that are no hero's
 * signature — and as each hero is picked its two signature items join it, then
 * every item of the picker's build of it (`buildOf`: the human seat's saved
 * build, `G.playerBuilds`, else the default build — every AI seat's), so a
 * build set up before the match can always be bought. A scripted match opens
 * with both rosters' on sale; `freshReadyGame`, a hand-built state, adds the
 * signatures only. Being drawn from `G.seed`, it replays from G alone, whatever
 * Math.random does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { CardId, GameState, ItemTier } from '@/engine/types';
import { CARDS_BY_ID, HEROES, ITEMS, itemCard } from '@/cards';
import { defaultBuild } from '@/cards/builds';
import { DeadlockGame } from '@/engine/game';
import { setupGame } from '@/engine/actions/setup';
import { MARKET_SLICE } from '@/engine/constants';
import {
  ITEM_SLOTS, SIGNATURE_ITEMS, buildOf, marketByTab, marketItems, marketStandIn, onSale, openingMarket,
} from '@/engine/market';
import { drawWithoutReplacement, seededRandom } from '@/engine/rng';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { TEST_ROSTERS, TEST_SEED, configureReadyMatch, freshReadyGame } from './_helpers';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 3);
const TIER1 = ITEMS.filter((i) => i.tier === 1).map((i) => i.id);
const signatureOf = (heroId: CardId): CardId[] => {
  const data = CARDS_BY_ID[heroId];
  return data?.type === 'hero' ? data.signature : [];
};
/** The signature items of `heroes`, in order, each once, minus those already in `market`. */
const newSignatures = (market: CardId[], heroes: CardId[]): CardId[] => {
  const out: CardId[] = [];
  for (const h of heroes) for (const id of signatureOf(h)) if (!market.includes(id) && !out.includes(id)) out.push(id);
  return out;
};
/** What a hero joining a side adds to `market`: its signature items, then the items of the
 *  build its side follows (left out: its default build), in order, each once, minus those
 *  already on sale. */
const newOnSale = (market: CardId[], heroId: CardId, build: CardId[] = defaultBuild(heroId)): CardId[] => {
  const out: CardId[] = [];
  for (const id of [...signatureOf(heroId), ...build]) if (itemCard(id) && !market.includes(id) && !out.includes(id)) out.push(id);
  return out;
};
/** The non-signature items of one tab and tier: what the random slice draws from. */
const slicePool = (slot: string, tier: ItemTier) => ITEMS.filter((i) => i.slot === slot && i.tier === tier && !SIGNATURE_ITEMS.has(i.id)).map((i) => i.id);

const saved = getMatchConfig();
afterEach(() => {
  setMatchConfig(saved);
  vi.restoreAllMocks();
});

describe('the opening market is drawn from the seed', () => {
  it('the same seed gives the same market, and the seeds do not all agree', () => {
    for (const seed of SEEDS) expect(openingMarket(seed)).toEqual(openingMarket(seed));
    expect(new Set(SEEDS.map((s) => JSON.stringify(openingMarket(s)))).size).toBeGreaterThan(1);
  });

  it('every tier 1 item is always on sale, first, in catalogue order', () => {
    expect(TIER1.length).toBeGreaterThan(0);
    for (const seed of SEEDS) expect(openingMarket(seed).slice(0, TIER1.length)).toEqual(TIER1);
  });

  it('then, per tab, MARKET_SLICE items of each higher tier — no signature item, nothing twice, fewer only when a tier runs short', () => {
    for (const seed of SEEDS) {
      const market = openingMarket(seed);
      const slice = market.slice(TIER1.length);
      expect(new Set(market).size, `seed ${seed}`).toBe(market.length);
      for (const id of slice) {
        expect(SIGNATURE_ITEMS.has(id), `seed ${seed}: ${id} is a signature item`).toBe(false);
        expect(itemCard(id)!.tier, `seed ${seed}: ${id}`).toBeGreaterThan(1);
      }
      for (const slot of ITEM_SLOTS) {
        for (const [tier, count] of MARKET_SLICE) {
          const drawn = slice.filter((id) => itemCard(id)!.slot === slot && itemCard(id)!.tier === tier);
          expect(drawn.length, `seed ${seed}: ${slot} T${tier}`).toBe(Math.min(count, slicePool(slot, tier).length));
        }
      }
      expect(slice.length).toBe(ITEM_SLOTS.reduce((n, slot) => n + MARKET_SLICE.reduce((m, [tier, count]) => m + Math.min(count, slicePool(slot, tier).length), 0), 0));
    }
  });

  it('the slice is drawn from the whole pool: over many seeds every non-signature item of tiers 2–4 turns up', () => {
    const seen = new Set<CardId>();
    for (let seed = 0; seed < 300; seed++) for (const id of openingMarket(seed)) seen.add(id);
    const pool = ITEMS.filter((i) => i.tier > 1 && !SIGNATURE_ITEMS.has(i.id)).map((i) => i.id);
    expect(pool.filter((id) => !seen.has(id))).toEqual([]);
  });

  it('a draw without replacement takes what a short pool has, and the seeded stream replays', () => {
    const r = seededRandom(5);
    expect(drawWithoutReplacement(['a'], 2, r)).toEqual(['a']);
    expect(drawWithoutReplacement([], 2, r)).toEqual([]);
    expect(drawWithoutReplacement(['a', 'b', 'c'], 3, r).sort()).toEqual(['a', 'b', 'c']);
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('signature items and builds join the market', () => {
  it('each draft pick puts the hero\'s two signature items, then its build, on sale — each once, at the end', () => {
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77 });
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    const G0 = client.getState()!.G as GameState;
    expect(G0.draft).not.toBeNull();
    expect(G0.seed).toBe(77);
    expect(marketItems(G0)).toEqual(openingMarket(77));
    // Yamato's Extended Magazine is a tier 1 item, already on sale: Shadow Weave joins, then his build's.
    const picks = ['hero_yamato', 'hero_kelvin', 'hero_haze', 'hero_paige', 'hero_wraith', 'hero_dynamo', 'hero_lash', 'hero_abrams'];
    let expected = openingMarket(77);
    for (const heroId of picks) {
      client.moves.draftPick(heroId);
      expected = [...expected, ...newOnSale(expected, heroId)];
      const G = client.getState()!.G as GameState;
      expect(marketItems(G), heroId).toEqual(expected);
      for (const id of [...signatureOf(heroId), ...defaultBuild(heroId)]) expect(onSale(G, id), `${heroId}: ${id}`).toBe(true);
    }
    const G = client.getState()!.G as GameState;
    expect(G.draft).toBeNull();
    expect(newSignatures(openingMarket(77), ['hero_yamato'])).toEqual(['shadow_weave']);
    client.stop();
  });

  it('the human seat\'s own build goes on sale with its pick; an AI seat\'s pick brings the default build', () => {
    const shelf = openingMarket(77);
    // Items no list here would put on sale: off the opening shelf, no signature, in neither default build.
    const defaults = [...defaultBuild('hero_haze'), ...defaultBuild('hero_kelvin')];
    const spare = ITEMS.filter((i) => !shelf.includes(i.id) && !SIGNATURE_ITEMS.has(i.id) && !defaults.includes(i.id)).map((i) => i.id);
    const mine = spare.slice(0, 4);
    const theirs = spare.slice(4, 6);
    const builds = { hero_haze: mine, hero_kelvin: theirs };
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77, builds });
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    const G0 = client.getState()!.G as GameState;
    expect(G0.humanSeat).toBe('0');
    expect(G0.playerBuilds).toEqual(builds);
    expect(G0.playerBuilds!.hero_haze).not.toBe(mine); // a copy, not the config's own list
    expect(buildOf(G0, '0', 'hero_haze')).toEqual(mine);
    expect(buildOf(G0, '1', 'hero_haze')).toEqual(defaultBuild('hero_haze'));
    expect(buildOf(G0, '0', 'hero_lash')).toEqual(defaultBuild('hero_lash')); // a hero the player did not build
    client.moves.draftPick('hero_haze');   // seat 0, the human seat: its own build
    client.moves.draftPick('hero_kelvin'); // seat 1, an AI seat: the default build, whatever the player saved
    const G = client.getState()!.G as GameState;
    const afterHaze = [...shelf, ...newOnSale(shelf, 'hero_haze', mine)];
    expect(marketItems(G)).toEqual([...afterHaze, ...newOnSale(afterHaze, 'hero_kelvin')]);
    for (const id of mine) expect(onSale(G, id), id).toBe(true);
    for (const id of theirs) expect(onSale(G, id), id).toBe(false);
    client.stop();
  });

  it('with no human seat nobody\'s saved builds are read: every pick brings its default build', () => {
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77, humanSeat: null, builds: { hero_haze: ['curse'] } });
    const G = setupGame();
    expect(G.playerBuilds).toBeUndefined();
    expect(buildOf(G, '0', 'hero_haze')).toEqual(defaultBuild('hero_haze'));
  });

  it('a scripted match opens with both rosters\' signature items and builds on sale; freshReadyGame with their signatures only', () => {
    configureReadyMatch();
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    const G = client.getState()!.G as GameState;
    let want = openingMarket(TEST_SEED);
    for (const h of [...TEST_ROSTERS['0'], ...TEST_ROSTERS['1']]) want = [...want, ...newOnSale(want, h)];
    expect(marketItems(G)).toEqual(want);
    for (const h of [...TEST_ROSTERS['0'], ...TEST_ROSTERS['1']]) {
      for (const id of [...signatureOf(h), ...defaultBuild(h)]) expect(onSale(G, id), `${h}: ${id}`).toBe(true);
    }
    expect(marketItems(freshReadyGame())).toEqual([...openingMarket(TEST_SEED), ...newSignatures(openingMarket(TEST_SEED), [...TEST_ROSTERS['0'], ...TEST_ROSTERS['1']])]);
    client.stop();
  });
});

describe('the market replays from G alone', () => {
  it('a match seed in the config draws the same market whatever Math.random returns', () => {
    setMatchConfig({
      heroPreferences: [null, null, null, null], seed: 4242,
      story: { playerHeroes: TEST_ROSTERS['0'], enemyHeroes: TEST_ROSTERS['1'], enemyBuff: { atk: 0, hp: 0 } },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const a = setupGame();
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const b = setupGame();
    expect(a.seed).toBe(4242);
    expect(b.market).toEqual(a.market);
    expect(a.market.slice(0, openingMarket(4242).length)).toEqual(openingMarket(4242));
  });

  it('without one, the seed comes from Math.random once — and G.seed alone redraws the market', () => {
    setMatchConfig({ heroPreferences: [null, null, null, null] });
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const a = setupGame();
    const b = setupGame();
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const c = setupGame();
    expect(b.seed).toBe(a.seed);
    expect(b.market).toEqual(a.market);
    expect(c.seed).not.toBe(a.seed);
    for (const G of [a, b, c]) expect(G.market).toEqual(openingMarket(G.seed));
  });

  it('a drafted market is the seed\'s opening market plus the picks\' signatures and builds, however Math.random moves during the draft', () => {
    const run = (noise: number) => {
      setMatchConfig({ heroPreferences: [null, null, null, null], seed: 9001 });
      vi.spyOn(Math, 'random').mockReturnValue(noise);
      const client = Client({ game: DeadlockGame, numPlayers: 2 });
      client.start();
      const picks = HEROES.slice(0, 8).map((h) => h.id);
      for (const id of picks) client.moves.draftPick(id);
      const G = client.getState()!.G as GameState;
      client.stop();
      return { G, picks };
    };
    const one = run(0.1);
    const two = run(0.9);
    expect(two.G.market).toEqual(one.G.market);
    let want = openingMarket(one.G.seed);
    for (const id of one.picks) want = [...want, ...newOnSale(want, id)];
    expect(one.G.market).toEqual(want);
  });
});

describe('reading the market', () => {
  const G = freshReadyGame();

  it('onSale and marketByTab agree with the list: each item on sale under its tab and tier, once', () => {
    const byTab = marketByTab(G);
    const listed = ITEM_SLOTS.flatMap((slot) => ([1, 2, 3, 4, 5] as const).flatMap((tier) => byTab[slot][tier]));
    expect([...listed].sort()).toEqual([...marketItems(G)].sort());
    for (const slot of ITEM_SLOTS) {
      for (const tier of [1, 2, 3, 4, 5] as const) {
        for (const id of byTab[slot][tier]) expect([itemCard(id)!.slot, itemCard(id)!.tier], id).toEqual([slot, tier]);
      }
    }
    const off = ITEMS.find((i) => !onSale(G, i.id))!;
    expect(off).toBeDefined();
    expect(onSale(G, off.id)).toBe(false);
    expect(onSale(G, 'hero_haze')).toBe(false);
  });

  it('marketStandIn: an item on sale stands for itself; one off sale for the first on-sale item of its tab and tier; none when there is none', () => {
    const on = marketItems(G)[0];
    expect(marketStandIn(G, on)).toBe(on);
    for (const item of ITEMS.filter((i) => !onSale(G, i.id))) {
      const sameShelf = ITEMS.filter((i) => i.slot === item.slot && i.tier === item.tier && onSale(G, i.id)).map((i) => i.id);
      expect(marketStandIn(G, item.id), item.id).toBe(sameShelf[0]);
      if (sameShelf.length > 1) expect(marketStandIn(G, item.id, [sameShelf[0]]), item.id).toBe(sameShelf[1]);
    }
    const bare = { market: [] as CardId[] };
    expect(marketStandIn(bare, 'cold_front')).toBeUndefined();
    expect(marketStandIn(G, 'no_such_item')).toBeUndefined();
  });
});
