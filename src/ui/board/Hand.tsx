import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { CardFrame } from '../card/CardFrame';
import { palette, fonts, spring } from '../tokens';

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
  // Per-card timers held in refs so they survive re-renders. Without this,
  // the closure variables get re-created each render, leaving stale timers
  // dangling and the preview "stuck" open.
  const hoverTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const currentHover = useRef<string | null>(null);
  // Visual-hover state — separate from the preview-trigger ref/timer above;
  // this one drives the layout shift that prevents text clipping.
  const [hoveredIid, setHoveredIid] = useState<string | null>(null);
  const hoveredIdx = hoveredIid ? cards.findIndex((c) => c.iid === hoveredIid) : -1;
  const clearHover = (iid: string) => {
    const t = hoverTimers.current.get(iid);
    if (t) { clearTimeout(t); hoverTimers.current.delete(iid); }
  };
  const clearPress = (iid: string) => {
    const t = pressTimers.current.get(iid);
    if (t) { clearTimeout(t); pressTimers.current.delete(iid); }
  };
  const closePreview = () => {
    if (currentHover.current !== null) {
      currentHover.current = null;
      if (onHover) onHover(null);
    }
  };

  return (
    <div
      onMouseLeave={closePreview}
      onPointerLeave={closePreview}
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

          const isHovered = hoveredIid === c.iid;
          const isNeighborOfHovered = hoveredIdx !== -1 && Math.abs(i - hoveredIdx) === 1;
          const baseOverlap = i === 0 ? 0 : cardOverlap(total);
          const NEIGHBOR_RELIEF = 14;
          let marginLeft = baseOverlap;
          if (isHovered) {
            marginLeft = Math.max(baseOverlap, -8);
          } else if (isNeighborOfHovered && i > hoveredIdx) {
            marginLeft = baseOverlap + NEIGHBOR_RELIEF;
          }
          let zIndex = i;
          if (selected) zIndex = 100;
          if (isHovered) zIndex = 200;

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
              // No whileHover lift — caused mouseenter/leave oscillation that
              // trapped the preview open. Layout-driven margin/zIndex via React
              // state below instead.
              onMouseEnter={() => { if (!cardDisabled) setHoveredIid(c.iid); }}
              onMouseLeave={() => { setHoveredIid((cur) => (cur === c.iid ? null : cur)); }}
              onPointerEnter={() => {
                if (cardDisabled || !onHover) return;
                clearHover(c.iid);
                const timer = setTimeout(() => {
                  currentHover.current = c.iid;
                  onHover(c);
                }, 350);
                hoverTimers.current.set(c.iid, timer);
              }}
              onPointerLeave={() => {
                clearHover(c.iid);
                clearPress(c.iid);
                if (currentHover.current === c.iid) closePreview();
              }}
              onPointerDown={() => {
                if (onLongPress) {
                  const timer = setTimeout(() => onLongPress(c), 500);
                  pressTimers.current.set(c.iid, timer);
                }
              }}
              onPointerUp={() => clearPress(c.iid)}
              onClick={() => !cardDisabled && onTap(c)}
              title={unaffordable ? `Need ${cost} souls (have ${mySouls})` : undefined}
              style={{
                marginLeft,
                cursor: cardDisabled ? 'default' : 'pointer',
                transformOrigin: 'bottom center',
                zIndex,
                touchAction: 'none',
                opacity: cardDisabled && !selected ? (unaffordable ? 0.42 : 0.6) : 1,
                filter: unaffordable ? 'saturate(0.55)' : undefined,
                transition: 'margin-left 180ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <CardFrame
                cardId={c.cardId}
                size="hand"
                selected={selected}
                glow={selected ? (data?.type === 'ultimate' ? 'gold' : 'accent') : null}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

