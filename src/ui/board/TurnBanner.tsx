import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { scale } from '../hud';
import { useFxCalm } from '../effects/fx/FxMotionContext';

/** How long the banner stays up, ms. */
const SHOW_MS = 1300;
/** How long a turn's banner may wait out a card reveal before it is dropped:
 *  by then the reveal's own caption has said whose turn it is. */
const WAIT_MS = 2600;

/** The lane's middle column, between the two Actives, in viewport px (the
 *  sheet's `data-lane-mid` cell, where the turn dial sits). The turn banner,
 *  the targeting tag and the feedback sticker all sit in it — the one box on
 *  the sheet that is never a card, a number or a control. */
export interface LaneBox { top: number; height: number; left: number; width: number }

const sameBox = (a: LaneBox, b: LaneBox) =>
  Math.abs(a.top - b.top) + Math.abs(a.height - b.height) + Math.abs(a.left - b.left) + Math.abs(a.width - b.width) <= 0.5;

function readLaneBox(): LaneBox {
  const el = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-lane-mid]') : null;
  const r = el?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) return { top: r.top, height: r.height, left: r.left, width: r.width };
  // No sheet on screen (a gallery, a test): a column in the window's middle.
  const W = typeof window !== 'undefined' ? window.innerWidth : 390;
  const H = typeof window !== 'undefined' ? window.innerHeight : 844;
  const width = Math.min(160, W / 3);
  return { top: H / 2 - 80, height: 160, left: (W - width) / 2, width };
}

export function useLaneBox(): LaneBox {
  const [box, setBox] = useState<LaneBox>(readLaneBox);
  // The box last read and handed to React. A new one is set only when a read
  // differs from it, and it is set as a plain value: a read that finds
  // nothing moved schedules nothing, so a render can never ask for another
  // (a resize's update still waiting behind a tap's render included).
  const last = useRef(box);
  const measure = useCallback(() => {
    const n = readLaneBox();
    if (sameBox(n, last.current)) return;
    last.current = n;
    setBox(n);
  }, []);
  // Read again after every render of whoever shows something in it (the
  // sheet is laid out for the screen, so the column moves with it), and a
  // frame after a resize or a rotation, once the sheet has settled.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    let raf = 0;
    const onResize = () => { measure(); cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [measure]);
  return box;
}

/**
 * "Your turn" / "Rival's turn" — an ink stamp on the lane's middle column as
 * a turn begins, two short lines edged in the side's colour (gold for you,
 * red for the rival). It stands where the turn dial is and nowhere else: no
 * card, no number and no control is under it. Keyed by the turn number, so
 * each turn shows it once.
 *
 * It never shares the screen with a card reveal (`hold`: an action is being
 * shown mid-screen): a turn that opens on a reveal waits it out, and a reveal
 * that starts while the stamp is up sends it away at once. Under calm motion
 * it just appears and goes.
 */
export function TurnBanner({ turn, isMyTurn, enabled, hold = false }: {
  turn: number;
  isMyTurn: boolean;
  enabled: boolean;
  /** A card reveal (or any action) is on screen: yield to it. */
  hold?: boolean;
}) {
  const calm = useFxCalm();
  const lane = useLaneBox();
  // The turn owed a banner, and when it became owed.
  const [due, setDue] = useState<{ turn: number; at: number } | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || turn < 1) return;
    setDue({ turn, at: Date.now() });
  }, [turn, enabled]);
  useEffect(() => {
    if (hold) { setShown(null); return; }
    if (!due) return;
    setDue(null);
    if (due.turn !== turn || Date.now() - due.at > WAIT_MS) return;
    setShown(due.turn);
  }, [due, hold, turn]);
  useEffect(() => {
    if (shown === null) return;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [shown]);
  const accent = isMyTurn ? poster.you : poster.rival;
  const side = isMyTurn ? 'you' : 'rival';
  const big = lane.width >= 132;
  return (
    // A reveal sends the stamp away at once (no fade under the card).
    <AnimatePresence custom={hold}>
      {shown !== null && shown === turn && (
        <motion.div
          key={`turn-${turn}`}
          role="status"
          aria-label={isMyTurn ? 'Your turn' : "Rival's turn"}
          data-turn-banner={side}
          initial={calm ? { opacity: 1 } : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          custom={hold}
          variants={{
            gone: (held: boolean) => (calm || held
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, scale: 0.85, transition: { duration: 0.18 } }),
          }}
          exit="gone"
          transition={spring.snappy}
          style={{
            position: 'fixed',
            left: lane.left, width: lane.width,
            top: lane.top, height: lane.height,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 88,
          }}
        >
          <span style={{
            maxWidth: '100%', boxSizing: 'border-box',
            padding: big ? '10px 14px' : '8px 9px',
            background: poster.ink,
            // The side's colour as a flat rule along the top and the foot.
            boxShadow: `inset 0 3px 0 ${accent}, inset 0 -3px 0 ${accent}`,
            fontFamily: fonts.display,
            fontSize: big ? scale.title : scale.body,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            lineHeight: 1.2,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            color: poster.paper,
          }}>
            {isMyTurn ? 'Your' : "Rival's"}<br />turn
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
