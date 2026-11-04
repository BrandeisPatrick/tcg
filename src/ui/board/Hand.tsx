import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { cardCost } from '@/engine/legality';
import { CardFrame } from '../card/CardFrame';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { useViewport } from '../hooks/useViewport';

interface Props {
  cards: CardInstance[];
  disabled: boolean;
  pending: { iid: string } | null;
  mySouls: number;
  onTap: (c: CardInstance) => void;
  onLongPress?: (c: CardInstance) => void;
  onHover?: (c: CardInstance | null) => void;
  onDragEndOver?: (c: CardInstance, x: number, y: number) => void;
  /** Fired when the player taps a card they can't afford — lets the Board
   *  surface "Need N souls" instead of a silent no-op. */
  onUnaffordable?: (c: CardInstance) => void;
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
/** Hand card width (CardFrame SIZES.hand) — the fan's own geometry. */
const CARD_W = 134;

function cardOverlap(total: number): number {
  if (total <= 2) return 20;
  if (total <= 3) return 12;
  if (total <= 4) return 0;
  if (total <= 5) return -34;
  if (total <= 6) return -64;
  if (total <= 7) return -84;
  // Floor: keep ≥40px of every card visible (name plate + cost stay
  // readable). -108 left 26px slivers that were unidentifiable.
  return -94;
}

/**
 * Phones get no fan at all: a flat strip of whole cards, side by side, that
 * scrolls sideways. Shrinking the arc to fit a 390px screen left 5–7 cards
 * covering each other's names and rules, and the outer ones sank under the
 * controls row. The cards print at four fifths of the fan's size: three fit
 * a 390px screen with a sliver of the fourth, which is what says the strip
 * scrolls, and the row leaves the board the height it needs — a held card
 * (long press) opens the full-size preview to read.
 */
const CARD_H = 188;
/** The strip's cards, as a fraction of the fan's. The frame is drawn at the
 *  fan's size and scaled, so its type stays set as designed. */
const STRIP_SCALE = 0.8;
const STRIP_GAP = 8;
const STRIP_SIDE = 12;
/** The armed card's lift on the strip — CardFrame adds its own 8px
 *  selected nudge on top, ~14px in all. */
const STRIP_LIFT = 6;
/** Room above the cards for that lift: a scroller clips what rises out of it. */
const STRIP_TOP = 18;
const STRIP_BOTTOM = 6;

/**
 * The overlap table above is tuned for a desktop-width strip, so on a narrow
 * window even a small hand is wider than the screen and the outermost cards get
 * clipped by the viewport edge. Rather than crushing the spacing (which
 * collides the name plates), shrink the whole fan to fit: the cards keep
 * their proportions and stay legible, just smaller.
 */
function fanScale(total: number, viewportW: number): number {
  if (total < 1) return 1;
  const natural = CARD_W * total + cardOverlap(total) * (total - 1);
  const avail = viewportW - 24;                       // strip side margins
  return Math.min(1, avail / natural);
}

export function Hand({ cards, disabled, pending, mySouls, onTap, onLongPress, onHover, onDragEndOver, onUnaffordable }: Props) {
  const total = cards.length;
  const { width: viewportW, isMobile } = useViewport();
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

  const content = (
    <>
      {/* The hand row floats under the cream sheet on the dark scene, so the
          empty label is a cream stencil eyebrow, not ink. */}
      {total === 0 && (
        <div style={{ fontFamily: fonts.display, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: poster.creamDim, padding: 32, margin: isMobile ? 'auto' : undefined }}>
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
          const rot = isMobile || selected ? 0 : fanRotation(i, total);
          const y = isMobile ? (selected ? -STRIP_LIFT : 0) : selected ? -42 : fanY(i, total);

          // Dim must live in the `animate` target, not `style` — framer's
          // animate={{ opacity: 1 }} overrides a style-prop opacity, which
          // silently disabled the unaffordable/disabled fade entirely.
          const targetOpacity = cardDisabled && !selected ? (unaffordable ? 0.55 : 0.6) : 1;

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
          // On the strip nothing overlaps, so no hover relief; auto margins on
          // the ends centre a short hand and fall to 0 once it overflows, so
          // the first card can always be scrolled back to.
          const stripMargins = {
            marginLeft: i === 0 ? 'auto' : 0,
            marginRight: i === total - 1 ? 'auto' : 0,
          };

          const frame = (
            <CardFrame
              cardId={c.cardId}
              size="hand"
              // The price this copy costs — a free copied ultimate prints 0.
              cost={cost}
              selected={selected}
              glow={selected ? (data?.type === 'ultimate' ? 'gold' : 'accent') : null}
              unaffordable={unaffordable}
              // A tap on a card in the fan plays or arms it, wherever it lands.
              tapExplains={false}
            />
          );

          return (
            <motion.div
              key={c.iid}
              layoutId={`card-${c.iid}`}
              layout
              initial={{ opacity: 0, y: 120, scale: 0.5 }}
              animate={{ opacity: targetOpacity, y, scale: selected && !isMobile ? 1.06 : 1, rotate: rot }}
              exit={{ opacity: 0, y: -60, scale: 0.5, transition: { duration: 0.25 } }}
              transition={spring.default}
              // Phones play by tap (arm, then tap a target): a drag would
              // fight the strip's own sideways scroll.
              drag={!isMobile && !cardDisabled}
              dragSnapToOrigin
              dragElastic={0.18}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (onDragEndOver) onDragEndOver(c, info.point.x, info.point.y);
              }}
              whileTap={{ scale: selected && !isMobile ? 1.06 : 0.98 }}
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
              // A thumb that starts on a card and scrolls the strip hands the
              // gesture to the browser: no long-press preview, no hover peek.
              onPointerCancel={() => {
                clearHover(c.iid);
                clearPress(c.iid);
                if (currentHover.current === c.iid) closePreview();
              }}
              onClick={() => {
                // Cancel any pending hover-preview timer: with a ~350ms fuse it
                // fires AFTER the tap arms targeting and parks a full-size
                // preview over the very targets being picked.
                clearHover(c.iid);
                if (currentHover.current === c.iid) closePreview();
                if (!cardDisabled) { onTap(c); return; }
                // Tapping an unaffordable card on your own turn gets explicit
                // feedback instead of a silent no-op.
                if (unaffordable && !disabled) onUnaffordable?.(c);
              }}
              role="button"
              aria-label={`${data?.name ?? c.cardId}${cost > 0 ? `, cost ${cost} souls` : ''}${unaffordable ? ' — cannot afford' : ''}`}
              title={unaffordable ? `Need ${cost} souls (have ${mySouls})` : undefined}
              style={{
                // No CSS transition on marginLeft — the framer `layout` prop is
                // the single position driver. A CSS transition here used to
                // double-animate against the layout spring and made hand
                // reflow (hover relief, card played/drawn) visibly chop.
                ...(isMobile ? stripMargins : { marginLeft }),
                // The strip's card takes the scaled frame's footprint.
                ...(isMobile ? { width: CARD_W * STRIP_SCALE, height: CARD_H * STRIP_SCALE } : {}),
                flex: isMobile ? '0 0 auto' : undefined,
                scrollSnapAlign: isMobile ? 'start' : undefined,
                cursor: cardDisabled ? 'default' : 'pointer',
                transformOrigin: 'bottom center',
                zIndex: isMobile ? undefined : zIndex,
                // The strip pans sideways under the thumb; the desktop fan
                // keeps every gesture for framer's drag.
                touchAction: isMobile ? 'pan-x' : 'none',
                // Unaffordable cards print greyer; CardFrame's red cost coin
                // still carries the "can't pay" signal through the wash.
                filter: unaffordable ? 'saturate(0.55)' : undefined,
                pointerEvents: 'auto', // opt back in under the strip's pointerEvents:none
              }}
            >
              {isMobile ? (
                <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${STRIP_SCALE})`, transformOrigin: 'top left' }}>
                  {frame}
                </div>
              ) : frame}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </>
  );

  if (isMobile) {
    return (
      <motion.div
        // The strip scrolls; framer has to measure that offset for the cards'
        // layout animations (draw, play, reflow) to start from the right place.
        layoutScroll
        className="hand-strip"
        onMouseLeave={closePreview}
        onPointerLeave={closePreview}
        style={{
          display: 'flex',
          gap: STRIP_GAP,
          alignItems: 'flex-end',
          padding: `${STRIP_TOP}px ${STRIP_SIDE}px ${STRIP_BOTTOM}px`,
          // Holds its height with no cards too, so the board above does not
          // rescale the moment the last card is played.
          minHeight: STRIP_TOP + CARD_H * STRIP_SCALE + STRIP_BOTTOM,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x proximity',
          scrollPaddingInline: STRIP_SIDE,
          overscrollBehaviorX: 'contain',
          // Nothing overlaps the strip on a phone (the controls row is in flow
          // below it), so it takes its own touches — the thumb scrolls it.
          pointerEvents: 'auto',
        }}>
        {content}
      </motion.div>
    );
  }

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
        // Shrink-to-fit on narrow screens so no card is clipped by the
        // viewport edge (see fanScale). 1 on any normal desktop width.
        transform: `scale(${fanScale(total, viewportW)})`,
        transformOrigin: 'bottom center',
        // The fan strip spans the full row width; without this it eats clicks
        // meant for anything it overlaps (the End Turn shelf sat unreachable
        // under it). Cards re-enable pointer events individually below.
        pointerEvents: 'none',
      }}>
      {content}
    </div>
  );
}

