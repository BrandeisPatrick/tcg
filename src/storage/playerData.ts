import type { CardId } from '@/engine/types';
import { itemCard, migrateCardIds } from '@/cards';
import { BUILD_SIZE, DEFAULT_BUILDS, defaultBuild } from '@/cards/builds';

export const MAX_PREFERRED_HEROES = 4;

/**
 * The save's schema. Version 1 had no version field and kept up to five
 * 15-card decks; version 2 keeps a build per hero instead (the decks are
 * dropped on load: the shop replaced the deck).
 */
const PLAYER_DATA_VERSION = 2;

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
}

const STORAGE_KEY = 'deadlock-tcg-player';

function defaultPlayerData(): PlayerData {
  return {
    version: PLAYER_DATA_VERSION,
    preferredHeroes: [null, null, null, null],
    builds: {},
    lessonsDone: [],
    tutorialDone: false,
  };
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
      // A version-1 save's `decks` are not carried over: builds start from the defaults.
      builds: parsed.version === PLAYER_DATA_VERSION ? migrateBuilds(parsed.builds) : {},
      lessonsDone: Array.isArray(parsed.lessonsDone) ? parsed.lessonsDone.filter((x: unknown) => typeof x === 'string') : [],
      tutorialDone: parsed.tutorialDone === true,
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
