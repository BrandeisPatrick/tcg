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
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID, cardName, itemCard } from '@/cards';
import { HERO_IMG_BASE } from '@/art/assets';
import { fonts, spring } from '../tokens';
import { poster, shopInk } from '../poster';
import { itemArtUrl } from '../card/ItemIcon';
import { useTickedCount } from '../motion/DeckMotionContext';
import { CardBack } from './OpponentHand';

/** A pile's card size, px. */
const PILE = {
  full: { w: 46, h: 64, radius: 7 },
  chip: { w: 26, h: 36, radius: 4 },
} as const;
type PileSize = keyof typeof PILE;

/** The count badge on a pile. */
function Count({ n, accent, small }: { n: number; accent: string; small: boolean }) {
  const d = small ? 16 : 20;
  return (
    <span aria-hidden style={{
      position: 'absolute',
      right: small ? -7 : -8,
      bottom: small ? -6 : -7,
      minWidth: d,
      height: d,
      padding: '0 4px',
      boxSizing: 'border-box',
      borderRadius: d / 2,
      background: poster.ink,
      border: `1.5px solid ${accent}`,
      color: poster.cream,
      fontFamily: fonts.display,
      fontSize: small ? 10 : 12,
      lineHeight: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontVariantNumeric: 'tabular-nums',
      boxShadow: '0 2px 5px rgba(0, 0, 0, 0.45)',
    }}>{n}</span>
  );
}

/** The deck, face down: up to three backs offset into a stack (none when it
 *  is empty: a dashed outline holds its place), and the count. */
export function DeckPile({ count, owner, size = 'full', accent }: {
  count: number;
  owner: 'you' | 'rival';
  size?: PileSize;
  accent: string;
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
      {layers === 0 ? (
        <div style={{
          position: 'absolute', left: 0, top: 4, width: w, height: h,
          borderRadius: radius, border: `1.5px dashed ${poster.creamFaint}`, boxSizing: 'border-box',
        }} />
      ) : (
        Array.from({ length: layers }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: i * step, top: 4 - i * step, width: w, height: h }}>
            {i === layers - 1 ? <CardBack radius={radius} /> : (
              <div style={{
                width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: radius,
                background: poster.panel, border: `2px solid ${poster.edge}`,
                boxShadow: i === 0 ? '0 4px 12px rgba(0, 0, 0, 0.45)' : undefined,
              }} />
            )}
          </div>
        ))
      )}
      <Count n={shown} accent={accent} small={size === 'chip'} />
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
      background: poster.ground, border: `2px solid ${ink}`, boxShadow: '0 4px 10px rgba(0, 0, 0, 0.45)',
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
        {top ? <PileFace card={top} w={w} h={h} radius={radius} /> : (
          <div style={{
            width: w, height: h, borderRadius: radius, boxSizing: 'border-box',
            border: `1.5px dashed ${poster.creamFaint}`,
          }} />
        )}
      </button>
      <Count n={shown} accent={accent} small={size === 'chip'} />
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
              right: 0,
              zIndex: 60,
              margin: 0,
              padding: '8px 10px',
              listStyle: 'none',
              minWidth: 168,
              maxHeight: 220,
              overflowY: 'auto',
              background: poster.panel,
              border: `1.5px solid ${poster.edge}`,
              borderRadius: 8,
              boxShadow: '0 10px 22px rgba(0, 0, 0, 0.5)',
              color: poster.cream,
              fontFamily: fonts.ui,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {[...cards].reverse().map((c) => (
              <li key={c.iid} style={{ whiteSpace: 'nowrap' }}>
                {cardName(c.cardId)}
                {CARDS_BY_ID[c.cardId]?.type === 'hero' && <span style={{ color: poster.creamDim }}> · hero</span>}
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
