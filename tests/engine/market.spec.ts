/**
 * The market (src/engine/market.ts): what the shop sells in one match. It is
 * drawn from the match seed before the first pick — every tier 1 item, then per
 * tab MARKET_SLICE items of each higher tier from the items that are no hero's
 * signature — and each drafted hero's two signature items join it as the hero
 * is picked (a scripted match opens with both rosters' on sale). Being drawn
 * from `G.seed`, it replays from G alone, whatever Math.random does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { CardId, GameState, ItemTier } from '@/engine/types';
import { CARDS_BY_ID, HEROES, ITEMS, itemCard } from '@/cards';
import { DeadlockGame } from '@/engine/game';
import { setupGame } from '@/engine/actions/setup';
import { MARKET_SLICE } from '@/engine/constants';
import {
  ITEM_SLOTS, SIGNATURE_ITEMS, marketByTab, marketItems, marketStandIn, onSale, openingMarket,
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

describe('signature items join the market', () => {
  it('each draft pick puts the hero\'s two signature items on sale, each once, at the end', () => {
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77 });
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    const G0 = client.getState()!.G as GameState;
    expect(G0.draft).not.toBeNull();
    expect(G0.seed).toBe(77);
    expect(marketItems(G0)).toEqual(openingMarket(77));
    // Yamato's Extended Magazine is a tier 1 item, already on sale: only Shadow Weave joins.
    const picks = ['hero_yamato', 'hero_kelvin', 'hero_haze', 'hero_paige', 'hero_wraith', 'hero_dynamo', 'hero_lash', 'hero_abrams'];
    let expected = openingMarket(77);
    for (const heroId of picks) {
      client.moves.draftPick(heroId);
      expected = [...expected, ...newSignatures(expected, [heroId])];
      expect(marketItems(client.getState()!.G as GameState), heroId).toEqual(expected);
      for (const id of signatureOf(heroId)) expect(onSale(client.getState()!.G as GameState, id), `${heroId}: ${id}`).toBe(true);
    }
    const G = client.getState()!.G as GameState;
    expect(G.draft).toBeNull();
    expect(newSignatures(openingMarket(77), ['hero_yamato'])).toEqual(['shadow_weave']);
    client.stop();
  });

  it('a scripted match opens with both rosters\' signature items on sale (and so does freshReadyGame)', () => {
    configureReadyMatch();
    const client = Client({ game: DeadlockGame, numPlayers: 2 });
    client.start();
    const G = client.getState()!.G as GameState;
    const want = [...openingMarket(TEST_SEED), ...newSignatures(openingMarket(TEST_SEED), [...TEST_ROSTERS['0'], ...TEST_ROSTERS['1']])];
    expect(marketItems(G)).toEqual(want);
    for (const h of [...TEST_ROSTERS['0'], ...TEST_ROSTERS['1']]) for (const id of signatureOf(h)) expect(onSale(G, id), id).toBe(true);
    expect(marketItems(freshReadyGame())).toEqual(want);
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

  it('a drafted market is the seed\'s opening market plus the picks\' signatures, however Math.random moves during the draft', () => {
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
    expect(one.G.market).toEqual([...openingMarket(one.G.seed), ...newSignatures(openingMarket(one.G.seed), one.picks)]);
  });
});

describe('reading the market', () => {
  const G = freshReadyGame();

  it('onSale and marketByTab agree with the list: each item on sale under its tab and tier, once', () => {
    const byTab = marketByTab(G);
    const listed = ITEM_SLOTS.flatMap((slot) => ([1, 2, 3, 4] as const).flatMap((tier) => byTab[slot][tier]));
    expect([...listed].sort()).toEqual([...marketItems(G)].sort());
    for (const slot of ITEM_SLOTS) {
      for (const tier of [1, 2, 3, 4] as const) {
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
