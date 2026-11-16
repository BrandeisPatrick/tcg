import { describe, it, expect } from 'vitest';
import { READY_DECKS, readyDeckInUse } from '@/cards/readyDecks';
import { copyCounts, deckProblem, evolvesFrom } from '@/cards/decks';
import { CARDS_BY_ID, itemCard } from '@/cards';
import { itemPrice } from '@/engine/query';
import { DECK_SIZE, PRICE, SQUAD_SIZE } from '@/engine/constants';

// The ready decks (docs/deck-plan.md, "Ready decks"): each is a squad of three
// and a legal 16-item deck built to one recipe.
describe('ready decks', () => {
  it('there are six, each with its own name and id; Graveyard is Graves\'s (2026-11-16)', () => {
    expect(READY_DECKS).toHaveLength(6);
    expect(new Set(READY_DECKS.map((d) => d.id)).size).toBe(6);
    expect(new Set(READY_DECKS.map((d) => d.name)).size).toBe(6);
    expect(READY_DECKS.find((d) => d.id === 'graveyard')?.heroes).toContain('hero_graves');
  });

  it.each(READY_DECKS.map((d) => [d.name, d] as const))('%s: three different heroes (SQUAD_SIZE) and a legal deck; an upgrade is in it beside the item it is built from', (_name, d) => {
    expect(d.heroes).toHaveLength(SQUAD_SIZE);
    expect(new Set(d.heroes).size).toBe(SQUAD_SIZE);
    for (const h of d.heroes) expect(CARDS_BY_ID[h]?.type, h).toBe('hero');
    expect(d.items).toHaveLength(DECK_SIZE);
    expect(deckProblem(d.items)).toBeNull();
    // Upgrades are deck cards now (2026-11-15): each deck carries at least one, and never
    // one whose component it does not carry — the discount has to be reachable.
    const upgrades = d.items.filter((id) => evolvesFrom(id));
    expect(upgrades.length, 'no upgrade').toBeGreaterThan(0);
    for (const id of upgrades) expect(d.items, id).toContain(evolvesFrom(id));
  });

  it.each(READY_DECKS.map((d) => [d.name, d] as const))('%s: the recipe — at most 2 copies, 8 / 6 / 2 by tier (56 souls), a counter, a draw card, mostly equipment', (_name, d) => {
    const counts = copyCounts(d.items);
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(2);
    const tiers = [1, 2, 3, 4, 5].map((t) => d.items.filter((id) => itemCard(id)!.tier === t).length);
    expect(tiers).toEqual([8, 6, 2, 0, 0]);
    // 56 souls at the tiers' prices; a spell with a price of its own (Rusted Barrel 1, Knockdown 4)
    // lists under its tier's, so such a deck costs less.
    expect(d.items.reduce((n, id) => n + PRICE[itemCard(id)!.tier], 0)).toBe(56);
    const under = d.items.reduce((n, id) => n + PRICE[itemCard(id)!.tier] - itemPrice(id), 0);
    expect(d.items.reduce((n, id) => n + itemPrice(id), 0)).toBe(56 - under);
    // A counter in every deck; a draw card in every one since 2026-11-16 (Compress Cooldown: one,
    // two in Graveyard, which also digs for its Ghouls); and a deck leans on equipment, which
    // stays, over spells, which do not.
    expect(d.items.some((id) => ['counterspell', 'debuff_reducer', 'debuff_remover', 'knockdown'].includes(id))).toBe(true);
    const draws = d.items.filter((id) => /_cooldown$/.test(id));
    expect(new Set(draws)).toEqual(new Set(['improved_cooldown']));
    expect(draws).toHaveLength(d.id === 'graveyard' ? 2 : 1);
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
    expect(readyDeckInUse([d.heroes[1], d.heroes[0], d.heroes[2]], d.items)).toBeUndefined(); // another order
    expect(readyDeckInUse([null, null, null], [])).toBeUndefined();
  });
});
