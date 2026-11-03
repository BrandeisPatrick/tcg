import type { CardId } from '@/engine/types';
import { migrateCardIds } from '@/cards';

export const MAX_DECKS = 5;
export const DECK_SIZE = 15;
export const MAX_COPIES = 2;
export const MAX_PREFERRED_HEROES = 4;

export interface DeckSlot {
  id: string;
  name: string;
  cards: CardId[];
  /** The four heroes a starter deck is built for — a suggestion, shown with
   *  the deck. Absent on a deck the player made. */
  heroes?: CardId[];
}

export interface PlayerData {
  preferredHeroes: (CardId | null)[];
  decks: (DeckSlot | null)[];
  selectedDeckIndex: number | null;
  /** Ids of the tutorial lessons finished (script run out, or match won). */
  lessonsDone: string[];
  /** Every lesson finished — the title stops flagging the tutorial as the
   *  place to start. */
  tutorialDone: boolean;
}

const STORAGE_KEY = 'deadlock-tcg-player';

/**
 * The starter decks, one per way to play. Each opens with at least four cards
 * that cost 2 souls or less, so the first turns have plays, and suggests the
 * four heroes its plan is built for (`heroes`). Together they show nearly the
 * whole card pool; the AI decks (decks/aiDecks.ts) carry the rest.
 */
export const STARTER_DECKS: DeckSlot[] = [
  {
    id: 'deck_0', name: 'Gunline',
    heroes: ['hero_haze', 'hero_shiv', 'hero_drifter', 'hero_vindicta'],
    cards: [
      'restorative_shot', 'headshot_booster',
      'extended_magazine', 'extended_magazine',
      'rusted_barrel',
      'active_reload', 'long_range', 'slowing_bullets', 'bullet_lifesteal',
      'titanic_magazine', 'split_shot',
      'burst_fire', 'toxic_bullets',
      'crippling_headshot', 'ricochet',
    ],
  },
  {
    id: 'deck_1', name: 'Spellcaster',
    heroes: ['hero_lady_geist', 'hero_sinclair', 'hero_seven', 'hero_dynamo'],
    cards: [
      'golden_goose_egg', 'mystic_regeneration',
      'extra_spirit', 'extra_spirit',
      'mystic_burst',
      'spirit_sap', 'healbane', 'mystic_vulnerability',
      'cold_front', 'improved_spirit',
      'vortex_web', 'arctic_blast',
      'escalating_exposure', 'mystic_reverb', 'boundless_spirit',
    ],
  },
  {
    id: 'deck_2', name: 'Control',
    heroes: ['hero_kelvin', 'hero_wraith', 'hero_rem', 'hero_lash'],
    cards: [
      'extra_health', 'healing_rite', 'restorative_shot', 'mystic_regeneration',
      'slowing_hex', 'return_fire', 'suppressor', 'reactive_barrier', 'mystic_slow',
      'knockdown', 'silence_glyph', 'curse', 'debuff_remover', 'rescue_beam',
      'phantom_strike',
    ],
  },
  {
    id: 'deck_3', name: 'Tank & Sustain',
    heroes: ['hero_abrams', 'hero_mo_krill', 'hero_warden', 'hero_paige'],
    cards: [
      'grit', 'extra_health', 'restorative_shot',
      'extra_regen', 'extra_regen',
      'healing_booster', 'weapon_shielding', 'spirit_shielding', 'debuff_reducer',
      'bullet_resilience', 'fortitude', 'divine_barrier', 'healing_nova',
      'colossus',
      'leech',
    ],
  },
  {
    id: 'deck_4', name: 'Tempo',
    heroes: ['hero_yamato', 'hero_viscous', 'hero_mirage', 'hero_haze'],
    cards: [
      'healing_rite', 'mystic_regeneration',
      'extra_spirit', 'rusted_barrel', 'sprint_boots',
      'improved_cooldown', 'fleetfoot', 'fury_trance', 'majestic_leap',
      'echo_shard', 'surge_of_power', 'unstoppable',
      'warp_stone', 'ethereal_shift',
      'infuser',
    ],
  },
];

const starterCopies = (): DeckSlot[] => STARTER_DECKS.map((d) => ({ ...d, cards: [...d.cards], heroes: d.heroes && [...d.heroes] }));

function defaultPlayerData(): PlayerData {
  return {
    preferredHeroes: [null, null, null, null],
    decks: starterCopies(),
    selectedDeckIndex: 0,
    lessonsDone: [],
    tutorialDone: false,
  };
}

export function loadPlayerData(): PlayerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlayerData();
    const parsed = JSON.parse(raw);
    return {
      preferredHeroes: Array.isArray(parsed.preferredHeroes)
        ? parsed.preferredHeroes.slice(0, MAX_PREFERRED_HEROES)
        : [null, null, null, null],
      decks: Array.isArray(parsed.decks)
        ? parsed.decks.slice(0, MAX_DECKS).map(migrateDeck)
        : [null, null, null, null, null],
      selectedDeckIndex: parsed.selectedDeckIndex ?? null,
      lessonsDone: Array.isArray(parsed.lessonsDone) ? parsed.lessonsDone.filter((x: unknown) => typeof x === 'string') : [],
      tutorialDone: parsed.tutorialDone === true,
    };
  } catch {
    return defaultPlayerData();
  }
}

export function savePlayerData(data: PlayerData): void {
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

export function getDeck(index: number): DeckSlot | null {
  const data = loadPlayerData();
  return data.decks[index] ?? null;
}

export function getSelectedDeck(): DeckSlot | null {
  const data = loadPlayerData();
  if (data.selectedDeckIndex == null) return null;
  return data.decks[data.selectedDeckIndex] ?? null;
}

export function saveDeck(index: number, deck: DeckSlot): void {
  const data = loadPlayerData();
  data.decks[index] = deck;
  savePlayerData(data);
}

export function deleteDeck(index: number): void {
  const data = loadPlayerData();
  data.decks[index] = null;
  if (data.selectedDeckIndex === index) data.selectedDeckIndex = null;
  savePlayerData(data);
}

export function setSelectedDeckIndex(index: number | null): void {
  const data = loadPlayerData();
  data.selectedDeckIndex = index;
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

/** A saved deck with retired cards swapped for their replacements
 *  (`migrateCardIds`); a slot that is not a deck stays empty. */
function migrateDeck(deck: DeckSlot | null): DeckSlot | null {
  if (!deck || !Array.isArray(deck.cards)) return null;
  return { ...deck, cards: migrateCardIds(deck.cards) };
}

/** Put the starter decks back in every deck slot, replacing what is saved
 *  there, and select the first. Hero picks and tutorial progress are kept. */
export function resetStarterDecks(): void {
  const data = loadPlayerData();
  data.decks = starterCopies();
  data.selectedDeckIndex = 0;
  savePlayerData(data);
}
