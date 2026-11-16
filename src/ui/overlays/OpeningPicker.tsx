/**
 * The match's opening: choose your first Active from your three drafted
 * heroes (docs/deck-plan.md, "Start of the match"). You drafted them a moment
 * ago and know what they do, so the sheet is their faces alone (Patrick,
 * 2026-11-16: "too much text"): the draft's own team cards, the hero's
 * splash edge to edge and a name plate at the foot, three across. A tap
 * picks one (it lifts in your patron's gold), one button confirms: "Start
 * with Warden". The arrow keys move the pick and Enter confirms. The sheet
 * blocks the board until the button is pressed (no backdrop dismiss; the
 * rival's own choice stays unseen until then). Under reduced motion the
 * lift snaps instead of animating.
 *
 * `onPick` is handed the chosen card's box on screen, so the board can fly
 * the hero from it to the lane once the sheet has gone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { cardName } from '@/cards';
import { heroPortraitArt } from '@/cards/art/heroArt';
import { useCalmMotion } from '../effects/fx/FxMotionContext';
import type { Rect } from '../effects/fx/geometry';
import { useViewport } from '../hooks/useViewport';
import { fonts, spring } from '../tokens';
import { poster, scrimStyle, chamfer, clipBoth } from '../poster';
import { PosterButton } from '../chrome';

interface Props {
  /** The heroes to choose among, in deck order: the drafted three, less any
   *  that cannot stand in the lane. */
  candidates: CardInstance[];
  onPick: (heroIid: string, from: Rect | null) => void;
}

/** A card's widest, on a tablet or desktop. */
const MAX_CARD_W = 210;
/** The space between the cards. */
const GAP = 12;

export function OpeningPicker({ candidates, onPick }: Props) {
  const { isMobile, width: vw } = useViewport();
  const calm = useCalmMotion();
  const n = candidates.length;
  const [index, setIndex] = useState(0);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const next = useCallback(() => setIndex((i) => (i + 1) % Math.max(1, n)), [n]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + n) % Math.max(1, n)), [n]);
  const chosen = candidates[index];
  const name = chosen ? cardName(chosen.cardId) : '';

  const confirm = useCallback(() => {
    if (!chosen) return;
    const b = cards.current.get(chosen.iid)?.getBoundingClientRect();
    onPick(chosen.iid, b ? { left: b.left, top: b.top, width: b.width, height: b.height } : null);
  }, [chosen, onPick]);

  // The keyboard: the arrows move the pick, Enter confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, confirm]);

  // Three across within the screen's width (a 375px phone gets cards about
  // 110px wide), the room for the chosen one's lift kept at the sides.
  const pad = isMobile ? 16 : 32;
  const cardW = Math.max(84, Math.min(MAX_CARD_W, Math.floor((vw - 2 * pad - (n - 1) * GAP - 16) / Math.max(1, n))));
  const transition = calm ? { duration: 0 } : spring.snappy;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ ...scrimStyle, zIndex: 100, padding: pad, overflowY: 'auto' }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={calm ? { duration: 0 } : spring.snappy}
        role="dialog"
        aria-label="Choose your Active"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 18 : 24 }}
      >
        <div style={{
          fontFamily: fonts.display, fontSize: isMobile ? 18 : 22, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: poster.cream, textShadow: '0 2px 10px rgba(0, 0, 0, 0.6)',
        }}>
          Choose your Active
        </div>

        <div style={{ display: 'flex', gap: GAP, alignItems: 'flex-end', paddingTop: 10 }}>
          {candidates.map((c, i) => (
            <PickCard
              key={c.iid}
              card={c}
              width={cardW}
              chosen={i === index}
              transition={transition}
              onTap={() => setIndex(i)}
              cardRef={(el) => { if (el) cards.current.set(c.iid, el); else cards.current.delete(c.iid); }}
            />
          ))}
        </div>

        <PosterButton variant="paper" onClick={confirm} ariaLabel={`Start with ${name}`}>
          Start with {name}
        </PosterButton>
      </motion.div>
    </motion.div>
  );
}

// The cards' light, one filter each so the pick animates between them: the
// chosen card full bright with a gold glow (a drop-shadow, which follows the
// chamfered frame where a box-shadow would be clipped by it), the others
// darker on a plain shadow.
const LIT = 'brightness(1) saturate(1) drop-shadow(0px 0px 16px rgba(217, 182, 74, 0.7))';
const DIM = 'brightness(0.62) saturate(0.8) drop-shadow(0px 6px 10px rgba(0, 0, 0, 0.4))';
const HOVER = 'brightness(0.85) saturate(0.95) drop-shadow(0px 6px 10px rgba(0, 0, 0, 0.4))';

/** One of the three: the draft's team card — the hero's splash edge to edge
 *  in a chamfered frame and a cream name plate at the foot. The chosen one
 *  lifts in gold; the others sit a little darker until tapped. */
function PickCard({ card, width, chosen, transition, onTap, cardRef }: {
  card: CardInstance;
  width: number;
  chosen: boolean;
  transition: object;
  onTap: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const name = cardName(card.cardId);
  const art = heroPortraitArt(card.cardId);
  return (
    <motion.div
      ref={cardRef}
      data-opening-card={card.iid}
      role="button"
      tabIndex={-1}
      aria-label={name}
      aria-pressed={chosen}
      onClick={onTap}
      initial={false}
      animate={{
        y: chosen ? -10 : 0,
        scale: chosen ? 1.04 : 1,
        filter: chosen ? LIT : DIM,
      }}
      whileHover={chosen ? undefined : { filter: HOVER }}
      transition={transition}
      style={{
        position: 'relative', width, aspectRatio: '5 / 7', flexShrink: 0,
        cursor: chosen ? 'default' : 'pointer',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        border: `2.5px solid ${chosen ? poster.you : poster.edge}`,
        background: poster.panel,
        ...clipBoth(chamfer(6)),
        overflow: 'hidden',
      }}>
        <img
          src={art.src}
          onError={(e) => {
            const img = e.currentTarget;
            if (art.fallback && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = art.fallback; }
          }}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: art.objectPosition,
          }}
        />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: width < 120 ? '6px 4px 7px' : '8px 8px 9px',
          background: poster.cream, color: poster.ink, textAlign: 'center',
          fontFamily: fonts.display, fontSize: width < 120 ? 11 : 15,
          letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {name}
        </div>
      </div>
    </motion.div>
  );
}
