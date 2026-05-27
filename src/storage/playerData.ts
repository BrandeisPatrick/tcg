import type { CardId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';

export const MAX_DECKS = 5;
export const DECK_SIZE = 15;
export const MAX_COPIES = 2;
export const MAX_PREFERRED_HEROES = 4;

export interface DeckSlot {
  id: string;
  name: string;
  cards: CardId[];
}

export interface PlayerData {
  preferredHeroes: (CardId | null)[];
  decks: (DeckSlot | null)[];
  selectedDeckIndex: number | null;
}

const STORAGE_KEY = 'deadlock-tcg-player';

const DEFAULT_DECKS: DeckSlot[] = [
  {
    id: 'deck_0', name: 'Balanced',
    cards: [
      'healing_rite', 'healing_rite',
      'rusted_barrel', 'rusted_barrel',
      'cold_front',
      'slowing_hex',
      'extended_magazine', 'extended_magazine',
      'extra_health', 'extra_health',
      'restorative_shot',
      'titanic_magazine',
      'healing_booster',
      'bullet_resilience',
      'extra_regen',
    ],
  },
  {
    id: 'deck_1', name: 'Aggro',
    cards: [
      'rusted_barrel', 'rusted_barrel',
      'cold_front', 'cold_front',
      'decay',
      'knockdown',
      'extended_magazine', 'extended_magazine',
      'titanic_magazine', 'titanic_magazine',
      'extra_regen',
      'bullet_resist_shredder',
      'glass_cannon',
      'healing_rite',
      'restorative_shot',
    ],
  },
  {
    id: 'deck_2', name: 'Control',
    cards: [
      'healing_rite', 'healing_rite',
      'slowing_hex', 'slowing_hex',
      'healbane',
      'metal_skin',
      'disarming_hex',
      'extra_health', 'extra_health',
      'extra_spirit',
      'healing_booster',
      'weapon_shielding',
      'spirit_resilience',
      'bullet_resilience',
      'mystic_regeneration',
    ],
  },
  {
    id: 'deck_3', name: 'Spirit Burst',
    cards: [
      'cold_front', 'cold_front',
      'spirit_sap', 'spirit_sap',
      'healbane',
      'decay',
      'extra_spirit', 'extra_spirit',
      'improved_spirit', 'improved_spirit',
      'mystic_regeneration',
      'healing_rite',
      'spirit_shielding',
      'boundless_spirit',
      'extra_regen',
    ],
  },
  {
    id: 'deck_4', name: 'Tank & Sustain',
    cards: [
      'healing_rite', 'healing_rite',
      'metal_skin', 'metal_skin',
      'slowing_hex',
      'extra_health', 'extra_health',
      'extra_regen', 'extra_regen',
      'restorative_shot', 'restorative_shot',
      'healing_booster',
      'weapon_shielding',
      'spirit_shielding',
      'healing_tempo',
    ],
  },
];

function defaultPlayerData(): PlayerData {
  return {
    preferredHeroes: [null, null, null, null],
    decks: DEFAULT_DECKS.map((d) => ({ ...d })),
    selectedDeckIndex: 0,
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
        ? parsed.decks.slice(0, MAX_DECKS)
        : [null, null, null, null, null],
      selectedDeckIndex: parsed.selectedDeckIndex ?? null,
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

export function isValidDeck(deck: DeckSlot): boolean {
  if (deck.cards.length !== DECK_SIZE) return false;
  const counts: Record<string, number> = {};
  for (const id of deck.cards) {
    const card = CARDS_BY_ID[id];
    if (!card || (card.type !== 'spell' && card.type !== 'equipment')) return false;
    counts[id] = (counts[id] ?? 0) + 1;
    if (counts[id] > MAX_COPIES) return false;
  }
  return true;
}

export function deckableCards(): CardId[] {
  return Object.values(CARDS_BY_ID)
    .filter((c) => c.type === 'spell' || c.type === 'equipment')
    .map((c) => c.id);
}
