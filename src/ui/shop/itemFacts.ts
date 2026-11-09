/**
 * What an item's tooltip says, read off its data the way Deadlock's own shop
 * tooltip lays it out: the category and tier, the stat lines (its `bonus`),
 * what it does beyond them (its text, less the stat sentences already shown),
 * whether it is an active — and its cooldown or charges — and what it builds
 * from and into. The deck builder and the build editor read these; nothing
 * here touches a match.
 */
import type { CardId, ItemSlot, ItemTier } from '@/engine/types';
import { ITEMS, itemCard } from '@/cards';
import { ACTIVE_COOLDOWN, HARD_CC_CHARGES, ITEM_TIERS, PRICE } from '@/engine/constants';

/** Deadlock's tab order: Weapon · Vitality · Spirit. */
export const SHOP_TABS: readonly ItemSlot[] = ['weapon', 'vitality', 'spirit'];
export const CATEGORY_WORD: Record<ItemSlot, string> = { weapon: 'Weapon', vitality: 'Vitality', spirit: 'Spirit' };
/** The shop's tiers, cheapest first (ITEM_TIERS): a row each. */
export const TIERS: readonly ItemTier[] = ITEM_TIERS;

/** "1 soul", "4 souls". */
export const soulsWord = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;

/** One stat line: "+1" "Bullet Power". */
export interface StatLine {
  value: string;
  label: string;
}

/** The stat lines an item prints, from its stat bonus: what it adds to its
 *  bearer while worn. */
export function statLines(itemId: CardId): StatLine[] {
  const data = itemCard(itemId);
  if (!data || data.type !== 'equipment' || !data.bonus) return [];
  const out: StatLine[] = [];
  const { atk, spirit, hp } = data.bonus;
  if (atk) out.push({ value: signed(atk), label: 'Bullet Power' });
  if (spirit) out.push({ value: signed(spirit), label: 'Spirit Power' });
  if (hp) out.push({ value: signed(hp), label: 'HP' });
  return out;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** A sentence of card text that only restates a stat line ("+1 Bullet Power.",
 *  "+2 HP."). */
const STAT_SENTENCE = /^[+−-]\d+ (Bullet Power|Spirit Power|HP|max HP)\.?$/;

/** What the item does beyond its stat lines: its card text with the stat
 *  sentences taken out (empty for a pure stat stick). Keeps RuleText's
 *  marks (`{sp:4}`) as they are. */
export function effectText(itemId: CardId): string {
  const data = itemCard(itemId);
  const text = data?.text ?? '';
  if (!text) return '';
  const sentences = text.match(/[^.]+\.?/g) ?? [text];
  return sentences.map((s) => s.trim()).filter((s) => s && !STAT_SENTENCE.test(s)).join(' ');
}

/** How an item is used: an active (fired from its bearer's sheet, then a
 *  cooldown of so many own turns, or for hard crowd control a number of
 *  charges a match) or a passive (always on). */
export type UseFacts =
  | { kind: 'passive' }
  | { kind: 'active'; cooldown: number }
  | { kind: 'active'; charges: number };

export function useFacts(itemId: CardId): UseFacts {
  const data = itemCard(itemId);
  if (!data || data.type !== 'spell') return { kind: 'passive' };
  if (data.hardCC) return { kind: 'active', charges: HARD_CC_CHARGES };
  return { kind: 'active', cooldown: data.cooldown ?? (data.tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high) };
}

/** The component this item is built from, when it has one in the catalogue. */
export function buildsFrom(itemId: CardId): CardId | undefined {
  return itemCard(itemId)?.upgradesFrom;
}

/** The items built from this one, in catalogue order. */
export function buildsInto(itemId: CardId): CardId[] {
  return ITEMS.filter((i) => i.upgradesFrom === itemId).map((i) => i.id);
}

/** The item's list price: its tier's. */
export function listPrice(itemId: CardId): number {
  const data = itemCard(itemId);
  return data ? PRICE[data.tier] : 0;
}
