/**
 * The category spike's mark. A hero wearing CATEGORY_SPIKE_ITEMS or more
 * items of one tab has +1 on that tab's line while it does — Weapon +1 Bullet
 * Power, Vitality +1 max HP, Spirit +1 Spirit Power (`hasSpike`). The mark is
 * a small raised chevron on a square of the category's colour, printed on the
 * stat it raises; wordless, it names itself for a screen reader and a mouse.
 */
import type { CSSProperties } from 'react';
import type { ItemSlot } from '@/engine/types';
import { CATEGORY_SPIKE_ITEMS } from '@/engine/constants';
import { poster, shopInk } from '../poster';
import { CATEGORY_WORD } from '../shop/itemFacts';

const LINE: Record<ItemSlot, string> = { weapon: 'Bullet Power', vitality: 'max HP', spirit: 'Spirit Power' };

/** "Weapon spike: +1 Bullet Power (3+ Weapon items)". */
export const spikeLabel = (slot: ItemSlot) =>
  `${CATEGORY_WORD[slot]} spike: +1 ${LINE[slot]} (${CATEGORY_SPIKE_ITEMS}+ ${CATEGORY_WORD[slot]} items)`;

export function SpikeMark({ slot, size = 11, style }: { slot: ItemSlot; size?: number; style?: CSSProperties }) {
  const { ink } = shopInk(slot);
  const label = spikeLabel(slot);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-spike={slot}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, flexShrink: 0,
        borderRadius: Math.max(2, Math.round(size * 0.24)),
        background: ink,
        boxShadow: `0 0 0 1px ${poster.ink}`,
        lineHeight: 0,
        ...style,
      }}
    >
      <svg viewBox="0 0 10 10" width={Math.round(size * 0.74)} height={Math.round(size * 0.74)} aria-hidden>
        <path d="M1.8 6.9 L5 3.5 L8.2 6.9" fill="none" stroke={poster.ink} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
