/**
 * The save (storage/playerData.ts) at version 5: it keeps the deck builder's
 * deck (DECK_SIZE base items at most, MAX_COPIES of one, no upgrade) beside
 * the builds, and how hard the rival AI plays a Quick Match, 'normal' unless
 * the player chose otherwise. A version-4 save's deck has its upgrades made
 * their base items, a copy the cap turns away made up from the squad's
 * builds; a version-2 or -3 save keeps everything it had, with no deck, and
 * plays 'normal'; a version-1 save (the old deck game's) still starts its
 * builds from the defaults and brings no deck; a value the game does not know
 * reads as 'normal'.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiStrength } from '@/ai/heuristic';
import { defaultBuild } from '@/cards/builds';
import { buildsAcross, isBaseItem, isLegalDeck } from '@/cards/decks';
import { getAiStrength, getBuild, getDeck, loadPlayerData, saveAiStrength, saveBuild, saveDeck } from '@/storage/playerData';
import { DECK_SIZE, MAX_COPIES } from '@/engine/constants';

const KEY = 'deadlock-tcg-player';

describe('the save keeps the rival AI\'s strength', () => {
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

  const saved = () => JSON.parse(store.get(KEY)!);

  it('with nothing saved, the rival plays normal, there is no deck, and the save is at version 5', () => {
    expect(getAiStrength()).toBe('normal');
    expect(getDeck()).toEqual([]);
    expect(loadPlayerData().version).toBe(5);
  });

  it('a deck saves and reads back, kept to the rules: items only, at most MAX_COPIES of one, at most DECK_SIZE', () => {
    saveDeck(['grit', 'grit', 'cold_front']);
    expect(getDeck()).toEqual(['grit', 'grit', 'cold_front']);
    saveDeck([...Array(MAX_COPIES + 2).fill('grit'), 'hero_haze', 'nope', 'cold_front']);
    expect(getDeck()).toEqual([...Array(MAX_COPIES).fill('grit'), 'cold_front']);
    saveDeck(Array.from({ length: DECK_SIZE + 5 }, (_, i) => ['grit', 'cold_front', 'extra_health', 'extended_magazine', 'toxic_bullets', 'glass_cannon'][i % 6]));
    expect(getDeck()).toHaveLength(DECK_SIZE);
    saveBuild('hero_kelvin', ['grit']);
    expect(getDeck()).toHaveLength(DECK_SIZE);        // saving a build leaves the deck alone
    saveDeck([]);
    expect(getDeck()).toEqual([]);
    expect(getBuild('hero_kelvin')).toEqual(['grit']);
  });

  it('a version-2 save keeps its builds, lessons and preferred heroes, has no deck, and plays normal', () => {
    store.set(KEY, JSON.stringify({
      version: 2,
      preferredHeroes: ['hero_haze', null, 'hero_kelvin', null],
      builds: { hero_kelvin: ['grit', 'cold_front'] },
      lessonsDone: ['lesson-1', 'lesson-2'],
      tutorialDone: false,
    }));
    expect(loadPlayerData()).toEqual({
      version: 5,
      preferredHeroes: ['hero_haze', null, 'hero_kelvin', null],
      builds: { hero_kelvin: ['grit', 'cold_front'] },
      lessonsDone: ['lesson-1', 'lesson-2'],
      tutorialDone: false,
      aiStrength: 'normal',
      deck: [],
    });
    expect(getBuild('hero_kelvin')).toEqual(['grit', 'cold_front']);
    // The next save writes it back at version 5, whole.
    saveAiStrength('hard');
    expect(saved()).toEqual({
      version: 5,
      preferredHeroes: ['hero_haze', null, 'hero_kelvin', null],
      builds: { hero_kelvin: ['grit', 'cold_front'] },
      lessonsDone: ['lesson-1', 'lesson-2'],
      tutorialDone: false,
      aiStrength: 'hard',
      deck: [],
    });
    // Read again, a version-5 save keeps its builds too.
    expect(getBuild('hero_kelvin')).toEqual(['grit', 'cold_front']);
  });

  it('a deck saved with an upgrade in it keeps the upgrade\'s base item in its place', () => {
    saveDeck(['improved_spirit', 'grit', 'transcendent_cooldown']);
    expect(getDeck()).toEqual(['extra_spirit', 'grit', 'improved_cooldown']);
  });

  it('a version-4 deck: each upgrade becomes its base item, and a copy the cap turns away is made up from the squad\'s builds', () => {
    // Rem's build names Extra Spirit, Improved Spirit and Boundless Spirit: all three are Extra Spirit.
    const v4 = [
      'extra_spirit', 'extra_spirit', 'improved_spirit', 'improved_spirit', 'boundless_spirit', 'boundless_spirit',
      'titanic_magazine', 'extended_magazine', 'grit', 'grit', 'cold_front', 'cold_front',
      'healing_rite', 'healing_nova', 'glass_cannon', 'toxic_bullets',
    ];
    expect(isLegalDeck(v4)).toBe(false);
    store.set(KEY, JSON.stringify({
      version: 4, preferredHeroes: ['hero_haze', 'hero_kelvin', null, null], builds: {}, lessonsDone: [], tutorialDone: false, aiStrength: 'normal', deck: v4,
    }));
    const deck = loadPlayerData().deck;
    expect(deck).toHaveLength(DECK_SIZE);
    expect(isLegalDeck(deck)).toBe(true);
    expect(deck.every(isBaseItem)).toBe(true);
    // Six spirits make four Extra Spirits; Titanic Magazine is Extended Magazine, Healing Nova Healing Rite.
    expect(deck.slice(0, 13)).toEqual([
      'extra_spirit', 'extra_spirit', 'extra_spirit', 'extra_spirit', 'extended_magazine', 'extended_magazine',
      'grit', 'grit', 'cold_front', 'cold_front', 'healing_rite', 'healing_rite', 'glass_cannon',
    ]);
    expect(deck[13]).toBe('toxic_bullets');
    // The two turned away: the next base items of Haze's and Kelvin's builds that still have room.
    const fill = buildsAcross([defaultBuild('hero_haze'), defaultBuild('hero_kelvin')]);
    const room = fill.filter((id) => id !== 'extra_spirit');
    expect(deck.slice(14)).toEqual(room.slice(0, 2));
    // The next save writes it back at version 5, the deck as it was read.
    saveAiStrength('hard');
    expect(saved()).toMatchObject({ version: 5, deck });
  });

  it('a version-4 deck short of the cap\'s room keeps its size; with no squad a turned-away copy is not made up', () => {
    store.set(KEY, JSON.stringify({ version: 4, preferredHeroes: [null, null, null, null], deck: ['grit', 'improved_spirit', 'extra_spirit'] }));
    expect(loadPlayerData().deck).toEqual(['grit', 'extra_spirit', 'extra_spirit']);
    const five = Array(MAX_COPIES + 1).fill('extra_spirit');
    store.set(KEY, JSON.stringify({ version: 4, preferredHeroes: [null, null, null, null], deck: ['improved_spirit', ...five] }));
    expect(loadPlayerData().deck).toEqual(Array(MAX_COPIES).fill('extra_spirit'));
  });

  it('a version-1 save (no version, decks) still starts its builds from the defaults, keeps the rest, and plays normal', () => {
    store.set(KEY, JSON.stringify({
      preferredHeroes: ['hero_lash', null, null, null],
      decks: [{ id: 'd', name: 'Old', cards: ['cold_front'] }],
      builds: { hero_kelvin: ['grit'] },
      lessonsDone: ['lesson-1'],
      tutorialDone: true,
    }));
    const data = loadPlayerData();
    expect(data.builds).toEqual({});
    expect(getBuild('hero_kelvin')).toEqual(defaultBuild('hero_kelvin'));
    expect(data.preferredHeroes).toEqual(['hero_lash', null, null, null]);
    expect(data.lessonsDone).toEqual(['lesson-1']);
    expect(data.tutorialDone).toBe(true);
    expect(data.aiStrength).toBe('normal');
    expect(data.deck).toEqual([]);                    // the old deck game's decks are not carried over
  });

  it('a saved strength reads back, and saving it leaves the rest of the save alone', () => {
    saveBuild('hero_kelvin', ['grit']);
    saveAiStrength('hard');
    expect(getAiStrength()).toBe('hard');
    expect(getBuild('hero_kelvin')).toEqual(['grit']);
    saveAiStrength('easy');
    expect(getAiStrength()).toBe('easy');
    expect(saved().aiStrength).toBe('easy');
    saveAiStrength('normal');
    expect(getAiStrength()).toBe('normal');
  });

  it('a strength the game does not know, or a save it cannot read, plays normal', () => {
    for (const junk of ['HARD', 'brutal', '', 3, null, true, {}, ['hard']]) {
      store.set(KEY, JSON.stringify({ version: 3, aiStrength: junk }));
      expect(getAiStrength(), JSON.stringify(junk)).toBe('normal');
    }
    store.set(KEY, '{not json');
    expect(getAiStrength()).toBe('normal');
    saveAiStrength('nightmare' as AiStrength);
    expect(saved().aiStrength).toBe('normal');
  });
});
