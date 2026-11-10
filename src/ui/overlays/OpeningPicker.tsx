/**
 * The match's opening: choose your first Active from your four drafted
 * heroes (docs/deck-plan.md, "Start of the match"). A carousel, so it fits a
 * phone: the hero in the middle is its real card, large (stats, skill and
 * ultimate, the face the hero wears everywhere), its neighbours peek in at
 * the sides as art alone — a dimmed portrait tile, about half its size — and
 * the heroes rotate round — a swipe left or right, the arrows, the
 * keyboard's arrows, or a tap on a neighbour. One button
 * confirms: "Start with Warden". The sheet blocks the board until it is
 * pressed (no backdrop dismiss; the rival's own choice stays unseen until
 * then). Under reduced motion the rotation snaps instead of animating.
 *
 * `onPick` is handed the middle card's box on screen, so the board can fly
 * the hero from it to the lane once the sheet has gone.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { CardFrame, SIZES } from '../card/CardFrame';
import { useCalmMotion } from '../effects/fx/FxMotionContext';
import type { Rect } from '../effects/fx/geometry';
import { useViewport } from '../hooks/useViewport';
import { fonts, spring } from '../tokens';
import { poster, sheetStyle, scrimStyle, printEdge } from '../poster';
import { PatronSigil, bandStyle, scale as type } from '../hud';
import { PosterButton } from '../chrome';

interface Props {
  /** The heroes to choose among, in deck order: the drafted four, less any
   *  that cannot stand in the lane. */
  candidates: CardInstance[];
  onPick: (heroIid: string, from: Rect | null) => void;
}

/** A swipe shorter than this is a tap. */
const SWIPE_PX = 36;
/** The card's natural size (CardFrame 'full'); the stage scales it. */
const CARD = SIZES.full;

/** Where candidate `i` sits relative to the one in the middle: 0 the middle,
 *  -1 the left neighbour, 1 the right, else behind (hidden). */
function placeOf(i: number, index: number, n: number): number {
  const rel = (((i - index) % n) + n) % n;
  return rel > n / 2 ? rel - n : rel;
}

