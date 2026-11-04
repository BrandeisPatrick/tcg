import type { CardData } from '@/engine/types';
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

/** The name a card prints, or its id when no card has it. */
export function cardName(id: string): string {
  return CARDS_BY_ID[id]?.name ?? id;
}

export { HEROES, SPELLS, EQUIPMENT, ULTIMATES };


/**
 * Cards taken out of the game, and the card a saved deck gets in their place.
 * Deadlock merged Improved Bullet / Spirit Armor into the Resilience items
 * (docs/card-design.md), so a deck that held one now holds the other.
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
