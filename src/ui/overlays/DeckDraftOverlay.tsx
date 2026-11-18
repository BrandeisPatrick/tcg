/**
 * The deck draft (Patrick, 2026-11-17: "we draft hero and then draft deck"):
 * the screen between the hero draft and the table, and the second step of the
 * same lobby. The hero draft's own ground, pick strips and plate stay where
 * they were (both crews' heroes along the top, the plate now reading PLAY);
 * under them, where the roster was, the decks offered for your heroes
 * (cards/deckOffers.ts: the two ready decks that fit them best, and your own).
 *
 * Each deck is a card of the lobby's tarot kind: numbered, a band of its
 * items by shop slot (Weapon, Spirit, Vitality) and a cream name plate at the
 * foot. A ready deck's face is the heroes it was made for; your deck's is its
 * 16 items. A tap picks one (gold frame, full colour); under the cards one
 * sheet, the picked deck's, says why it is offered, its line, and its 16
 * items as their shop tiles, counted. The plate confirms; the arrow keys move
 * the pick and Enter confirms.
 *
 * Your deck is yours to change here too (Patrick, 2026-11-18: "we want full
 * customizable playable deck"): the sheet's "Customize" opens the Loadout's
 * deck builder on a copy of the picked deck, any of them. Saved, the copy is
 * your deck: in the Loadout, on the third card, and picked.
 *
 * A phone prints the same thing smaller: the cards three across, the sheet's
 * items in two columns, the plate in the header as the hero draft has it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CardId, DeckOffer } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { isLegalDeck } from '@/cards/decks';
import { YOUR_DECK, deckLean } from '@/cards/deckOffers';
import { saveDeck } from '@/storage/playerData';
import { heroArtFocus, heroPortraitArt } from '@/cards/art/heroArt';
import { HERO_IMG_BASE } from '@/art/assets';
import { useCalmMotion } from '../effects/fx/FxMotionContext';
import { useViewport } from '../hooks/useViewport';
import { fonts, spring, text } from '../tokens';
import { poster, shopInk, chamfer, clipBoth } from '../poster';
import { ItemIcon, itemArtUrl } from '../card/ItemIcon';
import { PosterButton } from '../chrome';
import { DeckEditor } from '../collection/DeckEditor';
import { LobbyBackdrop, LockButton, PickStrips } from './DraftOverlay';

interface Props {
  /** Your drafted heroes, in pick order. */
  heroes: CardId[];
  /** The rival's, for the strip across from yours. */
  rivalHeroes?: CardId[];
  offers: DeckOffer[];
  /** The offer picked; with `items`, the deck played in its place (your deck, as customized here). */
  onPick: (index: number, items?: CardId[]) => void;
}

/** True for the offer that is the player's own deck: the saved one (`own`),
 *  or, with none saved, the deck of the heroes' builds (`builds`). */
const isYours = (o: DeckOffer) => o.id === 'own' || o.id === 'builds';

const NUMERALS = ['I', 'II', 'III', 'IV'];
const SLOTS = ['weapon', 'spirit', 'vitality'] as const;
type Slot = (typeof SLOTS)[number];
const SLOT_WORD: Record<Slot, string> = { weapon: 'Weapon', spirit: 'Spirit', vitality: 'Vitality' };

