/**
 * Loadout — the one screen you set yourself up on: the squad you want the
 * draft to hand you, and what each hero buys in the shop (its build, edited
 * in BuildEditor and read by every match).
 *
 * Printed in the poster idiom — cream sheet on the blurred night scene, flat
 * ink, one red — so the menu reads as the same object as the title screen and
 * the table; the build editor's catalogue is the shop's graphite panel.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HEROES, cardName } from '@/cards';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth } from '../poster';
import { PosterBackdrop } from '../PosterBackdrop';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';
import { loadPlayerData, savePreferredHeroes, MAX_PREFERRED_HEROES } from '@/storage/playerData';
import type { CardId } from '@/engine/types';
import { HERO_IMG_BASE } from '@/art/assets';
import { BuildEditor } from './BuildEditor';

interface Props {
  onBack: () => void;
}

export function LoadoutScreen({ onBack }: Props) {
  const { isMobile, width } = useViewport();
  // Two columns only where both halves keep a workable width; below that the
  // hero grid squeezes to three-across.
  const split = width >= 1080;

  const [data, setData] = useState(() => loadPlayerData());
  const slots = padSlots(data.preferredHeroes);
  // The squad's heroes in pick order — the build editor lists them first
  // (one list per squad, so the editor's hero row is not rebuilt each render).
  const squadKey = slots.filter((s): s is CardId => s !== null).join('|');
  const squad = useMemo<CardId[]>(() => (squadKey ? squadKey.split('|') : []), [squadKey]);

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
        // clip, not hidden: hidden makes a scroll container, and the build
        // editor's strip could no longer stick to the top of the screen.
        overflowX: 'clip',
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
          overflow: 'clip',
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
          <section aria-label="Builds">
            <SectionHead title="Builds" />
            <BuildEditor squad={squad} />
          </section>
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
                src={`${HERO_IMG_BASE}${hero.id}_card.webp`}
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
  const name = heroId ? cardName(heroId) : null;
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
            src={`${HERO_IMG_BASE}${heroId}_card.webp`}
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
