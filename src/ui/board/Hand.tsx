import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { itemPrice } from '@/engine/query';
import { CardFrame, SIZES } from '../card/CardFrame';
import { spring } from '../tokens';
import { poster } from '../poster';
import { useFxCalm } from '../effects/fx/FxMotionContext';

/** The name a hand card announces itself by: "Cold Front, in your hand". The
 *  tutorial's gate and the QA scripts find a card in the hand by it. */
export const inHandLabel = (name: string) => `${name}, in your hand`;

/** Whether `iid` is among the cards arriving (`arriving`: one, or a list). */
const isLanding = (arriving: string | readonly string[] | null | undefined, iid: string): boolean =>
  typeof arriving === 'string' ? arriving === iid : !!arriving?.includes(iid);

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
   *  included). One that cannot prints dimmed; one that can pulses. */
  playable: (c: CardInstance) => boolean;
  onTap: (c: CardInstance) => void;
  onLongPress?: (c: CardInstance) => void;
  onHover?: (c: CardInstance | null) => void;
  onDragEndOver?: (c: CardInstance, x: number, y: number) => void;
  /** Fired when the player taps a card no hero can take — lets the Board say
   *  why instead of a silent no-op. */
  onBlocked?: (c: CardInstance) => void;
  /** Cards arriving from elsewhere on the board (a draw, a hero back from
   *  the lane): each fades in where it lands, while the board flies it there. */
  arriving?: string | readonly string[] | null;
  /** Where each card is on screen, for the board's (and the animation
   *  layer's) flights to it. */
  registerCard?: (iid: string, el: HTMLElement | null) => void;
  /** The width the fan may take, stage px: a fan wider than it shrinks to fit. */
  avail: number;
}

// The fan's arc: the outer cards turn out and sit lower.
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

/** How far a tapped card lifts out of the fan, px. */
const SELECTED_LIFT = 96;

/**
 * The overlap table above is tuned for a wide strip, so on a narrow band
 * even a small hand is wider than the room and the outermost cards would
 * run off it. Rather than crushing the spacing (which collides the name
 * plates), shrink the whole fan to fit: the cards keep their proportions
 * and stay legible, just smaller.
 */
function fanScale(total: number, avail: number): number {
  if (total < 1) return 1;
  const natural = CARD_W * total + cardOverlap(total) * (total - 1);
  return Math.min(1, (avail - 16) / natural);
}

/**
 * Your hand — a fan along the very bottom edge of the stage, overlapping
 * and partly off the screen as Pokémon TCG Pocket's is: the cards' top
 * halves show, a tapped card lifts out of the fan to be read, and a card
 * that can be played right now breathes with a gold light. Drag a card onto
 * a hero (a pointer) or tap it and then the hero.
 */
export function Hand({ cards, souls, disabled, pending, playable, onTap, onLongPress, onHover, onDragEndOver, onBlocked, arriving, registerCard, avail }: Props) {
  const total = cards.length;
  const calm = useFxCalm();
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
  const done = () => setLeaving(false);

  return (
    <div
      data-hand="you"
      onMouseLeave={closePreview}
      onPointerLeave={closePreview}
      style={{
        display: 'flex',
        gap: 0,
        padding: '14px 0 0',
        overflow: 'visible',
        justifyContent: 'center',
        alignItems: 'flex-start',
        width: avail,
        // Shrink-to-fit so no card is clipped by the band's edge (see fanScale).
        transform: `scale(${fanScale(total, avail)})`,
        transformOrigin: 'top center',
        // The fan spans the whole band; without this it eats clicks meant
        // for anything it overlaps. Cards re-enable pointer events below.
        pointerEvents: 'none',
      }}>
      <AnimatePresence onExitComplete={done}>
        {cards.map((c, i) => {
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
          // What can be acted on pulses: a card that can be played, while
          // nothing is armed.
          const usable = !cardDisabled && !pending;
          const rot = selected ? 0 : fanRotation(i, total);
          const y = selected ? -SELECTED_LIFT : fanY(i, total);
          // A card flown in fades in on its own spot as the board's flight
          // lands there; one drawn rises in from below.
          const landing = isLanding(arriving, c.iid);

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
              animate={{ opacity, y: isHovered && !selected ? y - 28 : y, scale: selected ? 1.06 : 1, rotate: rot }}
              exit={{ opacity: 0, y: -60, scale: 0.5, transition: { duration: 0.25 } }}
              transition={landing ? { ...spring.default, opacity: { duration: 0.1 } } : spring.default}
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
                position: 'relative',
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
              {/* The usable light: a gold halo that breathes round a card that
                  can be played now (steady under calm motion). */}
              {usable && (
                <motion.div
                  aria-hidden
                  data-usable
                  initial={{ opacity: 0.35 }}
                  animate={calm ? { opacity: 0.7 } : { opacity: [0.35, 0.9, 0.35] }}
                  transition={calm ? { duration: 0.2 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 10,
                    boxShadow: `0 0 0 2px ${poster.you}, 0 0 16px 4px ${poster.you}99`,
                    pointerEvents: 'none',
                  }}
                />
              )}
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
                  // A hero back from the lane keeps its level: its frame says so.
                  level={CARDS_BY_ID[c.cardId]?.type === 'hero' ? c.level : undefined}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
