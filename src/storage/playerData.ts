import type { CardId } from '@/engine/types';
import { itemCard, migrateCardIds } from '@/cards';
import { BUILD_SIZE, DEFAULT_BUILDS, defaultBuild } from '@/cards/builds';
import { DECK_SIZE, MAX_COPIES } from '@/engine/constants';
import { AI_STRENGTHS, DEFAULT_AI_STRENGTH, type AiStrength } from '@/ai/heuristic';

export const MAX_PREFERRED_HEROES = 4;

/**
 * The save's schema. Version 1 had no version field and kept up to five
 * 15-card decks; version 2 keeps a build per hero instead (the decks are
 * dropped on load: the shop replaced the deck); version 3 adds the rival AI's
 * strength (a save from before it plays 'normal'); version 4 brings a deck
 * back — one deck of items (DECK_SIZE, at most MAX_COPIES of one), the deck
 * builder's — beside the builds, which make the deck of a player who saved
 * none (a save from before it has none).
 */
const PLAYER_DATA_VERSION = 4;
/** The first version that keeps builds: an older save's are not carried over. */
const BUILDS_SINCE = 2;

interface PlayerData {
  version: number;
  preferredHeroes: (CardId | null)[];
  /** Each hero's build: the items it buys, in order (BUILD_SIZE at most). A
   *  hero not listed uses its default build (cards/builds.ts). */
  builds: Record<CardId, CardId[]>;
  /** Ids of the tutorial lessons finished (script run out, or match won). */
  lessonsDone: string[];
  /** Every lesson finished — the title stops flagging the tutorial as the
   *  place to start. */
  tutorialDone: boolean;
  /** How hard the rival AI plays a Quick Match, as last set on the draft. */
  aiStrength: AiStrength;
  /** The deck builder's deck: item ids, at most DECK_SIZE, at most MAX_COPIES
   *  of one. A match uses it once it holds DECK_SIZE; until then (and with
   *  none) the deck is made from the drafted heroes' builds. */
  deck: CardId[];
}

const STORAGE_KEY = 'deadlock-tcg-player';

function defaultPlayerData(): PlayerData {
  return {
    version: PLAYER_DATA_VERSION,
    preferredHeroes: [null, null, null, null],
    builds: {},
    lessonsDone: [],
    tutorialDone: false,
    aiStrength: DEFAULT_AI_STRENGTH,
    deck: [],
  };
}

/** A saved deck brought up to date: retired items swapped for their
 *  replacements, unknown ids and anything that is no item dropped, at most
 *  MAX_COPIES of one item, at most DECK_SIZE in all. */
function migrateDeck(ids: unknown): CardId[] {
  if (!Array.isArray(ids)) return [];
  const out: CardId[] = [];
  const count: Record<CardId, number> = {};
  for (const id of migrateCardIds(ids.filter((x): x is string => typeof x === 'string'))) {
    if (!itemCard(id) || (count[id] ?? 0) >= MAX_COPIES) continue;
    count[id] = (count[id] ?? 0) + 1;
    out.push(id);
  }
  return out.slice(0, DECK_SIZE);
}

/** A saved build brought up to date: retired items swapped for their
 *  replacements, unknown ids and anything that is no item dropped, duplicates
 *  dropped, at most BUILD_SIZE items. */
