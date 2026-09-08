/**
 * Loadout — the one screen you set yourself up on: the squad you want the
 * draft to hand you, and the deck you take in with them. They used to be two
 * separate menu entries, which meant two trips to answer one question ("am I
 * ready to play?"); merged, the answer is on a single sheet.
 *
 * Printed in the poster idiom — cream sheet on the blurred night scene, flat
 * ink, one red — so the menu reads as the same object as the title screen and
 * the table. Deck contents still open in their own editor: that's a different
 * job (fifteen cards), not a different answer.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { HEROES, CARDS_BY_ID } from '@/cards';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth } from '../poster';
import { PosterBackdrop } from '../PosterBackdrop';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';
import {
  loadPlayerData, savePreferredHeroes, setSelectedDeckIndex, deleteDeck,
  MAX_PREFERRED_HEROES, MAX_DECKS, DECK_SIZE,
} from '@/storage/playerData';
import type { DeckSlot } from '@/storage/playerData';
import type { CardId } from '@/engine/types';

const HERO_IMG = `${import.meta.env.BASE_URL ?? '/'}heroes/`;

interface Props {
  onBack: () => void;
  onEditDeck: (slotIndex: number) => void;
}

export function LoadoutScreen({ onBack, onEditDeck }: Props) {
  const { isMobile, width } = useViewport();
  // Two columns only where both halves keep a workable width; below that the
  // hero grid squeezes to three-across and the deck rows lose their numbers.
  const split = width >= 1080;

  const [data, setData] = useState(() => loadPlayerData());
  const slots = padSlots(data.preferredHeroes);

  function writeSlots(next: (CardId | null)[]) {
    savePreferredHeroes(next);
    setData(loadPlayerData());
  }

  function addHero(heroId: CardId) {
    const empty = slots.findIndex((s) => s === null);
    if (empty < 0) return;
    const next = [...slots];
    next[empty] = heroId;
    writeSlots(next);
  }

  function clearSlot(i: number) {
    const next = [...slots];
    next[i] = null;
    writeSlots(next);
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: isMobile ? 10 : 'clamp(14px, 3vh, 30px) clamp(14px, 3vw, 40px)',
        background: poster.ground,
        color: poster.ink,
        fontFamily: fonts.ui,
        overflowX: 'hidden',
      }}
    >
      <PosterBackdrop />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        aria-label="Loadout"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 1380,
          borderRadius: isMobile ? 18 : 28,
          overflow: 'hidden',
          padding: isMobile ? '14px 14px 20px' : 'clamp(18px, 2.4vh, 28px) clamp(22px, 3vw, 38px) clamp(24px, 3vh, 34px)',
          ...sheetStyle,
        }}
      >
        {/* Header — back, title, and nothing else. */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            paddingBottom: isMobile ? 12 : 16,
            marginBottom: isMobile ? 14 : 20,
            borderBottom: `1.5px solid ${poster.ink}`,
            paddingRight: 44, // clear of the fixed system gear
          }}
        >
          <PosterButton variant="paper" size="sm" onClick={onBack} ariaLabel="Back to the title screen">
            ← Back
          </PosterButton>
          <h1
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: isMobile ? 26 : 'clamp(28px, 3vw, 40px)',
              fontWeight: 400,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Loadout
          </h1>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: split ? 'minmax(0, 1.15fr) minmax(0, 1fr)' : '1fr',
            gap: split ? 'clamp(24px, 3vw, 44px)' : 26,
            alignItems: 'start',
          }}
        >
          <Squad
            slots={slots}
            onAdd={addHero}
            onClear={clearSlot}
            compact={isMobile}
            split={split}
          />
          <Decks
            decks={data.decks}
            selected={data.selectedDeckIndex}
            compact={isMobile}
            onSelect={(i) => { setSelectedDeckIndex(i); setData(loadPlayerData()); }}
            onDelete={(i) => { deleteDeck(i); setData(loadPlayerData()); }}
            onEdit={onEditDeck}
          />
        </div>
      </motion.section>
    </div>
  );
}

function padSlots(saved: (CardId | null)[]): (CardId | null)[] {
  const out = saved.slice(0, MAX_PREFERRED_HEROES);
  while (out.length < MAX_PREFERRED_HEROES) out.push(null);
  return out;
}