export function DeckDraftOverlay({ heroes, rivalHeroes = [], offers, onPick }: Props) {
  // The hero draft's own break: below it the strips and cards tighten.
  const { width } = useViewport();
  const isMobile = width < 860;
  const calm = useCalmMotion();
  const n = offers.length;
  const [index, setIndex] = useState(0);
  // Your deck as saved from the builder in this draft: it takes the place of
  // the offer's own items on your card.
  const [mine, setMine] = useState<CardId[] | null>(null);
  // The builder, while it is open: the deck it started from.
  const [workshop, setWorkshop] = useState<{ from: DeckOffer } | null>(null);
  const yours = offers.findIndex(isYours);
  const decks = offers.map((o, i): DeckOffer => (i === yours && mine
    ? { ...o, id: 'own', items: mine, why: 'Saved in your Loadout', blurb: 'The deck you built. Customize changes any of its 16 items.' }
    : o));
  const chosen = decks[index];
  const confirm = useCallback(() => {
    if (!chosen) return;
    if (index === yours && mine) onPick(index, mine);
    else onPick(index);
  }, [chosen, index, yours, mine, onPick]);

  const editing = workshop !== null;
  useEffect(() => {
    // The builder has the keys while it is open.
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i - 1 + n) % Math.max(1, n)); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (i + 1) % Math.max(1, n)); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, confirm, editing]);

  // The builder's copy, saved: it is your deck from now on (the Loadout's
  // too), on your card, and the one picked.
  const keep = (items: CardId[]) => {
    saveDeck(items);
    setMine(items);
    if (yours >= 0) setIndex(yours);
    setWorkshop(null);
  };

  const plate = (
    <LockButton enabled={!!chosen} state="ready" word="Play" name={`Play ${chosen?.name ?? ''}`} onClick={confirm} compact={isMobile} />
  );
  // Three cards share a phone's width; a fourth runs off its edge, and the row scrolls.
  const cardW = isMobile
    ? (n <= 3 ? `calc((100% - ${8 * (n - 1)}px) / ${n})` : 'calc((100% - 16px) / 3 - 12px)')
    : 'clamp(140px, min(17vw, 32vh), 260px)';

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
        display: 'flex', flexDirection: 'column',
        padding: isMobile ? '12px 12px 14px' : 'clamp(14px, 2.4vh, 24px) clamp(18px, 3vw, 44px) clamp(12px, 2vh, 20px)',
        gap: isMobile ? 12 : 'clamp(10px, 1.8vh, 18px)',
        overflowY: 'auto', overflowX: 'hidden',
      }}
    >
      <LobbyBackdrop focused={chosen?.madeFor[0] ?? heroes[0] ?? null} />

      <header style={{
        position: 'relative', zIndex: 1, flexShrink: 0, display: 'flex', gap: isMobile ? 10 : 18,
        ...(isMobile
          ? { alignItems: 'center', justifyContent: 'space-between' }
          : { alignItems: 'baseline', flexWrap: 'wrap', minHeight: 34 }),
      }}>
        <h1 style={{
          margin: 0, fontFamily: fonts.display, fontWeight: 400, fontSize: isMobile ? 18 : 24,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: poster.cream, lineHeight: 1,
        }}>
          Draft your deck
        </h1>
        {isMobile ? plate : (
          <span style={{ ...text.label, fontSize: 11, letterSpacing: '0.3em', color: poster.creamDim, whiteSpace: 'nowrap' }}>
            Decks that fit your heroes
          </span>
        )}
      </header>

      <PickStrips
        mine={heroes}
        rival={rivalHeroes}
        myTurn={false}
        aiTurn={false}
        compact={isMobile}
        centre={isMobile ? undefined : plate}
      />

      <div
        role="group"
        aria-label="Decks"
        style={{
          position: 'relative', zIndex: 1, flexShrink: 0, alignSelf: 'center',
          display: 'flex', gap: isMobile ? 8 : 16,
          ...(!isMobile ? { justifyContent: 'center', padding: '6px 0 2px' }
            : n <= 3 ? { width: '100%', padding: '6px 0' }
            // A fourth card: the row scrolls, edge to edge, with room left for the picked card's glow.
            : { alignSelf: 'stretch', margin: '-6px -12px', padding: 12, overflowX: 'auto', scrollSnapType: 'x proximity', scrollbarWidth: 'none' }),
        }}
      >
        {decks.map((o, i) => (
          <DeckCard
            key={i}
            offer={o}
            numeral={NUMERALS[i] ?? String(i + 1)}
            best={i === 0}
            chosen={i === index}
            w={cardW}
            compact={isMobile}
            enter={calm ? undefined : i * 0.06}
            onTap={() => setIndex(i)}
          />
        ))}
      </div>

      {chosen && (
        <DeckSheet
          key={`${index}-${chosen.id}`}
          offer={chosen}
          compact={isMobile}
          calm={calm}
          onCustomize={() => setWorkshop({ from: chosen })}
        />
      )}

      <AnimatePresence>
        {workshop && (
          <DeckWorkshop
            heroes={heroes}
            from={workshop.from}
            // Saving a ready deck's copy takes the place of a deck already saved.
            replaces={!isYours(workshop.from) && decks.some((o) => o.id === 'own')}
            compact={isMobile}
            onCancel={() => setWorkshop(null)}
            onSave={keep}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** One offered deck as a lobby card: its numeral, the heroes it was made for
 *  across its face, the band of its items by slot, its name on the cream
 *  plate. Picked, it wears the gold frame and its full colour. */
function DeckCard({ offer, numeral, best, chosen, w, compact, enter, onTap }: {
  offer: DeckOffer;
  numeral: string;
  best: boolean;
  chosen: boolean;
  w: string;
  compact: boolean;
  /** The delay of its entrance; undefined under calm motion (no entrance). */
  enter: number | undefined;
  onTap: () => void;
}) {
  const colour = chosen ? poster.gold : poster.creamDim;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (compact && chosen) ref.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [compact, chosen]);
  return (
    <motion.button
      ref={ref}
      type="button"
      aria-pressed={chosen}
      aria-label={`${offer.name}: ${offer.why}`}
      data-deck-offer={offer.id}
      onClick={onTap}
      initial={enter === undefined ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={enter === undefined ? { duration: 0 } : { ...spring.soft, delay: enter }}
      // A pointer's lift only: on a touch screen a hover sticks to the last tap.
      whileHover={enter === undefined || compact ? undefined : { y: -3, transition: spring.snappy }}
      whileTap={enter === undefined ? undefined : { scale: 0.98, transition: spring.snappy }}
      style={{
        width: w, flexShrink: 0, display: 'block', padding: 0, border: 'none', background: 'none',
        font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', scrollSnapAlign: 'center',
        // The frame is clipped to its chamfer, so the glow is a drop shadow of the shape.
        filter: chosen ? 'drop-shadow(0 0 10px rgba(217, 182, 74, 0.55))' : 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))',
        transition: 'filter 180ms ease',
      }}
    >
      <span style={{
        position: 'relative', display: 'block', aspectRatio: compact ? '4 / 5' : '5 / 7', overflow: 'hidden',
        border: `2.5px solid ${chosen ? poster.gold : poster.frameLit}`, background: poster.panel,
        transition: 'border-color 180ms ease',
        ...clipBoth(chamfer(6)),
      }}>
        <DeckFace offer={offer} lit={chosen} compact={compact} />
        <span style={{
          position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 6, padding: compact ? '5px 6px 12px' : '6px 8px 14px',
          background: 'linear-gradient(to bottom, rgba(12, 15, 17, 0.88), transparent)',
        }}>
          <span style={{ fontFamily: fonts.display, fontSize: compact ? 13 : 15, color: colour, letterSpacing: '0.1em', flexShrink: 0, transition: 'color 180ms ease' }}>
            {numeral}
          </span>
          {best && (
            <span style={{ ...text.label, fontSize: compact ? 8.5 : 10, letterSpacing: compact ? '0.12em' : '0.2em', color: poster.gold, whiteSpace: 'nowrap' }}>
              Best fit
            </span>
          )}
        </span>
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'block' }}>
          <SlotBand items={offer.items} height={compact ? 5 : 6} />
          <span style={{
            display: 'block', padding: compact ? '6px 4px 7px' : '7px 8px 8px',
            background: chosen ? poster.cream : '#bdb6a6', color: poster.ink, textAlign: 'center',
            fontFamily: fonts.display, fontSize: compact ? 11 : 'clamp(12px, 1.1vw, 16px)',
            letterSpacing: compact ? '0.04em' : '0.06em', textTransform: 'uppercase', lineHeight: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            transition: 'background-color 180ms ease',
          }}>
            {offer.name}
          </span>
        </span>
      </span>
    </motion.button>
  );
}

