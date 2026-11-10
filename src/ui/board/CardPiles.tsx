/**
 * A side's deck and discard pile on the board, each with its count
 * (docs/deck-plan.md). Plain on purpose: the deck is a short stack of card
 * backs, the discard pile shows its top card face up, and a tap on the
 * discard pile lists what is in it. The card motion between the deck, the
 * hand and the discard pile (the `deck` FX events the engine reports) is for
 * the board's animation layer to add; these keep stable `data-pile` hooks it
 * can find them by.
 *
 *   DeckPile     the deck, face down, and how many cards are left in it
 *   DiscardPile  the discard pile's top card, its count, and the list on tap
 *   CardPiles    the two side by side, for one side of the table
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID, cardName, itemCard } from '@/cards';
import { HERO_IMG_BASE } from '@/art/assets';
import { fonts, spring } from '../tokens';
import { poster, shopInk } from '../poster';
import { itemArtUrl } from '../card/ItemIcon';
import { useTickedCount } from '../motion/DeckMotionContext';
import { CardBack, EMPTY_DASH } from './OpponentHand';
import { countChipStyle, panelStyle, scale } from '../hud';

/** A pile's card size, px. */
const PILE = {
  /** Beside the hand on a wide screen. */
  full: { w: 46, h: 64, radius: 7 },
  /** Beside the hand on a phone. */
  small: { w: 40, h: 56, radius: 6 },
  /** The rival's, in the strip above the sheet. */
  chip: { w: 26, h: 36, radius: 4 },
} as const;
type PileSize = keyof typeof PILE;

/** The count chip on a pile, attached to its bottom corner (the right one,
 *  or the left for a pile whose right edge is off the screen): an ink badge
 *  edged in the side's colour. */
function Count({ n, accent, small, at = 'right' }: { n: number; accent: string; small: boolean; at?: 'left' | 'right' }) {
  return (
    <span aria-hidden data-pile-count style={{
      ...countChipStyle(accent, small ? scale.label : 12),
      position: 'absolute',
      [at]: -3,
      bottom: -4,
      zIndex: 8,
    }}>{n}</span>
  );
}

/** An empty pile: a quiet dashed well where the cards would lie. */
function EmptyWell({ w, h, radius, top = 0 }: { w: number; h: number; radius: number; top?: number }) {
  return (
    <div style={{
      position: 'absolute', left: 0, top, width: w, height: h,
      borderRadius: radius, boxSizing: 'border-box',
      border: `1.5px dashed ${EMPTY_DASH}`,
      background: 'rgba(0, 0, 0, 0.28)',
    }} />
  );
}

/** One card's edge under a pile's top card: a sliver of the charcoal back
 *  with a light keyline, so the stack reads as cards lying on cards. */
const pileEdge = (radius: number, first: boolean): CSSProperties => ({
  width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: radius,
  background: poster.panel,
  border: '1px solid rgba(232, 224, 204, 0.3)',
  boxShadow: first ? '0 3px 8px rgba(0, 0, 0, 0.45)' : 'none',
});

/** The deck, face down: up to three backs offset into a stack (none when it
 *  is empty: a dashed outline holds its place), and the count. */
export function DeckPile({ count, owner, size = 'full', accent, countAt = 'right' }: {
  count: number;
  owner: 'you' | 'rival';
  size?: PileSize;
  accent: string;
  /** Which bottom corner the count sits at (the left for a deck whose right
   *  edge is off the screen). */
  countAt?: 'left' | 'right';
}) {
  const { w, h, radius } = PILE[size];
  // The count as the motion shows it: a card in the air has left or not yet landed.
  const shown = useTickedCount(`deck-${owner}`, count);
  // The stack's thickness: a plain edge per card under the top back, up to five.
  const layers = Math.min(5, shown);
  const step = size === 'chip' ? 1 : 1.5;
  const label = `${owner === 'you' ? 'Your' : "Rival's"} deck: ${shown} card${shown === 1 ? '' : 's'}`;
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      data-pile={`deck-${owner}`}
      style={{ position: 'relative', width: w + 4, height: h + 4, flex: '0 0 auto' }}
    >
      {layers === 0 ? <EmptyWell w={w} h={h} radius={radius} top={4} /> : (
        Array.from({ length: layers }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: i * step, top: 4 - i * step, width: w, height: h }}>
            {i === layers - 1 ? <CardBack radius={radius} small={size === 'chip'} /> : <div style={pileEdge(radius, i === 0)} />}
          </div>
        ))
      )}
      <Count n={shown} accent={accent} small={size !== 'full'} at={countAt} />
    </div>
  );
}

