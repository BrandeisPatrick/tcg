import { describe, it, expect } from 'vitest';
import { READY_DECKS, readyDeckInUse } from '@/cards/readyDecks';
import { copyCounts, deckProblem, evolvesFrom } from '@/cards/decks';
import { CARDS_BY_ID, itemCard } from '@/cards';
import { itemPrice } from '@/engine/query';
import { DECK_SIZE } from '@/engine/constants';

// The ready decks (docs/deck-plan.md, "Ready decks"): each is a squad of four
// and a legal 16-item deck built to one recipe.
describe('ready decks', () => {
  it('there are five, each with its own name and id', () => {
    expect(READY_DECKS).toHaveLength(5);
    expect(new Set(READY_DECKS.map((d) => d.id)).size).toBe(5);
    expect(new Set(READY_DECKS.map((d) => d.name)).size).toBe(5);
  });

  it.each(READY_DECKS.map((d) => [d.name, d] as const))('%s: four different heroes and a legal deck; an upgrade is in it beside the item it is built from', (_name, d) => {
    expect(new Set(d.heroes).size).toBe(4);
    for (const h of d.heroes) expect(CARDS_BY_ID[h]?.type, h).toBe('hero');
    expect(d.items).toHaveLength(DECK_SIZE);
    expect(deckProblem(d.items)).toBeNull();
    // Upgrades are deck cards now (2026-11-15): each deck carries at least one, and never
    // one whose component it does not carry — the discount has to be reachable.
    const upgrades = d.items.filter((id) => evolvesFrom(id));
    expect(upgrades.length, 'no upgrade').toBeGreaterThan(0);
    for (const id of upgrades) expect(d.items, id).toContain(evolvesFrom(id));
  });

  it.each(READY_DECKS.map((d) => [d.name, d] as const))('%s: the recipe — at most 2 copies, 8 / 6 / 2 by tier (56 souls), a counter, no draw card, mostly equipment', (_name, d) => {
    const counts = copyCounts(d.items);
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(2);
    const tiers = [1, 2, 3, 4, 5].map((t) => d.items.filter((id) => itemCard(id)!.tier === t).length);
    expect(tiers).toEqual([8, 6, 2, 0, 0]);
    expect(d.items.reduce((n, id) => n + itemPrice(id), 0)).toBe(56);
    // A counter in every deck; the draw cards are out (at 2 souls a turn a hand is short of
    // souls, not cards); and a deck leans on equipment, which stays, over spells, which do not.
    expect(d.items.some((id) => ['counterspell', 'debuff_reducer', 'debuff_remover', 'knockdown'].includes(id))).toBe(true);
    expect(d.items.filter((id) => /_cooldown$/.test(id))).toEqual([]);
    const spells = d.items.filter((id) => itemCard(id)!.type === 'spell').length;
    expect(spells).toBeGreaterThan(0);
    expect(spells).toBeLessThanOrEqual(DECK_SIZE / 2);
    // Listed cheapest tier first, as the Loadout prints it.
    const listed = d.items.map((id) => itemCard(id)!.tier);
    expect(listed).toEqual([...listed].sort((a, b) => a - b));
  });

  it('no hero is in two ready decks', () => {
    const all = READY_DECKS.flatMap((d) => d.heroes);
    expect(new Set(all).size).toBe(all.length);
  });

  it('readyDeckInUse names the deck a squad and a deck match exactly, in any item order', () => {
    const d = READY_DECKS[1];
    expect(readyDeckInUse(d.heroes, [...d.items].reverse())).toBe(d);
    expect(readyDeckInUse(d.heroes, d.items.slice(1))).toBeUndefined();                 // a card short
    expect(readyDeckInUse([d.heroes[1], d.heroes[0], d.heroes[2], d.heroes[3]], d.items)).toBeUndefined(); // another order
    expect(readyDeckInUse([null, null, null, null], [])).toBeUndefined();
  });
});
