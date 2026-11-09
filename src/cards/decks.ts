/**
 * Decks, as card lists: what makes a legal deck, the deck a side gets from its
 * heroes' builds when it brings none, and the catalogue's shapes the deck
 * builder lays out (the three tabs, a list per tier). Pure data: no game state.
 *
 * A deck is DECK_SIZE items (any tier), at most MAX_COPIES of one item. The
 * four drafted heroes are shuffled in at the match's start (engine/deck.ts),
 * so a drafted match's deck holds DECK_SIZE + 4 cards.
 */
import type { CardId, ItemSlot, ItemTier } from '@/engine/types';
import { DECK_SIZE, ITEM_TIERS, MAX_COPIES } from '@/engine/constants';
import { ITEMS, itemCard } from './index';

/** The three item tabs, in the order the deck builder shows them. */
export const ITEM_SLOTS: readonly ItemSlot[] = ['weapon', 'spirit', 'vitality'];

/** An empty list for each tier (ITEM_TIERS), to sort items into by tier. */
export function tierLists(): Record<ItemTier, CardId[]> {
  return Object.fromEntries(ITEM_TIERS.map((t) => [t, [] as CardId[]])) as Record<ItemTier, CardId[]>;
}

/** Every item by tab and tier, in catalogue order: the deck builder's and the
 *  build editor's rows. */
export function catalogueByTab(): Record<ItemSlot, Record<ItemTier, CardId[]>> {
  const out: Record<ItemSlot, Record<ItemTier, CardId[]>> = { weapon: tierLists(), spirit: tierLists(), vitality: tierLists() };
  for (const item of ITEMS) out[item.slot][item.tier].push(item.id);
  return out;
}

/** The items Deadlock builds out of each item (those whose `upgradesFrom`
 *  names it), in catalogue order. */
const UPGRADES: Readonly<Record<CardId, CardId[]>> = (() => {
  const out: Record<CardId, CardId[]> = {};
  for (const item of ITEMS) if (item.upgradesFrom) (out[item.upgradesFrom] ??= []).push(item.id);
  return out;
})();

/** What playing `itemId` can make: the items built from it, in catalogue
 *  order (most have none, a few have two or three — the player picks one). */
export function upgradesOf(itemId: CardId): readonly CardId[] {
  return UPGRADES[itemId] ?? [];
}

/** How many copies of each item a list holds. */
export function copyCounts(ids: readonly CardId[]): Record<CardId, number> {
  const out: Record<CardId, number> = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** What is wrong with `ids` as a deck, or null for a legal one: it holds
 *  something that is no item, more than MAX_COPIES of one item, or not
 *  exactly DECK_SIZE cards. */
export function deckProblem(ids: readonly CardId[]): 'notItem' | 'copies' | 'size' | null {
  if (ids.some((id) => !itemCard(id))) return 'notItem';
  if (Object.values(copyCounts(ids)).some((n) => n > MAX_COPIES)) return 'copies';
  if (ids.length !== DECK_SIZE) return 'size';
  return null;
}

/** True for a legal deck (`deckProblem` finds nothing). */
export function isLegalDeck(ids: readonly CardId[] | undefined): ids is CardId[] {
  return !!ids && deckProblem(ids) === null;
}

/**
 * The deck a side gets from its heroes' builds (in pick order) when it brings
 * none of its own: the builds read across, round by round — every hero's first
 * item, then every hero's second, and so on — each item taken while it has
 * fewer than MAX_COPIES in the deck, until DECK_SIZE. Four heroes' first four
 * build items (their signatures and two tier-2 picks) make a full deck; the
 * later build items, mostly upgrades of those, are what playing them shuffles
 * in. Short builds go round again from the start until the deck is full (or
 * nothing more can go in).
 */
export function deckFromBuilds(builds: readonly (readonly CardId[])[]): CardId[] {
  const lists = builds.map((b) => b.filter((id) => !!itemCard(id))).filter((b) => b.length > 0);
  const longest = Math.max(0, ...lists.map((b) => b.length));
  // The builds read across: index 0 of each, then index 1 of each, …
  const across: CardId[] = [];
  for (let i = 0; i < longest; i++) for (const b of lists) if (b[i]) across.push(b[i]);
  const out: CardId[] = [];
  const count: Record<CardId, number> = {};
  while (out.length < DECK_SIZE) {
    const before = out.length;
    for (const id of across) {
      if (out.length >= DECK_SIZE) break;
      if ((count[id] ?? 0) >= MAX_COPIES) continue;
      out.push(id);
      count[id] = (count[id] ?? 0) + 1;
    }
    if (out.length === before) break;
  }
  return out;
}