export function OpeningPicker({ candidates, onPick }: Props) {
  const { isMobile, width: vw } = useViewport();
  const calm = useCalmMotion();
  const n = candidates.length;
  const [index, setIndex] = useState(0);
  const centre = useRef<HTMLDivElement | null>(null);
  const next = useCallback(() => setIndex((i) => (i + 1) % Math.max(1, n)), [n]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + n) % Math.max(1, n)), [n]);
  const chosen = candidates[index];
  const name = chosen ? (CARDS_BY_ID[chosen.cardId]?.name ?? chosen.cardId) : '';

  const confirm = useCallback(() => {
    if (!chosen) return;
    const el = centre.current;
    const b = el?.getBoundingClientRect();
    onPick(chosen.iid, b ? { left: b.left, top: b.top, width: b.width, height: b.height } : null);
  }, [chosen, onPick]);

  // The keyboard: the arrows rotate, Enter confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, confirm]);

  // A swipe across the stage rotates; the tap that ends one is swallowed.
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const swallow = useRef(false);
  const onPointerDown = (e: ReactPointerEvent) => { swipe.current = { x: e.clientX, id: e.pointerId }; swallow.current = false; };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < SWIPE_PX) return;
    swallow.current = true;
    if (dx < 0) next(); else prev();
  };
  const tapCard = (i: number) => {
    if (swallow.current) { swallow.current = false; return; }
    const d = placeOf(i, index, n);
    if (d === 1) next();
    else if (d === -1) prev();
  };

  // The stage: the middle card at `scale`, the neighbours' tiles a little
  // over half its size, tucked behind its edges with most of their art out,
  // within what the screen allows (a 375px phone shows the middle card whole
  // and the stage clips the tiles' outer edges).
  // The middle card is shown at its own size, so its smallest print stays at
  // the type scale's floor (a scaled-down card read at about 8px); the
  // neighbours only peek in at the stage's edges.
  const scale = Math.min(1, (vw - 40) / CARD.w);
  const side = scale * 0.55;
  const peek = CARD.w * side * 0.7;
  const step = CARD.w * scale / 2 + peek - CARD.w * side / 2;
  const stageW = Math.min(vw - 24, CARD.w * scale + 2 * peek + 16);
  const stageH = CARD.h * scale + 16;
  const transition = calm ? { duration: 0 } : spring.default;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ ...scrimStyle, zIndex: 100, padding: isMobile ? 12 : 32, overflowY: 'auto' }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={calm ? { duration: 0 } : spring.snappy}
        role="dialog"
        aria-label="Choose your Active"
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 12,
          padding: isMobile ? '0 0 16px' : '0 0 22px',
          borderRadius: 12,
          overflow: 'hidden',
          width: isMobile ? 'min(100%, 420px)' : 'min(100%, 640px)',
          boxSizing: 'border-box',
          color: poster.ink,
        }}
      >
        {/* The header band, in your patron's amber. */}
        <div style={{
          ...bandStyle(poster.you),
          alignSelf: 'stretch',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '11px 16px 10px',
          fontSize: type.title,
        }}>
          <PatronSigil side="you" size={18} color={poster.ink} />
          Choose your Active
        </div>

        {/* The stage. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <div
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { swipe.current = null; }}
            style={{
              position: 'relative', width: stageW, height: stageH, flex: '0 1 auto',
              overflow: 'hidden', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none',
            }}
          >
            {candidates.map((c, i) => {
              const d = placeOf(i, index, n);
              const shown = Math.abs(d) <= 1;
              const s = d === 0 ? scale : side;
              return (
                <motion.div
                  key={c.iid}
                  ref={d === 0 ? centre : undefined}
                  data-opening-card={c.iid}
                  role="button"
                  aria-label={`${CARDS_BY_ID[c.cardId]?.name ?? c.cardId}${d === 0 ? ', in the middle' : ''}`}
                  aria-pressed={d === 0}
                  onClick={() => tapCard(i)}
                  initial={false}
                  animate={{
                    x: d * step,
                    scale: s,
                    opacity: shown ? (d === 0 ? 1 : 0.62) : 0,
                    filter: d === 0 ? 'none' : 'saturate(0.6) brightness(0.72)',
                  }}
                  transition={transition}
                  style={{
                    position: 'absolute',
                    left: '50%', top: '50%',
                    width: CARD.w, height: CARD.h,
                    marginLeft: -CARD.w / 2, marginTop: -CARD.h / 2,
                    transformOrigin: 'center center',
                    zIndex: d === 0 ? 3 : shown ? 2 : 1,
                    pointerEvents: shown ? 'auto' : 'none',
                    cursor: d === 0 ? 'default' : 'pointer',
                    borderRadius: 14,
                    boxShadow: d === 0 ? '0 18px 36px rgba(0, 0, 0, 0.45)' : '0 8px 18px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  {d === 0
                    ? <CardFrame cardId={c.cardId} size="full" physical={false} tapExplains={false} selected glow="accent" />
                    : <PortraitTile cardId={c.cardId} />}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* The arrows, either side of which of the four is in the middle. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Arrow dir="left" onTap={prev} compact />
          <div aria-hidden style={{ display: 'flex', gap: 7 }}>
            {candidates.map((c, i) => (
              <span key={c.iid} style={{
                width: 8, height: 8, transform: 'rotate(45deg)',
                background: i === index ? poster.ink : 'transparent',
                border: `1.5px solid ${poster.ink}`,
                opacity: i === index ? 1 : 0.45,
              }} />
            ))}
          </div>
          <Arrow dir="right" onTap={next} compact />
        </div>

        <PosterButton variant="ink" onClick={confirm} ariaLabel={`Start with ${name}`}>
          Start with {name}
        </PosterButton>
      </motion.div>
    </motion.div>
  );
}

/** The ‹ › arrows at the stage's sides. */
function Arrow({ dir, onTap, compact }: { dir: 'left' | 'right'; onTap: () => void; compact: boolean }) {
  const size = compact ? 34 : 42;
  return (
    <motion.button
      type="button"
      aria-label={dir === 'left' ? 'Previous hero' : 'Next hero'}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      onClick={onTap}
      style={{
        flex: '0 0 auto',
        width: size, height: size, borderRadius: '50%',
        background: poster.ink, color: poster.paper,
        border: `2px solid ${poster.ink}`,
        fontFamily: fonts.display, fontSize: compact ? type.title : type.display, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0,
      }}
    >
      <span aria-hidden style={{ transform: 'translateY(-1px)' }}>{dir === 'left' ? '‹' : '›'}</span>
    </motion.button>
  );
}

/** A neighbour at the stage's side: the hero's art alone, in the card's
 *  charcoal frame — no rules and no name (the tile mostly hides behind the
 *  middle card, which would cut a name in half), so the middle card is the
 *  only one with words. Drawn at the card's full size; the stage scales it. */
function PortraitTile({ cardId }: { cardId: string }) {
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box',
      padding: 10, borderRadius: 14,
      background: poster.frame, border: `3px solid ${poster.edge}`,
    }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden', background: poster.ground }}>
        <HeroPortrait cardId={cardId} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, boxShadow: printEdge, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