/* ------------------------------------------------------------------ */
/* Shared section chrome                                               */
/* ------------------------------------------------------------------ */

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: fonts.display,
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        {title}
      </h2>
      {note && (
        <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.18em', color: poster.inkDim }}>
          {note}
        </span>
      )}
      <span aria-hidden style={{ flex: 1, height: 1, background: poster.inkRule }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Squad — the draft's priority picks                                  */
/* ------------------------------------------------------------------ */

function Squad({ slots, onAdd, onClear, compact, split }: {
  slots: (CardId | null)[];
  onAdd: (id: CardId) => void;
  onClear: (i: number) => void;
  compact: boolean;
  split: boolean;
}) {
  const taken = new Set(slots.filter(Boolean) as CardId[]);
  const roster = [...HEROES].sort((a, b) => a.name.localeCompare(b.name));
  const full = slots.every(Boolean);

  return (
    <section>
      <SectionHead title="Squad" note="Drafted first, in order" />

      {/* Capped when this column is the whole sheet: four 3:4 slots across a
          full-width tablet sheet stand ~390px tall and bury the deck below
          the fold. The cap keeps them about twice a roster tile at any width. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: compact ? 8 : 12,
        maxWidth: split ? undefined : 560,
        marginBottom: 20,
      }}>
        {slots.map((heroId, i) => (
          <PickSlot key={i} index={i} heroId={heroId} onClear={() => onClear(i)} />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 74 : 86}px, 1fr))`,
          gap: compact ? 7 : 9,
        }}
      >
        {roster.map((hero) => {
          const picked = taken.has(hero.id);
          const order = slots.indexOf(hero.id) + 1;
          // A full squad closes the roster: the tile can't add anything, so it
          // shouldn't keep offering to.
          const closed = picked || full;
          return (
            <motion.button
              key={hero.id}
              type="button"
              onClick={() => !closed && onAdd(hero.id)}
              disabled={closed}
              aria-label={
                picked ? `${hero.name}, pick ${order}`
                : full ? `${hero.name} — squad full, clear a pick first`
                : `Add ${hero.name} to the squad`
              }
              whileHover={!closed ? { y: -3 } : undefined}
              whileTap={!closed ? { scale: 0.97 } : undefined}
              transition={spring.snappy}
              style={{
                position: 'relative',
                padding: 3,
                border: 'none',
                background: picked ? poster.ink : poster.frame,
                ...clipBoth(chamfer(7)),
                aspectRatio: '3 / 4',
                cursor: closed ? 'default' : 'pointer',
                // Picked heroes are greyed by the image filter below; the rest
                // of the roster just fades back while the squad is full.
                opacity: full && !picked ? 0.45 : 1,
                overflow: 'hidden',
              }}
            >
              <img
                src={`${HERO_IMG}${hero.id}_card.webp`}
                alt=""
                draggable={false}
                loading="lazy"
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: '50% 14%',
                  filter: picked ? 'grayscale(1) brightness(0.5)' : 'saturate(0.94) contrast(1.05)',
                  userSelect: 'none',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 3, right: 3, bottom: 3,
                  padding: '3px 4px 4px',
                  background: poster.paperBand,
                  color: poster.ink,
                  fontFamily: fonts.display,
                  fontSize: 9,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {hero.name}
              </span>
              {picked && <OrderStamp n={order} />}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

/** The red pick-order stamp — same numeral the slot above carries. */
function OrderStamp({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 5, right: 5,
        width: 19, height: 19,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: poster.red,
        color: poster.paper,
        borderRadius: '50%',
        fontFamily: fonts.display,
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      {n}
    </span>
  );
}

function PickSlot({ index, heroId, onClear }: {
  index: number;
  heroId: CardId | null;
  onClear: () => void;
}) {
  const name = heroId ? CARDS_BY_ID[heroId]?.name ?? heroId : null;
  return (
    <motion.button
      type="button"
      onClick={heroId ? onClear : undefined}
      disabled={!heroId}
      aria-label={heroId ? `Remove ${name} from pick ${index + 1}` : `Pick ${index + 1}, empty`}
      whileHover={heroId ? { y: -3 } : undefined}
      whileTap={heroId ? { scale: 0.97 } : undefined}
      transition={spring.snappy}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        aspectRatio: '3 / 4',
        padding: heroId ? 4 : 0,
        border: heroId ? 'none' : `1.5px dashed ${poster.inkDim}`,
        background: heroId ? poster.ink : 'transparent',
        ...clipBoth(heroId ? chamfer(9) : undefined),
        cursor: heroId ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      {heroId ? (
        <>
          <img
            src={`${HERO_IMG}${heroId}_card.webp`}
            alt=""
            draggable={false}
            style={{
              display: 'block', width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: '50% 12%',
              filter: 'saturate(0.94) contrast(1.05)', userSelect: 'none',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 4, right: 4, bottom: 4,
              padding: '4px 5px 5px',
              background: poster.paperBand,
              color: poster.ink,
              fontFamily: fonts.display,
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </span>
          <OrderStamp n={index + 1} />
        </>
      ) : (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: fonts.display,
            fontSize: 22,
            color: poster.inkDim,
            lineHeight: 1,
          }}
        >
          {index + 1}
        </span>
      )}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Decks — pick the one you take in                                    */
/* ------------------------------------------------------------------ */

function Decks({ decks, selected, compact, onSelect, onDelete, onEdit }: {
  decks: (DeckSlot | null)[];
  selected: number | null;
  compact: boolean;
  onSelect: (i: number) => void;
  onDelete: (i: number) => void;
  onEdit: (i: number) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);

  return (
    <section>
      <SectionHead title="Deck" note={`${DECK_SIZE} cards`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 7 : 9 }}>
        {Array.from({ length: MAX_DECKS }).map((_, i) => (
          <DeckRow
            key={i}
            index={i}
            deck={decks[i] ?? null}
            active={selected === i}
            confirming={confirming === i}
            compact={compact}
            onSelect={() => onSelect(i)}
            onEdit={() => onEdit(i)}
            onDeleteIntent={() => setConfirming(i)}
            onDeleteConfirm={() => { onDelete(i); setConfirming(null); }}
            onDeleteCancel={() => setConfirming(null)}
          />
        ))}
      </div>
    </section>
  );
}

function DeckRow({
  index, deck, active, confirming, compact,
  onSelect, onEdit, onDeleteIntent, onDeleteConfirm, onDeleteCancel,
}: {
  index: number;
  deck: DeckSlot | null;
  active: boolean;
  confirming: boolean;
  compact: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDeleteIntent: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  if (!deck) {
    return (
      <motion.button
        type="button"
        onClick={onEdit}
        aria-label={`Build a deck in slot ${index + 1}`}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        transition={spring.snappy}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: compact ? '13px 14px' : '15px 16px',
          border: `1.5px dashed ${poster.inkDim}`,
          background: 'transparent',
          color: poster.inkDim,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ ...text.label, fontSize: 11, color: poster.inkDim, fontVariantNumeric: 'tabular-nums' }}>
          {index + 1}
        </span>
        <span style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1 }}>
          New Deck
        </span>
      </motion.button>
    );
  }

  const count = deck.cards.length;
  const valid = count === DECK_SIZE;
  const spells = deck.cards.filter((id) => CARDS_BY_ID[id]?.type === 'spell').length;

  return (
    <motion.div
      layout
      transition={spring.snappy}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 9 : 12,
        padding: compact ? '10px 11px' : '11px 13px',
        // The chosen deck prints as a solid ink bar; the rest are outlines.
        background: active ? poster.ink : 'transparent',
        color: active ? poster.paper : poster.ink,
        border: `1.5px solid ${active ? poster.ink : poster.inkRule}`,
        ...clipBoth(chamfer(9)),
      }}
    >
      {/* Slot numeral / active mark */}
      <span
        aria-hidden
        style={{
          ...text.label,
          fontSize: 11,
          width: 14,
          flexShrink: 0,
          textAlign: 'center',
          color: active ? poster.gold : poster.inkDim,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {active ? '●' : index + 1}
      </span>

      {/* Name + make-up. Clicking the body chooses the deck. */}
      <button
        type="button"
        onClick={valid && !active ? onSelect : undefined}
        disabled={!valid || active}
        aria-label={active ? `${deck.name}, in use` : `Take ${deck.name} into matches`}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'block',
          textAlign: 'left',
          border: 'none',
          background: 'none',
          padding: 0,
          color: 'inherit',
          cursor: valid && !active ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: compact ? 15 : 17,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {deck.name || `Deck ${index + 1}`}
        </div>
        <div
          style={{
            ...text.label,
            fontSize: 9.5,
            letterSpacing: '0.16em',
            marginTop: 3,
            color: active ? poster.creamDim : poster.inkDim,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span style={{ color: valid ? 'inherit' : active ? poster.red : poster.redDeep }}>{count}/{DECK_SIZE}</span>
          {' · '}{spells} spells · {count - spells} items
        </div>
      </button>

      {/* Actions */}
      {confirming ? (
        <>
          <RowAction label="Delete" tone="red" onClick={onDeleteConfirm} />
          <RowAction label="Keep" tone={active ? 'cream' : 'ink'} onClick={onDeleteCancel} />
        </>
      ) : (
        <>
          <RowAction label="Edit" tone={active ? 'cream' : 'ink'} onClick={onEdit} />
          <RowAction label="×" tone={active ? 'cream' : 'ink'} onClick={onDeleteIntent} ariaLabel={`Delete ${deck.name}`} />
        </>
      )}
    </motion.div>
  );
}

function RowAction({ label, tone, onClick, ariaLabel }: {
  label: string;
  tone: 'ink' | 'cream' | 'red';
  onClick: () => void;
  ariaLabel?: string;
}) {
  const color = tone === 'red' ? poster.red : tone === 'cream' ? poster.cream : poster.ink;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={spring.snappy}
      style={{
        flexShrink: 0,
        padding: label === '×' ? '5px 9px' : '5px 11px',
        border: `1.5px solid ${tone === 'red' ? poster.red : color}`,
        background: 'transparent',
        color,
        opacity: tone === 'cream' ? 0.8 : 1,
        ...clipBoth(chamfer(5)),
        fontFamily: fonts.display,
        fontSize: 10.5,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        lineHeight: 1.2,
        cursor: 'pointer',
      }}
    >
      {label}
    </motion.button>
  );
}
