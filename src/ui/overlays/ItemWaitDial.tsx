/**
 * A worn item's own wait (Cheat Death, `AbilityDef.itemWait`), printed over
 * its icon as the skills' dial is (AbilityDial): the frame broken into a
 * segment a turn, the turns served in the item's tab colour, the wipe over
 * the art. No number (Patrick, 2026-11-16: "I don't want a number"). While it
 * waits, an ink ring takes the place of the chip's own coloured keyline, so
 * the turns still to come read as faint segments, not a whole frame.
 * Nothing at all while the item is ready.
 */
import type { CardInstance } from '@/engine/types';
import { itemCard } from '@/cards';
import { poster, shopInk } from '../poster';
import { AbilityDial } from './AbilityDial';
import { itemDial } from './abilityDialModel';

export function ItemWaitDial({ item, size, calm = false, memo }: {
  item: CardInstance;
  size: number;
  calm?: boolean;
  memo?: string;
}) {
  const dial = itemDial(item);
  const data = itemCard(item.cardId);
  if (!dial || !data) return null;
  const radius = Math.max(3, Math.round(size * 0.18));
  return (
    <>
      <span aria-hidden style={{
        position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none',
        boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(size * 0.06))}px ${poster.ink}`,
      }} />
      <AbilityDial model={dial} ink={shopInk(data.slot).ink} size={size} calm={calm} memo={memo} numeral={false} />
    </>
  );
}
