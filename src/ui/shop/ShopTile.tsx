import { useRef, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { CardId } from '@/engine/types';
import { ItemIcon, type ItemIconMarks } from '../card/ItemIcon';
import { spring } from '../tokens';
import { usePress } from './usePress';

/**
 * One item tile as a control: a tap, a long-press (or a right-click), a mouse
 * rest — each handed the tile's rect, for the card's flight or the tooltip's
 * place — and its name for a screen reader and the tutorial's gate (the tile
 * prints none).
 */
export function ShopTile({ itemId, size, label, grey, lit, selected, marks, onTap, onLong, onHover, style }: {
  itemId: CardId;
  size: number;
  label: string;
  grey?: boolean;
  lit?: boolean;
  selected?: boolean;
  marks?: ItemIconMarks;
  onTap: (rect: DOMRect) => void;
  onLong?: (rect: DOMRect) => void;
  onHover?: (rect: DOMRect | null) => void;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const rect = () => ref.current!.getBoundingClientRect();
  const press = usePress(
    () => onTap(rect()),
    () => onLong?.(rect()),
    onHover ? (on) => onHover(on ? rect() : null) : undefined,
  );
  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={label}
      aria-disabled={grey || undefined}
      whileTap={{ scale: 0.92 }}
      transition={spring.snappy}
      {...press}
      style={{
        position: 'relative',
        padding: 0, border: 'none', background: 'none', cursor: 'pointer', lineHeight: 0,
        touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        ...style,
      } as CSSProperties}
    >
      <ItemIcon itemId={itemId} size={size} grey={grey} lit={lit} selected={selected} marks={marks} />
    </motion.button>
  );
}
