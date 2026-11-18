/**
 * Decks, as card lists: what makes a legal deck, the deck a side gets from its
 * heroes' builds when it brings none, and the catalogue's shapes the deck
 * builder lays out (the three tabs, a list per tier). Pure data: no game state.
 *
 * A deck is DECK_SIZE items of any tier, at most MAX_COPIES of one item. An
 * upgrade (an item with `upgradesFrom`) is a card like any other: it goes in a
 * deck, is drawn and is played for its price — less its component's when it is
 * equipment going onto the hero that wears that component (Patrick,
 * 2026-11-15; until then an upgrade came only from playing its component,
 * which shuffled it into the deck). The four drafted heroes are shuffled in at
 * the match's start (engine/deck.ts), so a drafted match's deck holds
 * DECK_SIZE + 4 cards.
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

/** The component the upgrade `id` evolves — taking its place on the hero that
 *  wears it, for the difference in price — or undefined when it evolves none:
 *  its `upgradesFrom`, when both cards are equipment. An active item neither
 *  evolves anything nor is evolved (Patrick, 2026-11-15), whatever Deadlock
 *  builds it from. */
export function evolvesFrom(id: CardId): CardId | undefined {
  const item = itemCard(id);
  const from = item?.type === 'equipment' ? item.upgradesFrom : undefined;
  return from && itemCard(from)?.type === 'equipment' ? from : undefined;
}

/** The upgrades that evolve each item (`evolvesFrom`), in catalogue order. */
const UPGRADES: Readonly<Record<CardId, CardId[]>> = (() => {
  const out: Record<CardId, CardId[]> = {};
  for (const item of ITEMS) {
    const from = evolvesFrom(item.id);
    if (from) (out[from] ??= []).push(item.id);
  }
  return out;
})();

/** The upgrades that evolve `itemId` (`evolvesFrom`), in catalogue order: most
 *  items have none, a few have two or three. What a card lists as "builds
 *  into". */
export function upgradesOf(itemId: CardId): readonly CardId[] {
  return UPGRADES[itemId] ?? [];
}

/** True for a base item: an item that evolves no other (`evolvesFrom`). */
export function isBaseItem(id: CardId): boolean {
  return !!itemCard(id) && !evolvesFrom(id);
}

/** How many copies of each item a list holds. */
export function copyCounts(ids: readonly CardId[]): Record<CardId, number> {
  const out: Record<CardId, number> = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** What is wrong with `ids` as a deck, or null for a legal one: it holds
 *  something that is no item, more than MAX_COPIES of one item, or not exactly
 *  DECK_SIZE cards. */
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

/** The items of the heroes' `builds` (in pick order), read across: every
 *  hero's first item, then every hero's second, and so on. Anything that is
 *  no item is left out. */
export function buildsAcross(builds: readonly (readonly CardId[])[]): CardId[] {
  const lists = builds.map((b) => b.filter((id) => !!itemCard(id))).filter((b) => b.length > 0);
  const longest = Math.max(0, ...lists.map((b) => b.length));
  const across: CardId[] = [];
  for (let i = 0; i < longest; i++) for (const b of lists) if (b[i]) across.push(b[i]);
  return across;
}

/** Every deck carries a base health item (Patrick, 2026-11-18: "all deck should
 *  have some base health item, it is kinda the necessity for deck"): the deck
 *  of the builds opens with BASE_HEALTH_COPIES of it. */
export const BASE_HEALTH: CardId = 'extra_health';
export const BASE_HEALTH_COPIES = 2;

/**
 * The deck a side gets from its heroes' builds (in pick order) when it brings
 * none of its own: BASE_HEALTH ×BASE_HEALTH_COPIES first, then the builds'
 * items read across (`buildsAcross`) — every
 * hero's first item, then every hero's second, and so on — each taken while
 * it has fewer than MAX_COPIES in the deck, until DECK_SIZE. A copy the cap
 * turns away leaves its place to the next item of the builds. Short builds go
 * round again from the start until the deck is full (or nothing more can go
 * in).
 */
export function deckFromBuilds(builds: readonly (readonly CardId[])[]): CardId[] {
  const across = buildsAcross(builds);
  if (across.length === 0) return []; // no builds, no deck
  const out: CardId[] = Array.from({ length: BASE_HEALTH_COPIES }, () => BASE_HEALTH);
  const count: Record<CardId, number> = { [BASE_HEALTH]: BASE_HEALTH_COPIES };
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
 * `ids` made to fit a deck: anything that is no item dropped, at most
 * MAX_COPIES of one and DECK_SIZE in all. Each copy the cap turns away is
 * made up from `fill` (the squad's builds read across, `buildsAcross`): its
 * next item that still has room. With nothing left in `fill` the deck comes
 * out short, and a match deals one from the builds until it is full again. A
 * save's deck is brought up to date this way (storage/playerData.ts).
 */
export function fitDeck(ids: readonly CardId[], fill: readonly CardId[] = []): CardId[] {
  const out: CardId[] = [];
  const count: Record<CardId, number> = {};
  const room = (id: CardId) => (count[id] ?? 0) < MAX_COPIES && out.length < DECK_SIZE;
  const add = (id: CardId) => { out.push(id); count[id] = (count[id] ?? 0) + 1; };
  let turnedAway = 0;
  for (const id of ids) {
    if (!itemCard(id)) continue;
    if (room(id)) add(id);
    else if (out.length < DECK_SIZE) turnedAway++;
  }
  for (const id of fill) {
    if (turnedAway === 0) break;
    if (!itemCard(id) || !room(id)) continue;
    add(id);
    turnedAway--;
  }
  return out;
}