/** A card face, small: an item's art framed in its tab's colour, or a hero's
 *  portrait. */
function PileFace({ card, w, h, radius }: { card: CardInstance; w: number; h: number; radius: number }) {
  const item = itemCard(card.cardId);
  const url = item ? itemArtUrl(card.cardId) : `${HERO_IMG_BASE}${card.cardId}_sm.webp`;
  const ink = item ? shopInk(item.slot).ink : poster.edge;
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, overflow: 'hidden', boxSizing: 'border-box',
      background: poster.ground, border: `2px solid ${ink}`,
      boxShadow: '0 0 0 1px rgba(232, 224, 204, 0.35), 0 3px 8px rgba(0, 0, 0, 0.4)',
    }}>
      {url && (
        <img src={url} alt="" draggable={false} decoding="async"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
      )}
    </div>
  );
}

/** The discard pile: its top card face up and the count; a tap lists every
 *  card in it, newest first (a tap away closes the list). */
export function DiscardPile({ cards, owner, size = 'full', accent }: {
  cards: CardInstance[];
  owner: 'you' | 'rival';
  size?: PileSize;
  accent: string;
}) {
  const { w, h, radius } = PILE[size];
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The count as the motion shows it: a card still in the air is not on the
  // pile yet, so the top card is the one under it.
  const shown = useTickedCount(`discard-${owner}`, cards.length);
  const top = cards[Math.min(shown, cards.length) - 1];
  // The edges under the top card: one for each card under it, up to two.
  const under = Math.min(2, Math.max(0, Math.min(shown, cards.length) - 1));
  const label = `${owner === 'you' ? 'Your' : "Rival's"} discard pile: ${shown} card${shown === 1 ? '' : 's'}`;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);
  useEffect(() => { if (cards.length === 0) setOpen(false); }, [cards.length]);
  return (
    <div ref={box} data-pile={`discard-${owner}`} style={{ position: 'relative', width: w + 4, height: h + 4, flex: '0 0 auto' }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        disabled={cards.length === 0}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'absolute', left: 0, top: 4, width: w, height: h, padding: 0,
          border: 'none', background: 'transparent', cursor: cards.length ? 'pointer' : 'default',
        }}
      >
        {top ? (
          <>
            {/* The cards under the top one, as edges. */}
            {Array.from({ length: under }, (_, i) => (
              <div key={i} aria-hidden style={{ position: 'absolute', left: i * 1.5, top: -i * 1.5, width: w, height: h }}>
                <div style={pileEdge(radius, i === 0)} />
              </div>
            ))}
            <div style={{ position: 'absolute', left: under * 1.5, top: -under * 1.5 }}>
              <PileFace card={top} w={w} h={h} radius={radius} />
            </div>
          </>
        ) : <EmptyWell w={w} h={h} radius={radius} />}
      </button>
      <Count n={shown} accent={accent} small={size !== 'full'} />
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.12 } }}
            transition={spring.snappy}
            aria-label={`${owner === 'you' ? 'Your' : "Rival's"} discard pile`}
            style={{
              position: 'absolute',
              [owner === 'you' ? 'bottom' : 'top']: h + 12,
              // Opens toward the table's middle: the rival's pile sits at
              // the strip's left end, yours at the hand's right.
              [owner === 'you' ? 'right' : 'left']: 0,
              zIndex: 60,
              ...panelStyle,
              borderRadius: 6,
              margin: 0,
              padding: '8px 12px',
              listStyle: 'none',
              minWidth: 176,
              maxHeight: 240,
              overflowY: 'auto',
              fontFamily: fonts.ui,
              fontSize: scale.body,
              fontWeight: 600,
              lineHeight: 1.6,
              color: poster.ink,
            }}
          >
            {[...cards].reverse().map((c) => (
              <li key={c.iid} style={{ whiteSpace: 'nowrap' }}>
                {cardName(c.cardId)}
                {CARDS_BY_ID[c.cardId]?.type === 'hero' && <span style={{ color: poster.inkDim, fontSize: scale.label, fontWeight: 500 }}> · hero</span>}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One side's deck and discard pile, side by side. */
export function CardPiles({ ps, owner, compact = false }: { ps: PlayerState; owner: 'you' | 'rival'; compact?: boolean; pid?: PlayerID }) {
  const accent = owner === 'you' ? poster.you : poster.rival;
  const size: PileSize = compact ? 'chip' : 'full';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: compact ? 12 : 16, pointerEvents: 'auto' }}>
      <DeckPile count={ps.deck.length} owner={owner} size={size} accent={accent} />
      <DiscardPile cards={ps.discard} owner={owner} size={size} accent={accent} />
    </div>
  );
}
