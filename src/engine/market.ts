/**
 * The market: what the shop sells in one match. It is fixed before the first
 * pick and read from the match seed (`G.seed`), so it replays from G alone:
 *  - every tier 1 item, always;
 *  - a random slice of the rest — per tab, MARKET_SLICE items of each higher
 *    tier, drawn uniformly without replacement from the items that are no
 *    hero's signature (fewer when a tier runs short);
 *  - the two signature items of every hero drafted, on either side, and
 *    every item of its build (the human seat's saved build, an AI seat's
 *    default one: `buildOf`), put on sale as the hero is picked — so a build
 *    set up before the match can always be bought.
 * A scripted match (a Story fight, a lesson) opens with both rosters'
 * signatures and builds already on sale.
 */
import type { CardId, GameState, ItemSlot, ItemTier, PlayerID } from './types';
import { CARDS_BY_ID, HEROES, ITEMS, itemCard } from '@/cards';
import { defaultBuild } from '@/cards/builds';
import { ITEM_TIERS, MARKET_SLICE } from './constants';
import { drawWithoutReplacement, seededRandom } from './rng';

/** The three shop tabs, in the order the shop shows them. */
export const ITEM_SLOTS: readonly ItemSlot[] = ['weapon', 'spirit', 'vitality'];

/** An empty list for each tier (ITEM_TIERS), to sort items into by tier. */
export function tierLists(): Record<ItemTier, CardId[]> {
  return Object.fromEntries(ITEM_TIERS.map((t) => [t, [] as CardId[]])) as Record<ItemTier, CardId[]>;
}

/** Every hero's signature items: never in the random slice (they go on sale
 *  with their heroes). */
export const SIGNATURE_ITEMS: ReadonlySet<CardId> = new Set(HEROES.flatMap((h) => h.signature));

/** The market a match opens with, before any hero is drafted: every tier 1
 *  item, then the random slice drawn from `seed`, tab by tab and tier by tier. */
export function openingMarket(seed: number): CardId[] {
  const rand = seededRandom(seed);
  const out = ITEMS.filter((i) => i.tier === 1).map((i) => i.id);
  for (const slot of ITEM_SLOTS) {
    for (const [tier, count] of MARKET_SLICE) {
      const pool = ITEMS.filter((i) => i.slot === slot && i.tier === tier && !SIGNATURE_ITEMS.has(i.id)).map((i) => i.id);
      out.push(...drawWithoutReplacement(pool, count, rand));
    }
  }
  return out;
}

/** Put `heroId`'s signature items on sale (each once). */
export function addSignatures(G: Pick<GameState, 'market'>, heroId: CardId): void {
  const data = CARDS_BY_ID[heroId];
  if (data?.type !== 'hero') return;
  for (const id of data.signature) if (!G.market.includes(id)) G.market.push(id);
}

/** The build `pid` follows for its hero `heroId`, in order: the human seat's
 *  own (`G.playerBuilds`, the player's saved builds), else the hero's default
 *  (cards/builds.ts) — every AI seat's. */
export function buildOf(G: Pick<GameState, 'playerBuilds' | 'humanSeat'>, pid: PlayerID, heroId: CardId): CardId[] {
  const own = pid === G.humanSeat ? G.playerBuilds?.[heroId] : undefined;
  return own && own.length > 0 ? [...own] : defaultBuild(heroId);
}

/** A hero joins `pid`'s side (a draft pick, or a scripted roster): its
 *  signature items go on sale, then every item of its build (`buildOf`) not
 *  on sale yet, in build order. */
export function addHero(G: Pick<GameState, 'market' | 'playerBuilds' | 'humanSeat'>, pid: PlayerID, heroId: CardId): void {
  if (CARDS_BY_ID[heroId]?.type !== 'hero') return;
  addSignatures(G, heroId);
  for (const id of buildOf(G, pid, heroId)) if (itemCard(id) && !G.market.includes(id)) G.market.push(id);
}

/** Everything on sale this match, in the order it was put on sale. */
export function marketItems(G: Pick<GameState, 'market'>): CardId[] {
  return G.market ?? [];
}

/** True when the shop sells `itemId` this match. */
export function onSale(G: Pick<GameState, 'market'>, itemId: CardId): boolean {
  return (G.market ?? []).includes(itemId);
}

/** The market by tab and tier, cheapest tier first and catalogue order within
 *  a tier — the shop sheet's and the draft's lists. */
export function marketByTab(G: Pick<GameState, 'market'>): Record<ItemSlot, Record<ItemTier, CardId[]>> {
  const out: Record<ItemSlot, Record<ItemTier, CardId[]>> = { weapon: tierLists(), spirit: tierLists(), vitality: tierLists() };
  for (const item of ITEMS) {
    if (onSale(G, item.id)) out[item.slot][item.tier].push(item.id);
  }
  return out;
}

/** The item `itemId` stands for in this market: itself when on sale, else the
 *  cheapest on-sale item of the same tab and tier (the first in catalogue
 *  order — one tier is one price), minus any in `skip`; undefined when the
 *  market has none. A build item off this market is greyed and this one
 *  suggested. */
export function marketStandIn(G: Pick<GameState, 'market'>, itemId: CardId, skip: readonly CardId[] = []): CardId | undefined {
  if (onSale(G, itemId)) return itemId;
  const data = itemCard(itemId);
  if (!data) return undefined;
  return ITEMS.find((i) => i.slot === data.slot && i.tier === data.tier && onSale(G, i.id) && !skip.includes(i.id))?.id;
}
