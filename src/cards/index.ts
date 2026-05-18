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

export { HEROES, SPELLS, EQUIPMENT, ULTIMATES };
