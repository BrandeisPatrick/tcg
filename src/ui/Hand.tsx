import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { CardFrame } from './CardFrame';
import { palette, fonts, spring } from './tokens';

interface Props {
  cards: CardInstance[];
  disabled: boolean;
  pending: { iid: string } | null;
  mySouls: number;
  onTap: (c: CardInstance) => void;
  onLongPress?: (c: CardInstance) => void;
  onHover?: (c: CardInstance | null) => void;
  onDragEndOver?: (c: CardInstance, x: number, y: number) => void;
}

function cardCost(c: CardInstance): number {
  const data = CARDS_BY_ID[c.cardId];
  if (!data) return 0;
  if (data.type === 'spell' || data.type === 'equipment' || data.type === 'ultimate') {
    return (data as any).cost ?? 0;
  }
  return 0;
}

// Desktop fanning — wider arc, more rotation since cards are bigger.
function fanRotation(i: number, total: number): number {
  if (total <= 2) return 0;
  const center = (total - 1) / 2;
  const offset = i - center;
  const max = Math.min(7, 22 / total);
  return offset * max;
}
function fanY(i: number, total: number): number {
  if (total <= 2) return 0;
  const center = (total - 1) / 2;
  const offset = Math.abs(i - center);
  return Math.min(offset * offset * 2.5, 32);
}
function cardOverlap(total: number): number {
  if (total <= 2) return 20;
  if (total <= 3) return 12;
  if (total <= 4) return 0;
  if (total <= 5) return -34;
  if (total <= 6) return -64;
  if (total <= 7) return -88;
  return -108;
}

export function Hand({ cards, disabled, pending, mySouls, onTap, onLongPress, onHover, onDragEndOver }: Props) {
  const total = cards.length;

  return (
    <div
      onMouseLeave={() => { if (onHover) onHover(null); }}
      style={{
        display: 'flex',
        gap: 0,
        padding: '14px 0 4px',
        overflow: 'visible',
        justifyContent: 'center',
        alignItems: 'flex-end',
        minHeight: 180,
        perspective: 1400,
      }}>
      {total === 0 && (
        <div style={{ color: palette.textFaint, fontFamily: fonts.ui, fontSize: 13, padding: 32 }}>
          Hand empty.
        </div>
      )}
      <AnimatePresence>
        {cards.map((c, i) => {
          const data = CARDS_BY_ID[c.cardId];
          const selected = pending?.iid === c.iid;
          const cost = cardCost(c);
          const unaffordable = !disabled && mySouls < cost;
          const cardDisabled = disabled || unaffordable;
          const rot = selected ? 0 : fanRotation(i, total);
          const y = selected ? -42 : fanY(i, total);
          let pressTimer: ReturnType<typeof setTimeout> | undefined;
          let hoverTimer: ReturnType<typeof setTimeout> | undefined;

          return (
            <motion.div
              key={c.iid}
              layoutId={`card-${c.iid}`}
              layout
              initial={{ opacity: 0, y: 120, scale: 0.5 }}
              animate={{ opacity: 1, y, scale: selected ? 1.06 : 1, rotate: rot }}
              exit={{ opacity: 0, y: -60, scale: 0.5, transition: { duration: 0.25 } }}
              transition={spring.default}
              drag={!cardDisabled}
              dragSnapToOrigin
              dragElastic={0.18}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (onDragEndOver) onDragEndOver(c, info.point.x, info.point.y);
              }}
              whileTap={{ scale: selected ? 1.06 : 0.98 }}
              whileHover={!cardDisabled ? { y: y - 30, scale: 1.05, rotate: 0, zIndex: 200 } : undefined}
              onMouseEnter={() => {
                if (onHover) {
                  hoverTimer = setTimeout(() => onHover(c), 650);
                }
              }}
              onMouseLeave={() => {
                if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = undefined; }
                if (onHover) onHover(null);
              }}
              onPointerDown={() => {
                if (onLongPress) {
                  pressTimer = setTimeout(() => onLongPress(c), 500);
                }
              }}
              onPointerUp={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; } }}
              onPointerLeave={() => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; }
                if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = undefined; }
              }}
              onClick={() => !cardDisabled && onTap(c)}
              title={unaffordable ? `Need ${cost} souls (have ${mySouls})` : undefined}
              style={{
                marginLeft: i === 0 ? 0 : cardOverlap(total),
                cursor: cardDisabled ? 'default' : 'pointer',
                transformOrigin: 'bottom center',
                zIndex: selected ? 100 : i,
                touchAction: 'none',
                opacity: cardDisabled && !selected ? (unaffordable ? 0.42 : 0.6) : 1,
                filter: unaffordable ? 'saturate(0.55)' : undefined,
              }}
            >
              <CardFrame
                cardId={c.cardId}
                size="hand"
                selected={selected}
                glow={selected ? (data?.type === 'ultimate' ? 'gold' : 'accent') : null}
                footer={renderFooter(c)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function renderFooter(c: CardInstance) {
  const data = CARDS_BY_ID[c.cardId];
  if (!data) return null;
  if (data.type === 'hero') {
    return null; // stats render as pills in the art window now
  }
  if (data.type === 'equipment') {
    const parts: string[] = [];
    if (data.bonus?.atk) parts.push(`+${data.bonus.atk} ATK`);
    if (data.bonus?.hp) parts.push(`+${data.bonus.hp} HP`);
    if (data.bonus?.spirit) parts.push(`+${data.bonus.spirit} SPI`);
    if (parts.length === 0) return null;
    return (
      <span style={{ color: '#544a3b', fontWeight: 700, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {parts.join(' · ')}
      </span>
    );
  }
  return null;
}
