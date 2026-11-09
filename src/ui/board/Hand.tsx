import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { itemPrice } from '@/engine/query';
import { CardFrame, SIZES } from '../card/CardFrame';
import { spring } from '../tokens';
import { useViewport } from '../hooks/useViewport';
import { usePress } from '../shop/usePress';
import { HandThumb, THUMB_H, THUMB_W } from './HandThumb';

/** The name a hand card announces itself by: "Cold Front, in your hand". The
 *  tutorial's gate and the QA scripts find a card in the hand by it. */
export const inHandLabel = (name: string) => `${name}, in your hand`;

interface Props {
  /** The cards in your hand: heroes and items, drawn (or given) and not yet
   *  played. A hero goes on the bench for free; an item onto a hero for its
   *  price, printed on its coin. */
  cards: CardInstance[];
  /** Your souls: an item whose price is more prints its coin red. */
  souls: number;
  disabled: boolean;
  pending: { iid: string } | null;
  /** True while the card can be played right now: a hero onto the board, an
   *  item onto some hero of yours (the engine's `playTargets`, souls
   *  included). One that cannot prints dimmed. */
  playable: (c: CardInstance) => boolean;
  onTap: (c: CardInstance) => void;
  onLongPress?: (c: CardInstance) => void;
  onHover?: (c: CardInstance | null) => void;
  onDragEndOver?: (c: CardInstance, x: number, y: number) => void;
  /** Fired when the player taps a card no hero can take — lets the Board say
   *  why instead of a silent no-op. */
  onBlocked?: (c: CardInstance) => void;
  /** A card arriving from elsewhere on the board: it fades in where it
   *  lands, while the board flies it there. */
  arriving?: string | null;
  /** Where each card is on screen, for the board's (and the animation
   *  layer's) flights to it. */
  registerCard?: (iid: string, el: HTMLElement | null) => void;
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
const CARD_W = SIZES.hand.w;

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
 * Phones get no fan: a flat strip of compact cards (HandThumb — the item's art
 * over a foot in its category's colour) side by side, that scrolls sideways
 * when it overflows. Whole cards, even at four fifths of the fan's size, left
 * room for three across a 390px screen and took a fifth of its height from
 * the board; a held card (long press) opens the full card to read.
 */
const STRIP_GAP = 6;
const STRIP_SIDE = 12;
/** The armed card's lift on the strip. */
const STRIP_LIFT = 6;
/** Room above the cards for that lift, an active's bolt and the armed ring: a
 *  scroller clips what rises out of it. */
const STRIP_TOP = 14;
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

export function Hand({ cards, souls, disabled, pending, playable, onTap, onLongPress, onHover, onDragEndOver, onBlocked, arriving, registerCard }: Props) {
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
  // An empty hand takes no room: no label, no height held for it. It folds
  // away once the last card has finished leaving, so that card's exit plays.
  const [lastTotal, setLastTotal] = useState(total);
  const [leaving, setLeaving] = useState(false);
  if (total !== lastTotal) {
    setLastTotal(total);
    setLeaving(total === 0 && lastTotal > 0);
  }
  if (total === 0 && !leaving) return null;

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
  /** What each card is now: armed, one no hero can take, or not to be touched. */
  const stateOf = (c: CardInstance) => {
    const selected = pending?.iid === c.iid;
    // A card no hero can take right now (every one full, or wearing it).
    const stuck = !disabled && !playable(c);
    const cardDisabled = disabled || stuck;
    // Dim must live in the `animate` target, not `style` — framer's
    // animate={{ opacity: 1 }} overrides a style-prop opacity, which
    // silently disabled the stuck/disabled fade entirely.
    const opacity = cardDisabled && !selected ? (stuck ? 0.55 : 0.6) : 1;
    const price = itemPrice(c.cardId);
    const unaffordable = price > souls;
    const isHero = CARDS_BY_ID[c.cardId]?.type === 'hero';
    const why = !stuck ? '' : isHero ? ' — no room on the board now' : unaffordable ? ` — costs ${price} souls` : ' — no hero can take it now';
    const label = `${inHandLabel(CARDS_BY_ID[c.cardId]?.name ?? c.cardId)}${why}`;
    return { selected, stuck, cardDisabled, opacity, label, unaffordable };
  };
  const done = () => setLeaving(false);

  if (isMobile) {
    return (
      <motion.div
        // The strip scrolls; framer has to measure that offset for the cards'
        // layout animations (a card arriving, played, the rest closing up) to
        // start from the right place.
        layoutScroll
        className="hand-strip"
        style={{
          display: 'flex',
          gap: STRIP_GAP,
          alignItems: 'flex-end',
          padding: `${STRIP_TOP}px ${STRIP_SIDE}px ${STRIP_BOTTOM}px`,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x proximity',
          scrollPaddingInline: STRIP_SIDE,
          overscrollBehaviorX: 'contain',
          // Nothing overlaps the strip on a phone (the controls row is in flow
          // below it), so it takes its own touches — the thumb scrolls it.
          pointerEvents: 'auto',
        }}>
        <AnimatePresence onExitComplete={done}>
          {cards.map((c, i) => (
            <StripCard
              key={c.iid}
              card={c}
              {...stateOf(c)}
              // Auto margins on the ends centre a short hand and fall to 0
              // once it overflows, so the first card can always be scrolled back to.
              first={i === 0}
              last={i === total - 1}
              landing={arriving === c.iid}
              onTap={onTap}
              onLongPress={onLongPress}
              onHover={onHover}
              onBlocked={onBlocked}
              registerCard={registerCard}
            />
          ))}
        </AnimatePresence>
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
        // The tray's own foot is in the bottom padding: an empty hand takes
        // none of it.
        padding: '14px 0 20px',
        overflow: 'visible',
        justifyContent: 'center',
        alignItems: 'flex-end',
        // Shrink-to-fit on narrow screens so no card is clipped by the
        // viewport edge (see fanScale). 1 on any normal desktop width.
        transform: `scale(${fanScale(total, viewportW)})`,
        transformOrigin: 'bottom center',
        // The fan strip spans the full row width; without this it eats clicks
        // meant for anything it overlaps (the End Turn shelf sat unreachable
        // under it). Cards re-enable pointer events individually below.
        pointerEvents: 'none',
      }}>
      <AnimatePresence onExitComplete={done}>
        {cards.map((c, i) => {
          const { selected, stuck, cardDisabled, opacity, label, unaffordable } = stateOf(c);
          const rot = selected ? 0 : fanRotation(i, total);
          const y = selected ? -42 : fanY(i, total);
          // A card flown in fades in on its own spot as the board's flight
          // lands there; one drawn rises in from below.
          const landing = arriving === c.iid;

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
              initial={landing ? { opacity: 0 } : { opacity: 0, y: 120, scale: 0.5 }}
              animate={{ opacity, y, scale: selected ? 1.06 : 1, rotate: rot }}
              exit={{ opacity: 0, y: -60, scale: 0.5, transition: { duration: 0.25 } }}
              transition={landing ? { ...spring.default, opacity: { delay: 0.32, duration: 0.2 } } : spring.default}
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
                // Tapping a card no hero can take on your own turn gets
                // explicit feedback instead of a silent no-op.
                if (stuck) onBlocked?.(c);
              }}
              role="button"
              aria-label={label}
              aria-pressed={selected}
              style={{
                // No CSS transition on marginLeft — the framer `layout` prop is
                // the single position driver. A CSS transition here used to
                // double-animate against the layout spring and made hand
                // reflow (hover relief, card played/drawn) visibly chop.
                marginLeft,
                cursor: cardDisabled ? 'default' : 'pointer',
                transformOrigin: 'bottom center',
                zIndex,
                // The fan keeps every gesture for framer's drag.
                touchAction: 'none',
                // A card no hero can take prints greyer.
                filter: stuck ? 'saturate(0.55)' : undefined,
                pointerEvents: 'auto', // opt back in under the fan's pointerEvents:none
              }}
            >
              {/* The card's box, registered for the board's flight to it —
                  on an inner node: AnimatePresence's own child takes no ref. */}
              <div ref={(el) => registerCard?.(c.iid, el)}>
                <CardFrame
                  cardId={c.cardId}
                  size="hand"
                  // The price an item costs to put on a hero (red: not enough souls).
                  unaffordable={unaffordable}
                  selected={selected}
                  glow={selected ? 'accent' : null}
                  // A tap on a card in the fan arms it, wherever it lands.
                  tapExplains={false}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * One card on the phone's strip. A tap arms it (a card no hero can take says
 * why instead); a press held opens the full card, and the tap that ends it is
 * swallowed — the browser's own click too, which would land on the preview
 * that has just opened under the finger and close it; a thumb that scrolls the
 * strip from it hands the gesture to the browser (pan-x) and fires neither. No
 * hover peek under a finger.
 */
function StripCard({ card: c, selected, stuck, cardDisabled, opacity, label, unaffordable, first, last, landing, onTap, onLongPress, onHover, onBlocked, registerCard }: {
  card: CardInstance;
  selected: boolean;
  stuck: boolean;
  cardDisabled: boolean;
  opacity: number;
  label: string;
  unaffordable: boolean;
  first: boolean;
  last: boolean;
  landing: boolean;
} & Pick<Props, 'onTap' | 'onLongPress' | 'onHover' | 'onBlocked' | 'registerCard'>) {
  // Set when a held press has opened the full card, until the finger lifts.
  const held = useRef(false);
  const press = usePress(
    () => {
      if (!cardDisabled) onTap(c);
      // Tapping a card no hero can take on your own turn gets explicit
      // feedback instead of a silent no-op.
      else if (stuck) onBlocked?.(c);
    },
    () => { held.current = true; onLongPress?.(c); },
    onHover ? (on) => onHover(on ? c : null) : undefined,
  );
  return (
    <motion.div
      layoutId={`card-${c.iid}`}
      layout
      // A card flown in fades in on its own spot as the board's flight lands
      // there; one drawn rises into the strip.
      initial={landing ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.6 }}
      animate={{ opacity, y: selected ? -STRIP_LIFT : 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.6, transition: { duration: 0.22 } }}
      transition={landing ? { ...spring.default, opacity: { delay: 0.32, duration: 0.2 } } : spring.default}
      whileTap={{ scale: 0.94 }}
      {...press}
      onPointerDown={(e) => { held.current = false; press.onPointerDown(e); }}
      // A finger lifted after a held press: no click is made of it.
      onTouchEnd={(e: TouchEvent) => { if (held.current) { held.current = false; e.preventDefault(); } }}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      style={{
        marginLeft: first ? 'auto' : 0,
        marginRight: last ? 'auto' : 0,
        flex: '0 0 auto',
        width: THUMB_W,
        height: THUMB_H,
        scrollSnapAlign: 'start',
        cursor: cardDisabled ? 'default' : 'pointer',
        // The strip pans sideways under the thumb.
        touchAction: 'pan-x',
        // A card no hero can take prints greyer.
        filter: stuck ? 'saturate(0.55)' : undefined,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as CSSProperties}
    >
      {/* The card's box, registered for the board's flight to it —
          on an inner node: AnimatePresence's own child takes no ref. */}
      <div ref={(el) => registerCard?.(c.iid, el)}>
        <HandThumb cardId={c.cardId} armed={selected} unaffordable={unaffordable} />
      </div>
    </motion.div>
  );
}
