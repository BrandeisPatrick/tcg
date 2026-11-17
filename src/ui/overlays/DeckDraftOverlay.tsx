/**
 * The deck draft (Patrick, 2026-11-17: "we draft hero and then draft deck"):
 * the screen between the hero draft and the table. Your three drafted heroes
 * across the top; under them the decks offered for them (cards/deckOffers.ts:
 * the two ready decks that fit them best, the deck of their own builds, and
 * your saved deck when you have one), each a panel with why it is offered, the
 * heroes it was made for, its line and its 16 items. A tap picks one (it
 * lights in gold), one button confirms: "Play Crossfire". The arrow keys move
 * the pick and Enter confirms.
 *
 * Printed in the hero draft's lobby idiom: the dark ground, cream type, gold
 * for the pick. Each panel carries a bar of its items by shop slot (Weapon,
 * Spirit, Vitality), so the decks compare at a glance.
 *
 * On a phone (2026-11-17) the decks stack, and only the picked one opens to
 * its line and its items: the others are their name, why and slot bar, so
 * all of them fit near one screen. The Play button stays pinned at the foot.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { CardId, DeckOffer } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { deckLean } from '@/cards/deckOffers';
import { HERO_IMG_BASE } from '@/art/assets';
import { useCalmMotion } from '../effects/fx/FxMotionContext';
import { useViewport } from '../hooks/useViewport';
import { fonts, spring, text } from '../tokens';
import { poster, shopInk } from '../poster';
import { PosterButton } from '../chrome';

interface Props {
  /** Your drafted heroes, in pick order. */
  heroes: CardId[];
  offers: DeckOffer[];
  onPick: (index: number) => void;
}