/** The slant of the cut between two heroes on a card's face, in px. */
const CUT = 16;

/** A deck card's face. A ready deck prints the drafted heroes it was made
 *  for, side by side on slanted cuts (one hero takes the whole face). Your
 *  deck, and a ready deck made for none of them, prints what it holds: its 16
 *  items as their shop tiles, cheapest tier first. A card not picked is
 *  printed a step darker. */
function DeckFace({ offer, lit, compact }: { offer: DeckOffer; lit: boolean; compact: boolean }) {
  const made = isYours(offer) ? [] : offer.madeFor;
  const n = made.length;
  const tone = { filter: lit ? 'none' : 'saturate(0.6) brightness(0.58)', transition: 'filter 180ms ease' };
  if (n === 0) {
    const lean = deckLean(offer.items);
    const ink = shopInk(SLOTS.reduce((a, b) => (lean[b] > lean[a] ? b : a)));
    const tiles = countItems(offer.items).flatMap(([id, k]) => Array.from({ length: k }, () => id));
    return (
      <span aria-hidden style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Clear of the numeral above and of the band and name plate below.
        padding: compact ? '17px 0 30px' : '26px 0 38px',
        background: `radial-gradient(ellipse 100% 70% at 50% 40%, ${ink.wash}, transparent 75%), linear-gradient(180deg, ${poster.panel}, #0f1214)`,
        ...tone,
      }}>
        <span style={{ width: compact ? '76%' : '82%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: compact ? 3 : 5 }}>
          {tiles.map((id, i) => {
            const slot = itemCard(id)?.slot;
            return (
              <span key={i} style={{
                display: 'block', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: '18%',
                background: slot ? shopInk(slot).ink : poster.frameLit,
              }}>
                <img src={itemArtUrl(id)} alt="" draggable={false} loading="lazy" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none' }} />
              </span>
            );
          })}
        </span>
      </span>
    );
  }
  if (n === 1) {
    const art = heroPortraitArt(made[0]);
    return (
      <img
        src={art.src}
        onError={(e) => {
          const img = e.currentTarget;
          if (art.fallback && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = art.fallback; }
        }}
        alt=""
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: art.objectPosition, userSelect: 'none', ...tone }}
      />
    );
  }
  return (
    <span aria-hidden style={{ position: 'absolute', inset: 0, background: poster.ground, ...tone }}>
      {made.map((h, i) => {
        const first = i === 0;
        const last = i === n - 1;
        // Each cut leans the same way: its top to the right of its foot. A
        // slice is widened by the lean on its inner sides, and a hairline of
        // the ground is left between two.
        const clip = `polygon(${first ? '0' : `${CUT + 1}px`} 0, ${last ? '100%' : 'calc(100% - 1px)'} 0, ${last ? '100%' : `calc(100% - ${CUT + 1}px)`} 100%, ${first ? '0' : '1px'} 100%)`;
        return (
          <span key={h} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: first ? 0 : `calc(${(i / n) * 100}% - ${CUT / 2}px)`,
            width: `calc(${100 / n}% + ${first || last ? CUT / 2 : CUT}px)`,
            ...clipBoth(clip),
          }}>
            <img
              src={`${HERO_IMG_BASE}${h}_card.webp`}
              alt=""
              draggable={false}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: heroArtFocus(h, 'card', '50% 14%'), userSelect: 'none' }}
            />
          </span>
        );
      })}
    </span>
  );
}

