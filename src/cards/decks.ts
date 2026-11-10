/**
 * Decks, as card lists: what makes a legal deck, the deck a side gets from its
 * heroes' builds when it brings none, and the catalogue's shapes the deck
 * builder lays out (the three tabs, a list per tier). Pure data: no game state.
 *
 * A deck is DECK_SIZE base items (any tier), at most MAX_COPIES of one item.
 * An upgrade (an item with `upgradesFrom`) never starts in a deck: it reaches
 * one only when its component is played, which shuffles it in (Patrick,
 * 2026-11-09). The four drafted heroes are shuffled in at the match's start
 * (engine/deck.ts), so a drafted match's deck holds DECK_SIZE + 4 cards.
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

/** True for a base item: an item with no `upgradesFrom`, which no other item
 *  upgrades into. Only base items start in a deck. */
export function isBaseItem(id: CardId): boolean {
  const item = itemCard(id);
  return !!item && !item.upgradesFrom;
}

/** The base item `id` comes from: an upgrade's component, walked down until
 *  no `upgradesFrom` is left (Transcendent Cooldown → Superior Cooldown →
 *  Compress Cooldown); a base item is its own; undefined for no item. */
export function baseItem(id: CardId): CardId | undefined {
  let item = itemCard(id);
  for (let guard = 0; item?.upgradesFrom && guard < 8; guard++) item = itemCard(item.upgradesFrom);
  return item?.id;
}

/** How many copies of each item a list holds. */
export function copyCounts(ids: readonly CardId[]): Record<CardId, number> {
  const out: Record<CardId, number> = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** What is wrong with `ids` as a deck, or null for a legal one: it holds
 *  something that is no item, an upgrade (it comes only from playing its
 *  component), more than MAX_COPIES of one item, or not exactly DECK_SIZE
 *  cards. */
export function deckProblem(ids: readonly CardId[]): 'notItem' | 'upgrade' | 'copies' | 'size' | null {
  if (ids.some((id) => !itemCard(id))) return 'notItem';
  if (ids.some((id) => !isBaseItem(id))) return 'upgrade';
  if (Object.values(copyCounts(ids)).some((n) => n > MAX_COPIES)) return 'copies';
  if (ids.length !== DECK_SIZE) return 'size';
  return null;
}

/** True for a legal deck (`deckProblem` finds nothing). */
export function isLegalDeck(ids: readonly CardId[] | undefined): ids is CardId[] {
  return !!ids && deckProblem(ids) === null;
}

/** The base items of the heroes' `builds` (in pick order), read across:
 *  every hero's first item, then every hero's second, and so on, each upgrade
 *  turned into its base item (`baseItem`) — a build that names Improved Spirit
 *  brings Extra Spirit, the card that makes it. Anything that is no item is
 *  left out. */
export function buildsAcross(builds: readonly (readonly CardId[])[]): CardId[] {
  const lists = builds.map((b) => b.map(baseItem).filter((id): id is CardId => !!id)).filter((b) => b.length > 0);
  const longest = Math.max(0, ...lists.map((b) => b.length));
  const across: CardId[] = [];
  for (let i = 0; i < longest; i++) for (const b of lists) if (b[i]) across.push(b[i]);
  return across;
}

/**
 * The deck a side gets from its heroes' builds (in pick order) when it brings
 * none of its own: the builds' base items read across (`buildsAcross`) —
 * every hero's first item, then every hero's second, and so on, an upgrade
 * standing for its base item — each taken while it has fewer than MAX_COPIES
 * in the deck, until DECK_SIZE. A copy the cap turns away leaves its place to
 * the next base item of the builds. The upgrades a build names come into the
 * deck as the match goes, when their components are played. Short builds go
 * round again from the start until the deck is full (or nothing more can go
 * in).
 */
export function deckFromBuilds(builds: readonly (readonly CardId[])[]): CardId[] {
  const across = buildsAcross(builds);
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

/**
 * `ids` made a deck of base items: each upgrade turned into its base item
 * (`baseItem`), anything that is no item dropped, at most MAX_COPIES of one
 * and DECK_SIZE in all. Each copy the cap turns away is made up from `fill`
 * (the squad's builds read across, `buildsAcross`): its next base item that
 * still has room. With nothing left in `fill` the deck comes out short, and a
 * match deals one from the builds until it is full again. A save's deck is
 * brought up to date this way (storage/playerData.ts).
 */
export function rebaseDeck(ids: readonly CardId[], fill: readonly CardId[] = []): CardId[] {
  const out: CardId[] = [];
  const count: Record<CardId, number> = {};
  const room = (id: CardId) => (count[id] ?? 0) < MAX_COPIES && out.length < DECK_SIZE;
  const add = (id: CardId) => { out.push(id); count[id] = (count[id] ?? 0) + 1; };
  let turnedAway = 0;
  for (const id of ids) {
    const base = baseItem(id);
    if (!base) continue;
    if (room(base)) add(base);
    else if (out.length < DECK_SIZE) turnedAway++;
  }
  for (const id of fill) {
    if (turnedAway === 0) break;
    const base = baseItem(id);
    if (!base || !room(base)) continue;
    add(base);
    turnedAway--;
  }
  return out;
}