export function DeckDraftOverlay({ heroes, offers, onPick }: Props) {
  const { isMobile } = useViewport();
  const calm = useCalmMotion();
  const n = offers.length;
  const [index, setIndex] = useState(0);
  const chosen = offers[index];
  const confirm = useCallback(() => { if (chosen) onPick(index); }, [chosen, index, onPick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i - 1 + n) % Math.max(1, n)); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (i + 1) % Math.max(1, n)); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, confirm]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-label="Draft your deck"
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: poster.ground, color: poster.cream, fontFamily: fonts.ui,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: isMobile ? 12 : 20,
        padding: isMobile ? '14px 16px 0' : 'clamp(18px, 3vh, 32px) clamp(20px, 4vw, 48px)',
        overflowY: 'auto', overflowX: 'hidden',
      }}
    >
      <header style={{
        display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center',
        justifyContent: 'center', gap: isMobile ? 12 : 10, flexShrink: 0,
      }}>
        <h1 style={{
          margin: 0, fontFamily: fonts.display, fontWeight: 400, fontSize: isMobile ? 18 : 26,
          letterSpacing: isMobile ? '0.12em' : '0.16em', textTransform: 'uppercase', color: poster.cream,
        }}>
          Draft your deck
        </h1>
        <div style={{ display: 'flex', gap: isMobile ? 4 : 6 }} aria-label={`Your heroes: ${heroes.map(cardName).join(', ')}`}>
          {heroes.map((h) => <Face key={h} heroId={h} size={isMobile ? 32 : 48} />)}
        </div>
        {!isMobile && (
          <p style={{ ...text.label, margin: 0, fontSize: 11, letterSpacing: '0.12em', color: poster.creamDim, textAlign: 'center' }}>
            Decks that fit your heroes
          </p>
        )}
      </header>

      <div style={{
        display: 'grid', width: '100%', maxWidth: 1180, gap: isMobile ? 10 : 14,
        gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(n, 4)}, minmax(0, 1fr))`,
      }}>
        {offers.map((o, i) => (
          <OfferPanel
            key={o.id}
            offer={o}
            first={i === 0}
            chosen={i === index}
            compact={isMobile}
            transition={calm ? { duration: 0 } : spring.snappy}
            onTap={() => setIndex(i)}
          />
        ))}
      </div>

      {/* On a phone the button is pinned at the foot, over a fade of the ground. */}
      <div style={isMobile ? {
        position: 'sticky', bottom: 0, alignSelf: 'stretch', flexShrink: 0, zIndex: 1,
        display: 'flex', justifyContent: 'center', padding: '22px 0 16px', marginTop: 'auto',
        background: `linear-gradient(to bottom, transparent, ${poster.ground} 40%)`,
      } : { flexShrink: 0, paddingBottom: 4 }}>
        <PosterButton variant="paper" onClick={confirm} ariaLabel={`Play ${chosen?.name ?? ''}`}>
          Play {chosen?.name}
        </PosterButton>
      </div>
    </motion.div>
  );
}

/** One offer: its name, why it is offered, the heroes it was made for, its
 *  slot bar, its line and its items, counted (on a phone the last two only
 *  while it is picked). */
function OfferPanel({ offer, first, chosen, compact, transition, onTap }: {
  offer: DeckOffer;
  first: boolean;
  chosen: boolean;
  compact: boolean;
  transition: object;
  onTap: () => void;
}) {
  const counted = countItems(offer.items);
  // On a phone only the picked deck opens to its line and its items.
  const open = !compact || chosen;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (compact && chosen) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [compact, chosen]);
  return (
    <motion.article
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={chosen}
      aria-label={`${offer.name}: ${offer.why}`}
      data-deck-offer={offer.id}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); onTap(); } }}
      initial={false}
      animate={{ y: chosen ? -4 : 0 }}
      transition={transition}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, cursor: 'pointer',
        padding: compact ? 12 : 14, borderRadius: 8,
        background: poster.panel,
        boxShadow: chosen
          ? `inset 0 0 0 2px ${poster.gold}, 0 0 18px rgba(217, 182, 74, 0.35)`
          : `inset 0 0 0 1px ${poster.edge}`,
        opacity: chosen ? 1 : 0.86,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{
          margin: 0, flex: 1, minWidth: 0, fontFamily: fonts.display, fontWeight: 400,
          fontSize: compact ? 17 : 19, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.05,
          color: chosen ? poster.gold : poster.cream,
        }}>{offer.name}</h2>
        {first && (
          <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.14em', color: poster.gold, whiteSpace: 'nowrap' }}>Best fit</span>
        )}
      </div>

      <p style={{ ...text.label, margin: 0, fontSize: 10.5, letterSpacing: '0.1em', color: poster.gold, lineHeight: 1.3 }}>
        {offer.why}
      </p>

      {/* The heroes it was made for (on a phone the line above names them). */}
      {!compact && offer.madeFor.length > 0 && (
        <div aria-hidden style={{ display: 'flex', gap: 4 }}>
          {offer.madeFor.map((h) => <Face key={h} heroId={h} size={28} />)}
        </div>
      )}

      <SlotBar items={offer.items} />

      {open && (
        <p style={{ ...text.body, margin: 0, fontSize: 12.5, lineHeight: 1.35, color: poster.creamDim }}>
          {offer.blurb}
        </p>
      )}

      {open && <ul style={{
        listStyle: 'none', margin: 0, padding: '8px 0 0', borderTop: `1px solid ${poster.edge}`,
        display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : '1fr', gap: '3px 10px',
      }}>
        {counted.map(([id, k]) => {
          const slot = itemCard(id)?.slot;
          return (
            <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 12, color: poster.cream }}>
              <span aria-hidden style={{
                width: 7, height: 7, borderRadius: 2, flexShrink: 0,
                background: slot === 'weapon' || slot === 'spirit' || slot === 'vitality' ? shopInk(slot).ink : poster.creamFaint,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {k > 1 && <span style={{ color: poster.creamDim }}>{k}× </span>}{cardName(id)}
              </span>
            </li>
          );
        })}
      </ul>}
    </motion.article>
  );
}

const SLOTS = ['weapon', 'spirit', 'vitality'] as const;
const SLOT_WORD = { weapon: 'Weapon', spirit: 'Spirit', vitality: 'Vitality' } as const;

/** A deck's items by shop slot: one bar in the slots' own inks, each part as
 *  wide as its share, the counts beside it. */
function SlotBar({ items }: { items: readonly CardId[] }) {
  const lean = deckLean(items);
  const counts = SLOTS.map((k) => Math.round(lean[k] * items.length));
  const label = SLOTS.map((k, i) => `${counts[i]} ${SLOT_WORD[k]}`).join(' · ');
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', background: poster.edge }}>
        {SLOTS.map((k) => lean[k] > 0 && <span key={k} style={{ width: `${lean[k] * 100}%`, background: shopInk(k).ink }} />)}
      </div>
      <span aria-hidden style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.08em', color: poster.creamDim, whiteSpace: 'nowrap' }}>
        {SLOTS.map((k, i) => counts[i] > 0 && (
          <span key={k} style={{ marginLeft: i ? 6 : 0 }}><span style={{ color: shopInk(k).ink }}>■</span> {counts[i]}</span>
        ))}
      </span>
    </div>
  );
}

/** A deck's items with their counts, cheapest tier first (in the order they
 *  first appear within a tier). */
function countItems(items: readonly CardId[]): [CardId, number][] {
  const out = new Map<CardId, number>();
  for (const id of items) out.set(id, (out.get(id) ?? 0) + 1);
  return [...out.entries()].sort((a, b) => (itemCard(a[0])?.tier ?? 0) - (itemCard(b[0])?.tier ?? 0));
}

/** A hero's face, square, as the roster crops it. */
function Face({ heroId, size }: { heroId: CardId; size: number }) {
  return (
    <span style={{ display: 'block', width: size, height: size, background: poster.frame, boxShadow: `inset 0 0 0 1px ${poster.edge}`, overflow: 'hidden', borderRadius: 3, flexShrink: 0 }}>
      <img
        src={`${HERO_IMG_BASE}${heroId}_card.webp`}
        alt=""
        draggable={false}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 12%', userSelect: 'none' }}
      />
    </span>
  );
}
