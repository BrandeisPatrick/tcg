/**
 * The item data the deck and the builds stand on (src/cards): every item has a
 * tab, a tier and the tier's price, every upgrade names a real component, every
 * hero has two signature items and a default build in the agreed shape — and
 * the save keeps a build per hero (storage/playerData.ts), migrating retired
 * ids the way the cards say.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARDS_BY_ID, HEROES, ITEMS, itemCard, migrateCardIds, RETIRED_CARDS } from '@/cards';
import { BUILD_SIZE, DEFAULT_BUILDS, defaultBuild } from '@/cards/builds';
import { ITEM_SLOTS } from '@/cards/decks';
import { itemPrice } from '@/engine/query';
import { PRICE } from '@/engine/constants';
import { getBuild, saveBuild } from '@/storage/playerData';

const tier = (id: string) => itemCard(id)!.tier;

describe('items', () => {
  it('every item is an active (spell) or a passive (equipment) item, with a tab and a tier 1–5', () => {
    expect(ITEMS.length).toBeGreaterThan(0);
    for (const item of ITEMS) {
      expect(['spell', 'equipment'], item.id).toContain(item.type);
      expect(ITEM_SLOTS, item.id).toContain(item.slot);
      expect([1, 2, 3, 4, 5], item.id).toContain(item.tier);
      expect(itemCard(item.id), item.id).toBe(item);
    }
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('an item costs its tier\'s price, and nothing that is no item has one', () => {
    for (const item of ITEMS) expect(itemPrice(item.id), item.id).toBe(PRICE[item.tier]);
    expect(PRICE).toEqual({ 1: 2, 2: 4, 3: 8, 4: 16, 5: 24 });
    expect(itemPrice('hero_haze')).toBe(0);
    expect(itemPrice('ult_haze')).toBe(0);
    expect(itemPrice('no_such_item')).toBe(0);
  });

  it('every upgrade names another item, of a lower tier, as its component (so it costs a positive difference)', () => {
    const upgrades = ITEMS.filter((i) => i.upgradesFrom !== undefined);
    expect(upgrades.length).toBeGreaterThan(0);
    for (const item of upgrades) {
      const component = itemCard(item.upgradesFrom);
      expect(component, `${item.id} upgrades from ${item.upgradesFrom}`).toBeDefined();
      expect(component!.id, item.id).not.toBe(item.id);
      expect(component!.tier, item.id).toBeLessThan(item.tier);
    }
  });

  it('only hard crowd control on an active carries `hardCC`', () => {
    for (const item of ITEMS) {
      if ('hardCC' in item && item.hardCC) expect(item.type, item.id).toBe('spell');
    }
  });
});

describe('signature items', () => {
  it.each(HEROES.map((h) => [h.id, h] as const))('%s has two different signature items, one of tier 1 or 2', (_id, hero) => {
    expect(hero.signature).toHaveLength(2);
    const [a, b] = hero.signature;
    expect(a).not.toBe(b);
    for (const id of hero.signature) expect(itemCard(id), `${hero.id}: ${id}`).toBeDefined();
    expect(hero.signature.some((id) => tier(id) <= 2), `${hero.id}: ${hero.signature.join(', ')}`).toBe(true);
  });
});

describe('default builds', () => {
  it('cover every hero, and nothing else', () => {
    expect(Object.keys(DEFAULT_BUILDS).sort()).toEqual(HEROES.map((h) => h.id).sort());
    expect(BUILD_SIZE).toBe(6);
  });

  it.each(HEROES.map((h) => [h.id, h] as const))('%s: six different known items — its signatures, then tiers 2, 2, 3 and 4 (or a tier-5 card)', (_id, hero) => {
    const build = defaultBuild(hero.id);
    expect(build).toHaveLength(BUILD_SIZE);
    for (const id of build) expect(itemCard(id), `${hero.id}: ${id}`).toBeDefined();
    expect(new Set(build).size, hero.id).toBe(build.length);
    expect(build.slice(0, 2)).toEqual(hero.signature);
    const tiers = build.slice(2).map(tier);
    expect(tiers, `${hero.id}: ${build.slice(2).join(', ')}`).toEqual([2, 2, 3, tiers[3] === 5 ? 5 : 4]);
  });

  it('defaultBuild hands out a copy, and nothing for an id that names no hero', () => {
    const a = defaultBuild('hero_haze');
    a.push('grit');
    expect(defaultBuild('hero_haze')).toHaveLength(BUILD_SIZE);
    expect(defaultBuild('no_such_hero')).toEqual([]);
  });
});

describe('the save keeps a build per hero', () => {
  // A Map-backed localStorage: the node test run has none.
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a hero with no saved build uses its default', () => {
    expect(getBuild('hero_haze')).toEqual(defaultBuild('hero_haze'));
  });

  it('a saved build is kept in order, cleaned up (retired ids replaced; unknown ids, non-items and repeats dropped), and capped at BUILD_SIZE', () => {
    saveBuild('hero_kelvin', ['improved_bullet_armor', 'cold_front', 'no_such_item', 'hero_haze', 'cold_front', 'knockdown', 'grit', 'decay', 'curse', 'healing_rite', 'extra_spirit']);
    expect(getBuild('hero_kelvin')).toEqual(['bullet_resilience', 'cold_front', 'knockdown', 'grit', 'decay', 'curse']);
    expect(getBuild('hero_haze')).toEqual(defaultBuild('hero_haze')); // the others keep theirs
  });

  it('saving an empty build puts the default back; an old deck-era save starts from the defaults', () => {
    saveBuild('hero_kelvin', ['grit']);
    saveBuild('hero_kelvin', []);
    expect(getBuild('hero_kelvin')).toEqual(defaultBuild('hero_kelvin'));
    store.set('deadlock-tcg-player', JSON.stringify({ preferredHeroes: [null, null, null, null], decks: [{ id: 'd', name: 'Old', cards: ['cold_front'] }], builds: { hero_kelvin: ['grit'] } }));
    expect(getBuild('hero_kelvin')).toEqual(defaultBuild('hero_kelvin'));
  });
});

describe('Save migration', () => {
  it('swaps a retired card for its replacement and drops an unknown id', () => {
    expect(migrateCardIds(['improved_bullet_armor', 'cold_front', 'no_such_card', 'improved_spirit_armor']))
      .toEqual(['bullet_resilience', 'cold_front', 'spirit_resilience']);
  });

  it('every replacement is an item the game knows', () => {
    for (const to of Object.values(RETIRED_CARDS)) {
      expect(CARDS_BY_ID[to], to).toBeDefined();
      expect(itemCard(to), to).toBeDefined();
    }
  });
});
