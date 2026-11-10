import { useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { PatronSigil, scale } from '../hud';
import { useFxCalm } from '../effects/fx/FxMotionContext';
import { useSettings } from '@/storage/settings';
import { STAGE, boardRows, boardStack, tablePlane } from './BoardTable';

/** How long the banner stays up, ms. */
const SHOW_MS = 1300;
/** How long a turn's banner may wait out a card reveal before it is dropped:
 *  by then the reveal's own caption has said whose turn it is. */
const WAIT_MS = 2600;

/** The lane between the two Actives, in viewport px: where the seam lands on
 *  screen under the current camera (tilted or flat), its height, and the
 *  stage's left edge and width. The turn banner and the targeting strip both
 *  sit in it — the one stretch of the table that is never a card. */
export interface LaneBox { top: number; height: number; left: number; width: number }

export function useLaneBox(): LaneBox {
  const { flatTable } = useSettings();
  const read = (): LaneBox => {
    const plane = tablePlane(!flatTable);
    const s = boardStack();
    const y0 = plane.y(s.mid - boardRows.lane / 2);
    const y1 = plane.y(s.mid + boardRows.lane / 2);
    const el = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-stage]') : null;
    const r = el?.getBoundingClientRect();
    const W = typeof window !== 'undefined' ? window.innerWidth : STAGE.w;
    const H = typeof window !== 'undefined' ? window.innerHeight : STAGE.h;
    // No stage on screen (a gallery, a test): the stage fitted to the window.
    const k = r && r.height > 0 ? r.height / STAGE.h : Math.min(W / STAGE.w, H / STAGE.h);
    const top0 = r && r.height > 0 ? r.top : (H - STAGE.h * k) / 2;
    const left0 = r && r.width > 0 ? r.left : (W - STAGE.w * k) / 2;
    return { top: top0 + y0 * k, height: (y1 - y0) * k, left: left0, width: STAGE.w * k };
  };
  const [box, setBox] = useState<LaneBox>(read);
  useLayoutEffect(() => {
    const measure = () => setBox((b) => {
      const n = read();
      return Math.abs(n.top - b.top) + Math.abs(n.height - b.height) + Math.abs(n.left - b.left) + Math.abs(n.width - b.width) > 0.5 ? n : b;
    });
    measure();
    // The stage re-fits a frame after a resize (useStageScale): look twice.
    const onResize = () => { measure(); requestAnimationFrame(measure); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatTable]);
  return box;
}

/**
 * "Your turn" / "Rival's turn" — a short strip across the lane between the
 * two Actives as a turn begins, Deadlock's scoreboard style: the patron's
 * sigil and colour first (amber for you, sapphire for the rival), the words
 * second. Keyed by the turn number, so each turn shows it once.
 *
 * It never shares the screen with a card reveal (`hold`: an action is being
 * shown mid-screen): a turn that opens on a reveal waits it out, and a reveal
 * that starts while the strip is up sends it away at once. Under calm motion
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
  const h = Math.max(34, Math.min(46, lane.height - 6));
  const fade = `linear-gradient(90deg, transparent 0%, ${accent} 22%, ${accent} 78%, transparent 100%)`;
  return (
    // A reveal sends the strip away at once (no fade under the card).
    <AnimatePresence custom={hold}>
      {shown !== null && shown === turn && (
        <motion.div
          key={`turn-${turn}`}
          role="status"
          aria-label={isMyTurn ? 'Your turn' : "Rival's turn"}
          data-turn-banner={side}
          initial={calm ? { opacity: 1 } : { opacity: 0, scaleX: 0.3 }}
          animate={{ opacity: 1, scaleX: 1 }}
          custom={hold}
          variants={{
            gone: (held: boolean) => (calm || held
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, scaleX: 0.6, transition: { duration: 0.18 } }),
          }}
          exit="gone"
          transition={spring.snappy}
          style={{
            position: 'fixed',
            left: lane.left, width: lane.width,
            top: lane.top + lane.height / 2 - h / 2, height: h,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: `linear-gradient(90deg, transparent 0%, rgba(11, 23, 22, 0.94) 16%, rgba(23, 48, 45, 0.97) 50%, rgba(11, 23, 22, 0.94) 84%, transparent 100%)`,
            pointerEvents: 'none', zIndex: 88,
          }}
        >
          {/* The patron's colour runs along both edges, fading at the ends. */}
          <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: fade }} />
          <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: fade }} />
          <PatronSigil side={side} size={Math.round(h * 0.62)} />
          <span style={{
            fontFamily: fonts.display,
            fontSize: scale.title,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            color: accent,
            textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
          }}>
            {isMyTurn ? 'Your turn' : "Rival's turn"}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
