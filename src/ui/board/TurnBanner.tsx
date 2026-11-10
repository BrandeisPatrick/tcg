import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { chamfer, clipBoth, poster } from '../poster';
import { useFxCalm } from '../effects/fx/FxMotionContext';

/** How long the banner stays up, ms. */
const SHOW_MS = 1400;

/**
 * "Your turn" / "Rival's turn" — a short banner as a turn begins, in place
 * of the old Income · Act · End dial: one ink plate across the upper table,
 * in the mover's ink, gone again in a moment. Keyed by the turn number, so
 * each turn shows it once; under calm motion it just appears and goes.
 */
export function TurnBanner({ turn, isMyTurn, enabled }: { turn: number; isMyTurn: boolean; enabled: boolean }) {
  const calm = useFxCalm();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || turn < 1) return;
    setShown(turn);
    const t = setTimeout(() => setShown((s) => (s === turn ? null : s)), SHOW_MS);
    return () => clearTimeout(t);
  }, [turn, enabled]);
  const accent = isMyTurn ? poster.you : poster.rival;
  return (
    <AnimatePresence>
      {shown !== null && shown === turn && (
        <motion.div
          key={`turn-${turn}`}
          role="status"
          aria-label={isMyTurn ? 'Your turn' : "Rival's turn"}
          initial={calm ? { opacity: 1 } : { opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={calm ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10, transition: { duration: 0.22 } }}
          transition={spring.snappy}
          style={{
            position: 'fixed', left: 0, right: 0, top: '36%',
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 88,
          }}
        >
          <span style={{
            padding: '10px 26px',
            background: poster.ink,
            color: accent,
            ...clipBoth(chamfer(8)),
            boxShadow: `0 0 0 2px ${accent}, 0 10px 24px rgba(0, 0, 0, 0.5)`,
            fontFamily: fonts.display,
            fontSize: 20,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            {isMyTurn ? 'Your turn' : "Rival's turn"}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
