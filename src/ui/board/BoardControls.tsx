import { motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { PosterButton } from '../chrome';

/** The turn button's name — its label and its accessible name, by which the
 *  tutorial's gate finds it. */
export const END_TURN = 'End Turn';

interface Props {
  isMyTurn: boolean;
  busy: boolean;
  hasPending: boolean;
  autoPlay: boolean;
  /** The turn button was pressed. */
  onEndTurn: () => void;
  onCancel: () => void;
  onToggleAuto: () => void;
  /** The turn button's box in the turn row, and the Auto toggle's beside
   *  your bench (BoardTable's hudSeats). */
  seat: { endTurn: { left: number; top: number; width: number; height: number }; auto: { left: number; top: number; width: number; height: number } };
}

/**
 * The turn controls: one clear End Turn button at the right of the turn row,
 * under the right thumb and above the hand (red Cancel in its place while a
 * card, a skill or an item is armed), and a small Auto toggle under the menu
 * button at your bench's left. A button's label is always the
 * action a press performs — the turn button only ever ends the turn (the
 * attack is made from the Active's sheet). It stays enabled while busy so
 * Board can queue the press.
 */
export function BoardControls({ isMyTurn, busy, hasPending, autoPlay, onEndTurn, onCancel, onToggleAuto, seat }: Props) {
  const turnHot = isMyTurn && !busy && !autoPlay;
  const turnCursor = isMyTurn ? (busy ? 'progress' : 'pointer') : 'default';
  return (
    <>
      <div style={{ position: 'absolute', ...seat.endTurn, display: 'flex', zIndex: 8 }}>
        {hasPending ? (
          <motion.div key="cancel" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={spring.default} style={{ display: 'flex', width: '100%' }}>
            <PosterButton
              variant="red"
              size="sm"
              onClick={onCancel}
              style={{ width: '100%', height: '100%', padding: 0, fontSize: 11.5, letterSpacing: '0.16em', textAlign: 'center' }}
            >Cancel</PosterButton>
          </motion.div>
        ) : (
          <motion.div
            key="turn"
            animate={{ opacity: isMyTurn ? 1 : 0.7 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'relative', display: 'flex', width: '100%' }}
          >
            {/* Ready cue — a keyline in your colour whose opacity pulses, on
                its own layer outside the button's chamfer clip. */}
            {turnHot && (
              <motion.span
                aria-hidden
                initial={{ opacity: 0.35 }}
                animate={{ opacity: [0.35, 0.9, 0.35] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute', inset: -4,
                  border: `1.5px solid ${poster.you}`,
                  ...clipBoth(chamfer(9)),
                  pointerEvents: 'none',
                }}
              />
            )}
            <PosterButton
              variant="paper"
              size="sm"
              disabled={!isMyTurn}
              onClick={onEndTurn}
              ariaLabel={END_TURN}
              style={{
                width: '100%', height: '100%', padding: 0, fontSize: 11.5, letterSpacing: '0.14em', textAlign: 'center',
                cursor: turnCursor,
                ...(busy && isMyTurn ? { color: poster.inkDim } : {}),
              }}
            >{END_TURN}</PosterButton>
          </motion.div>
        )}
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={onToggleAuto}
        aria-pressed={autoPlay}
        title={autoPlay ? 'Auto-play on — tap to take control' : 'Auto-play off — tap to let the AI play'}
        style={{
          position: 'absolute', ...seat.auto, zIndex: 6,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          background: poster.ink,
          border: `1.5px solid ${autoPlay ? poster.gold : poster.inkFaint}`,
          ...clipBoth(chamfer(4)),
          fontFamily: fonts.display,
          fontSize: 8.5,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1,
          color: autoPlay ? poster.gold : poster.cream,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{ width: 5, height: 5, flexShrink: 0, borderRadius: '50%', background: autoPlay ? poster.gold : poster.creamFaint }} />
        Auto
      </motion.button>
    </>
  );
}
