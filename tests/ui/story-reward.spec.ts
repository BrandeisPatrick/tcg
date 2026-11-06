import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { StoryRun } from '@/story/types';
import { newRun, clearNode, takeReward, loadRun, saveRun, emptyReward } from '@/story/storyRun';
import { buildStoryMatch, enemySouls, rewardChoices, supplyOffer } from '@/story/content';
import { itemCard } from '@/cards';

// Story has no deck: a supply stop offers an item or souls for the next
// fight, the fight's setup hands them to the engine, and the fight spends
// them.

const node = (run: StoryRun, id: string) => run.nodes.find((n) => n.id === id)!;
const clearAll = (run: StoryRun, ids: string[]) => ids.reduce(clearNode, run);

describe('the next fight\'s supplies', () => {
  it('start empty on a new run', () => {
    expect(newRun('hero_kelvin').nextFight).toEqual({ items: [], souls: 0 });
  });

  it('add up as supplies are taken', () => {
    let run = newRun('hero_kelvin');
    run = takeReward(run, { item: 'extra_health' });
    run = takeReward(run, { souls: 4 });
    run = takeReward(run, { item: 'cold_front' });
    run = takeReward(run, { souls: 8 });
    expect(run.nextFight).toEqual({ items: ['extra_health', 'cold_front'], souls: 12 });
  });

  it('go into the fight: buildStoryMatch hands them over as playerItems and playerSouls', () => {
    const run = takeReward(takeReward(newRun('hero_kelvin'), { item: 'extra_health' }), { souls: 4 });
    const setup = buildStoryMatch(run, node(run, 'battery'));
    expect(setup.playerHeroes).toEqual(['hero_kelvin']);
    expect(setup.playerItems).toEqual(['extra_health']);
    expect(setup.playerSouls).toBe(4);
    // A copy: the setup never aliases the run's own list.
    expect(setup.playerItems).not.toBe(run.nextFight.items);
    expect(setup).not.toHaveProperty('playerDeck');
    expect(setup).not.toHaveProperty('enemyDeck');
  });

  it('are spent by the fight, and only by a fight', () => {
    let run = clearAll(newRun('hero_kelvin'), ['battery']);
    run = { ...run, heroes: ['hero_kelvin', 'hero_haze', 'hero_abrams', 'hero_yamato'] };
    // A full roster turns Wall Street into supplies: taking one and clearing
    // the stop keeps it waiting.
    run = takeReward(clearNode(run, 'wallst'), { item: 'extra_health' });
    run = takeReward(clearNode(run, 'bkbridge'), { souls: 4 });
    expect(run.nextFight).toEqual({ items: ['extra_health'], souls: 4 });
    expect(buildStoryMatch(run, node(run, 'cityhall'))).toMatchObject({ playerItems: ['extra_health'], playerSouls: 4 });
    // The fight is won: the next one starts from nothing.
    run = clearNode(run, 'cityhall');
    expect(run.nextFight).toEqual(emptyReward());
    expect(buildStoryMatch(run, node(run, 'timessq'))).toMatchObject({ playerItems: [], playerSouls: 0 });
  });
});

describe('a supply stop', () => {
  it('offers two items and a purse of souls, the same for a run and a stop', () => {
    const run = newRun('hero_kelvin');
    const wall = node(run, 'wallst');
    const choices = rewardChoices(run, wall);
    expect(choices).toHaveLength(3);
    expect(rewardChoices(run, wall)).toEqual(choices);
    const [a, b, souls] = choices;
    for (const c of [a, b]) {
      expect('item' in c).toBe(true);
      const item = 'item' in c ? itemCard(c.item) : undefined;
      expect(item).toBeDefined();
      expect(supplyOffer(wall.depth).tiers).toContain(item!.tier);
    }
    expect(a).not.toEqual(b);
    expect(souls).toEqual({ souls: supplyOffer(wall.depth).souls });
  });

  it('deals dearer items and more souls deeper in', () => {
    expect(supplyOffer(1)).toEqual({ tiers: [1, 2], souls: 4 });
    expect(supplyOffer(3)).toEqual({ tiers: [2, 3], souls: 8 });
    expect(supplyOffer(6)).toEqual({ tiers: [3, 4], souls: 12 });
    const run = newRun('hero_kelvin');
    const deep = rewardChoices(run, node(run, 'cloisters'));
    for (const c of deep.slice(0, 2)) expect([3, 4]).toContain('item' in c ? itemCard(c.item)?.tier : 0);
  });
});

describe('the opponent', () => {
  it('has no deck, and a war chest that grows with depth', () => {
    const run = newRun('hero_kelvin');
    expect(buildStoryMatch(run, node(run, 'battery')).enemySouls).toBe(0);
    expect(buildStoryMatch(run, node(run, 'cityhall')).enemySouls).toBe(enemySouls(2, 'battle'));
    expect(enemySouls(2, 'battle')).toBe(4);
    expect(enemySouls(5, 'elite')).toBeGreaterThan(enemySouls(5, 'battle'));
    expect(buildStoryMatch(run, node(run, 'yankee')).enemySouls).toBe(enemySouls(7, 'boss'));
    expect(enemySouls(7, 'boss')).toBeGreaterThan(enemySouls(7, 'battle'));
  });
});

describe('a saved run', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it('round-trips with its supplies', () => {
    const run = takeReward(newRun('hero_kelvin'), { item: 'cold_front' });
    saveRun(run);
    expect(loadRun()).toEqual(run);
  });

  it('saved with a deck comes back without it and with nothing waiting', () => {
    const { nextFight: _, ...rest } = newRun('hero_kelvin');
    store.set('deadlock-tcg-story', JSON.stringify({ ...rest, deck: ['healing_rite', 'rusted_barrel'] }));
    const run = loadRun()!;
    expect(run).not.toHaveProperty('deck');
    expect(run.nextFight).toEqual({ items: [], souls: 0 });
    expect(run.heroes).toEqual(['hero_kelvin']);
  });

  it('keeps only known items and whole souls', () => {
    const run = newRun('hero_kelvin');
    store.set('deadlock-tcg-story', JSON.stringify({ ...run, nextFight: { items: ['extra_health', 'no_such_item', 'hero_haze'], souls: 5.7 } }));
    expect(loadRun()!.nextFight).toEqual({ items: ['extra_health'], souls: 5 });
  });
});
