import { motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster, chamfer } from '../poster';
import { PosterButton } from '../chrome';

interface Props {
  isMyTurn: boolean;
  busy: boolean;
  hasPending: boolean;
  autoPlay: boolean;
  onEnd: () => void;
  onCancel: () => void;
  onToggleAuto: () => void;
  /** 'dock' mounts the cluster in the sheet's right rail (desktop) as a
   *  vertical stack printed on the paper: ghost status capsule, the paper
   *  END TURN button, and the AUTO ink tag. 'tray' is the flat row used
   *  inside the mobile hand tray, which floats on the dark scene below the
   *  sheet — so its ghost surfaces switch to the cream/edge skin. */
  variant: 'dock' | 'tray';
}

/** Lamp-dot tone for the status capsule: dim while waiting on the rival,
 *  gold (your colour) while it's your move or resolving, green under auto. */
type StatusTone = 'dim' | 'gold' | 'green';

/**
 * The turn-control cluster: status lamp, End Turn, Auto toggle, Cancel.
 * Buttons keep constant labels (an action never doubles as a state
 * readout); the status line carries the changing state in a fixed-height
 * slot so nothing reflows.
 */
export function BoardControls({
  isMyTurn, busy, hasPending, autoPlay, onEnd, onCancel, onToggleAuto, variant,
}: Props) {
  const status = !isMyTurn
    ? { key: 'rival', label: "Rival's move", tone: 'dim' as StatusTone, pulse: true }
    : busy
      ? { key: 'busy', label: 'Resolving…', tone: 'gold' as StatusTone, pulse: true }
      : autoPlay
        ? { key: 'auto', label: 'Auto-play on', tone: 'green' as StatusTone, pulse: false }
        // Idle on the player's turn: say so — the empty slot read as a
        // half-finished panel and the state was only implied by button color.
        : { key: 'yours', label: 'Your move', tone: 'gold' as StatusTone, pulse: false };
  const endTurnHot = isMyTurn && !busy;
  const endTurnCursor = isMyTurn ? (busy ? 'progress' : 'pointer') : 'default';

  if (variant === 'tray') {
    // Mobile hand-tray row: Auto · status/cancel · End Turn, thumb-side last.
    // pointerEvents:auto — the tray shell above is pointer-transparent.
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: 'flex-end',
        paddingRight: 8,
        pointerEvents: 'auto',
      }}>
        <AutoSwitch autoPlay={autoPlay} onToggleAuto={onToggleAuto} onDark />
        <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
          <StatusOrCancel status={status} hasPending={hasPending} onCancel={onCancel} onDark />
        </div>
        {/* Hot = full paper; cold (busy) dims. The button stays ENABLED while
            busy so Board can queue the click. */}
        <motion.div
          animate={{ opacity: endTurnHot ? 1 : 0.75 }}
          transition={{ duration: 0.25 }}
          style={{ display: 'flex' }}
        >
          <PosterButton
            variant="paper"
            size="sm"
            disabled={!isMyTurn}
            onClick={onEnd}
            style={{
              width: 132,
              padding: '12px 0',
              textAlign: 'center',
              cursor: endTurnCursor,
              // On the dark scene the built-in disabled outline is ink on
              // ink — swap it for the cream ghost so the slot stays visible.
              ...(!isMyTurn ? { color: poster.creamDim, border: `2px solid ${poster.edge}` } : {}),
            }}
          >End Turn</PosterButton>
        </motion.div>
      </div>
    );
  }

  // Desktop dock — a vertical stack printed on the sheet's right rail.
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11,
      pointerEvents: 'auto',
    }}>
      {/* Status capsule / Cancel — fixed-height slot so swaps never reflow. */}
      <div style={{
        height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <StatusOrCancel status={status} hasPending={hasPending} onCancel={onCancel} />
      </div>

      {/* END TURN — the paper PosterButton, two-line label so the cluster
          stays inside the 150px rail. Hot = full paper; cold (busy) dims. */}
      <motion.div
        animate={{ opacity: endTurnHot ? 1 : 0.75 }}
        transition={{ duration: 0.25 }}
        style={{ position: 'relative', display: 'flex' }}
      >
        {/* Ready cue — a flat keyline in your colour whose OPACITY pulses,
            on its own layer outside the button's chamfer clip. */}
        {endTurnHot && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0.35 }}
            animate={{ opacity: [0.35, 0.85, 0.35] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: -4,
              border: `1px solid ${poster.you}`,
              clipPath: chamfer(11),
              WebkitClipPath: chamfer(11),
              pointerEvents: 'none',
            }}
          />
        )}
        <PosterButton
          variant="paper"
          size="md"
          disabled={!isMyTurn}
          onClick={onEnd}
          ariaLabel="End Turn"
          style={{
            // Left pad carries the tracking so the stacked caps sit centred.
            padding: '13px 22px 13px calc(22px + 0.22em)',
            lineHeight: 1.15,
            textAlign: 'center',
            cursor: endTurnCursor,
          }}
        >
          End<br />Turn
        </PosterButton>
      </motion.div>

      <AutoSwitch autoPlay={autoPlay} onToggleAuto={onToggleAuto} />
    </div>
  );
}