function migrateBuild(ids: unknown): CardId[] {
  if (!Array.isArray(ids)) return [];
  const out: CardId[] = [];
  for (const id of migrateCardIds(ids.filter((x): x is string => typeof x === 'string'))) {
    if (itemCard(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, BUILD_SIZE);
}

/** A saved strength, or 'normal' for anything that is not one (none saved, an
 *  old save, a value this version does not know). */
function migrateStrength(raw: unknown): AiStrength {
  return AI_STRENGTHS.find((s) => s === raw) ?? DEFAULT_AI_STRENGTH;
}

/** The saved builds, each brought up to date; a hero the game does not know,
 *  or whose build is left empty, is dropped (it uses its default). */
function migrateBuilds(raw: unknown): Record<CardId, CardId[]> {
  const out: Record<CardId, CardId[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [hero, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!(hero in DEFAULT_BUILDS)) continue;
    const build = migrateBuild(ids);
    if (build.length > 0) out[hero] = build;
  }
  return out;
}

export function loadPlayerData(): PlayerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlayerData();
    const parsed = JSON.parse(raw);
    return {
      version: PLAYER_DATA_VERSION,
      preferredHeroes: Array.isArray(parsed.preferredHeroes)
        ? parsed.preferredHeroes.slice(0, MAX_PREFERRED_HEROES)
        : [null, null, null, null],
      // A version-1 save's `decks` are not carried over: builds start from the
      // defaults. Versions 2 and 3 keep theirs.
      builds: typeof parsed.version === 'number' && parsed.version >= BUILDS_SINCE ? migrateBuilds(parsed.builds) : {},
      lessonsDone: Array.isArray(parsed.lessonsDone) ? parsed.lessonsDone.filter((x: unknown) => typeof x === 'string') : [],
      tutorialDone: parsed.tutorialDone === true,
      aiStrength: migrateStrength(parsed.aiStrength),
      // A deck saved by version 1 was the old deck game's (heroes and 15 cards):
      // not carried over. Version 4 keeps its own.
      deck: typeof parsed.version === 'number' && parsed.version >= 4 ? migrateDeck(parsed.deck) : [],
    };
  } catch {
    return defaultPlayerData();
  }
}

function savePlayerData(data: PlayerData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getPreferredHeroes(): (CardId | null)[] {
  return loadPlayerData().preferredHeroes;
}

export function savePreferredHeroes(heroes: (CardId | null)[]): void {
  const data = loadPlayerData();
  data.preferredHeroes = heroes.slice(0, MAX_PREFERRED_HEROES);
  savePlayerData(data);
}

/** `heroId`'s build: the player's own, else the hero's default. */
export function getBuild(heroId: CardId): CardId[] {
  return loadPlayerData().builds[heroId] ?? defaultBuild(heroId);
}

/** Save `heroId`'s build (an empty one puts the default back). */
export function saveBuild(heroId: CardId, items: CardId[]): void {
  const data = loadPlayerData();
  const build = migrateBuild(items);
  if (build.length > 0) data.builds[heroId] = build;
  else delete data.builds[heroId];
  savePlayerData(data);
}

/** The deck builder's deck (may be short of DECK_SIZE, or empty: none saved). */
export function getDeck(): CardId[] {
  return loadPlayerData().deck;
}

/** Save the deck builder's deck (an empty one clears it: the builds make the
 *  deck again). */
export function saveDeck(ids: CardId[]): void {
  const data = loadPlayerData();
  data.deck = migrateDeck(ids);
  savePlayerData(data);
}

/** How hard the rival AI plays a Quick Match: the player's choice, else 'normal'. */
export function getAiStrength(): AiStrength {
  return loadPlayerData().aiStrength;
}

/** Save how hard the rival AI plays the next Quick Match. */
export function saveAiStrength(strength: AiStrength): void {
  const data = loadPlayerData();
  data.aiStrength = migrateStrength(strength);
  savePlayerData(data);
}

/** Record a finished lesson. `total` is how many lessons there are, so this
 *  layer can flip the tutorial itself to done without knowing them. */
export function markLessonDone(id: string, total: number): void {
  const data = loadPlayerData();
  const already = data.lessonsDone.includes(id);
  const allDone = (already ? data.lessonsDone.length : data.lessonsDone.length + 1) >= total;
  if (already && data.tutorialDone === allDone) return;
  if (!already) data.lessonsDone.push(id);
  data.tutorialDone = allDone;
  savePlayerData(data);
}
