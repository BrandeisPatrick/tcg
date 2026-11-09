import type { CardData, CardId, ItemCard } from '@/engine/types';
import { HEROES, HEROES_BY_ID } from './heroes';
import { SPELLS, SPELLS_BY_ID } from './spells';
import { EQUIPMENT, EQUIPMENT_BY_ID } from './equipment';
import { ULTIMATES, ULTIMATES_BY_ID } from './ultimates';

export const ALL_CARDS: CardData[] = [...HEROES, ...SPELLS, ...EQUIPMENT, ...ULTIMATES];

export const CARDS_BY_ID: Record<string, CardData> = {
  ...HEROES_BY_ID,
  ...SPELLS_BY_ID,
  ...EQUIPMENT_BY_ID,
  ...ULTIMATES_BY_ID,
};

/** Every item a deck can hold, actives (spells) then passives (equipment),
 *  in catalogue order. */
export const ITEMS: ItemCard[] = [...SPELLS, ...EQUIPMENT];

// 1-based set index for card display (e.g., "DLK · 03/64")
export const CARD_INDEX: Record<string, number> = Object.fromEntries(
  ALL_CARDS.map((c, i) => [c.id, i + 1]),
);
export const CARD_TOTAL = ALL_CARDS.length;

export function getCard(id: string): CardData {
  const c = CARDS_BY_ID[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}

/** The board's units that are no card in the catalogue, by id: the Mid-Boss
 *  in the pit (engine/map.ts). */
const UNIT_NAMES: Readonly<Record<string, string>> = { boss_midboss: 'Mid-Boss' };

/** The name a card prints — or a unit of the pit's — or its id when nothing has it. */
export function cardName(id: string): string {
  return CARDS_BY_ID[id]?.name ?? UNIT_NAMES[id] ?? id;
}

/** The item behind an id — an active (spell) or a passive (equipment) — or
 *  undefined for a hero, an ultimate or an unknown id. */
export function itemCard(id: CardId | undefined): ItemCard | undefined {
  const data = id === undefined ? undefined : CARDS_BY_ID[id];
  return data?.type === 'spell' || data?.type === 'equipment' ? data : undefined;
}

export { HEROES, SPELLS, EQUIPMENT, ULTIMATES };


/**
 * Cards taken out of the game, and the card a saved build gets in their place.
 * Deadlock merged Improved Bullet / Spirit Armor into the Resilience items
 * (docs/card-design.md), so a build that held one now holds the other.
 */
export const RETIRED_CARDS: Record<string, string> = {
  improved_bullet_armor: 'bullet_resilience',
  improved_spirit_armor: 'spirit_resilience',
};

/** A saved list of card ids brought up to date: a retired card becomes its
 *  replacement, and an id the game no longer knows is dropped. */
export function migrateCardIds(ids: string[]): string[] {
  return ids.map((id) => RETIRED_CARDS[id] ?? id).filter((id) => id in CARDS_BY_ID);
}