/** Status readout, or the red Cancel button while a card/skill is armed.
 *  The readout is a ghost capsule (outline only, like a disabled
 *  PosterButton) with a lamp dot; `onDark` swaps its ink outline for the
 *  cream/edge skin used on the dark scene. Keyed pop-in only — an
 *  AnimatePresence exit/enter swap here wedged mid-flight and left the
 *  slot permanently empty. */
function StatusOrCancel({ status, hasPending, onCancel, onDark = false }: {
  status: { key: string; label: string; tone: StatusTone; pulse: boolean };
  hasPending: boolean;
  onCancel: () => void;
  onDark?: boolean;
}) {
  if (hasPending) {
    return (
      <motion.div
        key="cancel"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.default}
        style={{ display: 'flex' }}
      >
        <PosterButton
          variant="red"
          size="sm"
          onClick={onCancel}
          style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}
        >Cancel</PosterButton>
      </motion.div>
    );
  }
  const lamp = status.tone === 'green'
    ? poster.green
    : status.tone === 'gold'
      ? poster.you
      : onDark ? poster.creamDim : poster.inkFaint;
  return (
    <motion.span
      key={status.key}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.default}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '4px 11px',
        background: 'transparent',
        border: `1.5px solid ${onDark ? poster.edge : poster.inkFaint}`,
        clipPath: chamfer(5),
        WebkitClipPath: chamfer(5),
        fontFamily: fonts.display,
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color: onDark ? poster.creamDim : poster.inkDim,
      }}
    >
      <motion.span
        aria-hidden
        animate={status.pulse ? { opacity: [0.35, 1, 0.35] } : { opacity: 1 }}
        transition={status.pulse
          ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.2 }}
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: lamp,
        }}
      />
      {status.label}
    </motion.span>
  );
}

/** Auto-play toggle — an INK TAG chip with a state lamp; text, border and
 *  dot go gold while the AI is driving your turns. `onDark` gives the off
 *  state an edge-coloured border so the ink chip keeps a silhouette on
 *  the dark scene. */
function AutoSwitch({ autoPlay, onToggleAuto, onDark = false }: {
  autoPlay: boolean;
  onToggleAuto: () => void;
  onDark?: boolean;
}) {
  const offBorder = onDark ? poster.edge : poster.ink;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      whileHover={{ y: -1 }}
      onClick={onToggleAuto}
      title={autoPlay
        ? 'Auto-play on — click to take control'
        : 'Auto-play off — click to let the AI play'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: poster.ink,
        border: `1.5px solid ${autoPlay ? poster.gold : offBorder}`,
        clipPath: chamfer(4),
        WebkitClipPath: chamfer(4),
        fontFamily: fonts.display,
        fontSize: 10.5,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1,
        color: autoPlay ? poster.gold : poster.paper,
        padding: '5px 12px',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{
        width: 7, height: 7, borderRadius: '50%',
        background: autoPlay ? poster.gold : poster.creamFaint,
      }} />
      Auto
    </motion.button>
  );
}