/** The picked deck's sheet, in the dossier's place: its name, why it is
 *  offered, its items by slot, its line, and its items as their shop tiles,
 *  counted, cheapest tier first. */
function DeckSheet({ offer, compact, calm, onCustomize }: { offer: DeckOffer; compact: boolean; calm: boolean; onCustomize: () => void }) {
  const counted = countItems(offer.items);
  const lean = deckLean(offer.items);
  return (
    <motion.section
      aria-label={`${offer.name}: ${offer.items.length} items`}
      initial={calm ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: calm ? 0 : 0.2 }}
      style={{
        position: 'relative', zIndex: 1, flexShrink: 0, alignSelf: 'center', width: '100%', maxWidth: 980,
        display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10,
        padding: compact ? '10px 12px 12px' : '14px 18px 16px',
        background: 'rgba(21, 25, 28, 0.84)',
        border: `1px solid ${poster.edge}`, borderLeft: `3px solid ${poster.gold}`,
        ...clipBoth(chamfer(6)),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: compact ? '6px 10px' : '8px 16px' }}>
        <h2 style={{
          margin: 0, fontFamily: fonts.display, fontWeight: 400, fontSize: compact ? 18 : 24,
          letterSpacing: '0.04em', textTransform: 'uppercase', color: poster.cream, lineHeight: 1,
        }}>{offer.name}</h2>
        {/* On a phone the slots sit beside the name and the why under them. */}
        <span style={{ order: compact ? 2 : 0, padding: '3px 8px', background: poster.gold, color: poster.ink, ...text.label, fontSize: compact ? 9.5 : 10, letterSpacing: compact ? '0.12em' : '0.18em' }}>
          {offer.why}
        </span>
        <span
          role="img"
          aria-label={SLOTS.map((k) => `${Math.round(lean[k] * offer.items.length)} ${SLOT_WORD[k]}`).join(' · ')}
          style={{ ...text.label, order: 1, display: 'flex', gap: compact ? 10 : 14, marginLeft: 'auto', fontSize: 10, letterSpacing: '0.12em', color: poster.creamDim, whiteSpace: 'nowrap' }}
        >
          {SLOTS.map((k) => {
            const count = Math.round(lean[k] * offer.items.length);
            return count > 0 && (
              <span key={k} aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: shopInk(k).ink }} />
                {count} {SLOT_WORD[k]}
              </span>
            );
          })}
        </span>
        {/* Any deck is yours to change: the builder opens on a copy of it. */}
        <span style={{ order: 3, marginLeft: compact ? 'auto' : 0 }}>
          <PosterButton variant="ghost" size="sm" onClick={onCustomize} ariaLabel={`Customize ${offer.name}`} style={{ padding: compact ? '7px 12px' : '8px 14px', letterSpacing: '0.16em', fontSize: compact ? 11.5 : 12.5 }}>
            Customize
          </PosterButton>
        </span>
      </div>

      <p style={{ ...text.body, margin: 0, maxWidth: '78ch', fontSize: compact ? 12.5 : 13.5, lineHeight: 1.4, color: poster.creamDim }}>
        {offer.blurb}
      </p>

      <ul style={{
        listStyle: 'none', margin: 0, padding: `${compact ? 10 : 12}px 0 0`, borderTop: `1px solid ${poster.edge}`,
        display: 'grid', gap: compact ? '7px 12px' : '10px 20px',
        gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(auto-fill, minmax(190px, 1fr))',
      }}>
        {counted.map(([id, k]) => (
          <li key={id} style={{ display: 'flex', alignItems: 'center', gap: compact ? 7 : 9, minWidth: 0 }}>
            <ItemIcon itemId={id} size={compact ? 26 : 32} />
            <span style={{ minWidth: 0, fontSize: compact ? 12 : 13.5, lineHeight: 1.15, color: poster.cream }}>{cardName(id)}</span>
            {k > 1 && (
              <span style={{ flexShrink: 0, fontWeight: 800, fontSize: compact ? 12 : 13.5, lineHeight: 1, color: poster.gold }}>×{k}</span>
            )}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

/** The deck builder, over the draft: the Loadout's own (DeckEditor) on a copy
 *  of the deck `from`. Nothing changes until "Save deck": then the copy is
 *  the player's deck. A deck short of its 16 items cannot be saved. */
function DeckWorkshop({ heroes, from, replaces, compact, onCancel, onSave }: {
  heroes: CardId[];
  from: DeckOffer;
  /** True when saving takes the place of a deck the player already saved. */
  replaces: boolean;
  compact: boolean;
  onCancel: () => void;
  onSave: (items: CardId[]) => void;
}) {
  const [items, setItems] = useState<CardId[]>(() => [...from.items]);
  const legal = isLegalDeck(items);
  // Escape leaves it (the builder's own Escape, closing a tooltip or a card, comes first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const started = isYours(from) ? null : `Started from ${from.name}.`;
  return (
    <motion.div
      role="dialog"
      aria-label="Customize your deck"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ position: 'fixed', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column', background: poster.ground, color: poster.cream }}
    >
      <header style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: compact ? '6px 8px' : '6px 14px',
        padding: compact ? '12px 12px 10px' : '16px clamp(18px, 3vw, 44px) 14px', borderBottom: `1px solid ${poster.edge}`,
      }}>
        <h2 style={{
          margin: 0, flex: 1, minWidth: 0, fontFamily: fonts.display, fontWeight: 400, fontSize: compact ? 18 : 24,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: poster.cream, lineHeight: 1,
        }}>{YOUR_DECK}</h2>
        <PosterButton variant="ghost" size="sm" onClick={onCancel} ariaLabel="Leave the deck as it was" style={compact ? { padding: '9px 12px', letterSpacing: '0.14em' } : undefined}>Cancel</PosterButton>
        <PosterButton variant={legal ? 'paper' : 'ghost'} size="sm" disabled={!legal} onClick={() => onSave(items)} ariaLabel="Save it as your deck" style={compact ? { padding: '9px 12px', letterSpacing: '0.14em' } : undefined}>Save deck</PosterButton>
        {/* What saving does, on a line of its own under the name and the buttons. */}
        <p style={{ ...text.body, flexBasis: '100%', margin: 0, fontSize: compact ? 12 : 13, lineHeight: 1.3, color: poster.creamDim }}>
          {started ? `${started} ` : ''}{replaces ? 'Saving replaces the deck in your Loadout.' : 'Saving keeps it as your deck.'}
        </p>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: compact ? '12px 12px 20px' : '18px clamp(18px, 3vw, 44px) 28px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <DeckEditor squad={heroes} value={items} onEdit={setItems} />
        </div>
      </div>
    </motion.div>
  );
}

/** A deck's items by shop slot: one band in the slots' own inks, each part
 *  as wide as its share. */
function SlotBand({ items, height }: { items: readonly CardId[]; height: number }) {
  const lean = deckLean(items);
  return (
    <span aria-hidden style={{ display: 'flex', height, background: poster.ink, borderTop: `1px solid ${poster.ink}` }}>
      {SLOTS.map((k) => lean[k] > 0 && <span key={k} style={{ width: `${lean[k] * 100}%`, background: shopInk(k).ink }} />)}
    </span>
  );
}

/** A deck's items with their counts, cheapest tier first (in the order they
 *  first appear within a tier). */
function countItems(items: readonly CardId[]): [CardId, number][] {
  const out = new Map<CardId, number>();
  for (const id of items) out.set(id, (out.get(id) ?? 0) + 1);
  return [...out.entries()].sort((a, b) => (itemCard(a[0])?.tier ?? 0) - (itemCard(b[0])?.tier ?? 0));
}
