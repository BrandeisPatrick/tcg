/**
 * The starter decks a new player is given (storage/playerData.ts) and the
 * migration that keeps an older save loading after cards are retired.
 */
import { describe, it, expect } from 'vitest';
import { CARDS_BY_ID, migrateCardIds, RETIRED_CARDS } from '@/cards';
import { STARTER_DECKS, DECK_SIZE, MAX_COPIES, MAX_DECKS } from '@/storage/playerData';
import { AI_DECKS_BY_NAME } from '@/decks/aiDecks';

const cost = (id: string) => (CARDS_BY_ID[id] as { cost?: number }).cost ?? 0;

describe('Starter decks', () => {
  it('fill every deck slot', () => {
    expect(STARTER_DECKS.length).toBe(MAX_DECKS);
  });

  it.each(STARTER_DECKS.map((d) => [d.name, d] as const))('%s is a legal deck', (_name, deck) => {
    expect(deck.cards.length).toBe(DECK_SIZE);
    for (const id of deck.cards) {
      expect(CARDS_BY_ID[id], id).toBeDefined();
      expect(['spell', 'equipment']).toContain(CARDS_BY_ID[id].type);
      expect(deck.cards.filter((x) => x === id).length, id).toBeLessThanOrEqual(MAX_COPIES);
    }
  });

  it.each(STARTER_DECKS.map((d) => [d.name, d] as const))('%s has an opening: at least 4 cards costing 2 or less', (_name, deck) => {
    expect(deck.cards.filter((id) => cost(id) <= 2).length).toBeGreaterThanOrEqual(4);
  });

  it.each(STARTER_DECKS.map((d) => [d.name, d] as const))('%s suggests four real heroes', (_name, deck) => {
    expect(deck.heroes).toHaveLength(4);
    for (const id of deck.heroes!) expect(CARDS_BY_ID[id]?.type, id).toBe('hero');
  });

  it('every AI deck card exists', () => {
    for (const [name, deck] of Object.entries(AI_DECKS_BY_NAME)) {
      for (const id of deck) expect(CARDS_BY_ID[id], `${name}: ${id}`).toBeDefined();
    }
  });
});

describe('Save migration', () => {
  it('swaps a retired card for its replacement and drops an unknown id', () => {
    expect(migrateCardIds(['improved_bullet_armor', 'cold_front', 'no_such_card', 'improved_spirit_armor']))
      .toEqual(['bullet_resilience', 'cold_front', 'spirit_resilience']);
  });

  it('every replacement is a card the game knows', () => {
    for (const to of Object.values(RETIRED_CARDS)) expect(CARDS_BY_ID[to], to).toBeDefined();
  });
});
