import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { useCombatProgress, type CombatProgress } from '../effects/CombatProgressContext';

interface Props {
  isMyTurn: boolean;
  turn: number;
  /** Override for the ambient `CombatProgressContext` value — only the
   *  preview gallery passes this so it can demo the combat-mode ring
   *  without a real attack phase. Live game always reads context. */
  combatOverride?: CombatProgress;
}

// Register a CSS custom property the conic-gradient sweep can animate.
// Without @property, browsers interpolate angle as a string and the sweep
// snaps instead of rotating smoothly. Guarded so HMR re-imports don't throw.
if (typeof CSS !== 'undefined' && typeof (CSS as any).registerProperty === 'function') {
  try {
    (CSS as any).registerProperty({
      name: '--compass-sweep',
      syntax: '<angle>',
      inherits: false,
      initialValue: '0deg',
    });
  } catch {
    // Already registered (HMR) — ignore.
  }
}

/**
 * Persistent turn indicator pinned at the centre of the duel divider.
 *
 * Idle (no combat in flight): a flat paper disc with ink rings, a slow
 * faint-ink sweep around the edge, centre turn numeral, and an external
 * chevron pointing at whichever player owns the turn.
 *
 * Combat mode (CombatProgressContext non-null): the same disc, but the
 * edge ring swaps from "slow ambient sweep" to "segmented progress fill" —
 * one arc per attack step, filling left → right in the attacker's colour.
 * The active segment pulses for the duration of its beat. The centre
 * numeral and chevron are unchanged so the player never loses the
 * whose-turn signal.
 *
 * This component is the single mid-board focal token; combat does NOT
 * introduce any sibling chrome.
 */
// Disc diameter. The duel divider column is ~180px of open paper — at the
// old 36px the compass read as a stray dot rather than the board's focal
// token.
const SIZE = 54;
// Ring mask hole tracks the disc radius (ring layers sit at inset -3).
const RING_MASK = `radial-gradient(circle, transparent ${SIZE / 2 - 3}px, #000 ${SIZE / 2 - 2}px)`;

export function TurnCompass({ isMyTurn, turn, combatOverride }: Props) {
  const contextCombat = useCombatProgress();
  const combat = combatOverride !== undefined ? combatOverride : contextCombat;
  // Hue follows the turn owner — gold when it's the player's move, red
  // when it's the rival's. Matches the board-wide "you = gold, rival =
  // red" convention. During combat the ring's fill colour follows the
  // *attacker* instead (which is always the current-turn player, so this
  // stays consistent with `hue`).
  const hue = isMyTurn ? poster.you : poster.rival;

  // Turn-change ripple — replaces the old full-width TurnBanner. When
  // `isMyTurn` flips we bump a key so AnimatePresence mounts one fresh
  // ring-burst that scales out and fades. The initial mount is skipped
  // so the ripple doesn't fire on game load. Self-cleans (no timer).
  const [rippleKey, setRippleKey] = useState(0);
  const lastMyTurnRef = useRef(isMyTurn);
  useEffect(() => {
    if (lastMyTurnRef.current === isMyTurn) return;
    lastMyTurnRef.current = isMyTurn;
    setRippleKey((k) => k + 1);
  }, [isMyTurn]);

  return (
    <motion.div
      aria-label={`Turn ${turn} · ${isMyTurn ? 'Your Move' : "Rival's Move"}`}
      title={`Turn ${turn} · ${isMyTurn ? 'Your Move' : "Rival's Move"}`}
      // Breathe only on the player's turn — doubles as a "you're up" signal
      // and stops the infinite loop from burning frames during rival turns.
      animate={isMyTurn ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={isMyTurn
        ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0.3 }}
      style={{
        position: 'relative',
        zIndex: 2,
        width: SIZE,
        height: SIZE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Paper disc — flat cream with an ink keyline and one inner hairline
          ring, printed on the divider like a dial. No shadow, no blur. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: poster.paper,
          border: `1.5px solid ${poster.ink}`,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 5,
          borderRadius: '50%',
          border: `1px solid ${poster.inkRule}`,
          pointerEvents: 'none',
        }}
      />

      {combat
        ? <CombatRing combat={combat} />
        : <IdleSweepRing />}

      {/* Turn-change ripple — single short-lived ring-burst that fires on
          every isMyTurn flip. Replaces the old "Your Move / Rival's Move"
          banner. Skipped on first mount so it doesn't fire on game load. */}
      <AnimatePresence>
        {rippleKey > 0 && (
          <motion.div
            key={rippleKey}
            aria-hidden
            initial={{ scale: 1, opacity: 0.75 }}
            animate={{ scale: 1.65, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `1.5px solid ${hue}`,
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* Centred turn readout — micro "TURN" caption over the numeral. Stays
          static so it's always readable in a single beat (also during
          combat — beat progress lives in the ring). */}
      <span style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        zIndex: 1,
      }}>
        <span style={{
          fontFamily: fonts.display,
          fontSize: 7,
          letterSpacing: '0.34em',
          paddingLeft: '0.34em', // optically recenters tracked-out caps
          textTransform: 'uppercase',
          color: poster.inkDim,
          lineHeight: 1,
        }}>
          Turn
        </span>
        <span style={{
          fontFamily: fonts.display,
          fontSize: 19,
          lineHeight: 1,
          color: poster.ink,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {turn}
        </span>
      </span>

      {/* External chevron — sits OUTSIDE the disc's edge and points at the
          active player. Anchored only by `top` so framer-motion can spring
          between the two numeric positions (interpolating `top` ↔ `auto`
          parks the element mid-disc). Slides from above the disc (opponent)
          to below (you) on turn change. */}
      <motion.div
        aria-hidden
        animate={{ top: isMyTurn ? SIZE + 2 : -8 }}
        transition={spring.snappy}
        style={{
          position: 'absolute',
          left: '50%',
          marginLeft: -5,
          width: 10,
          height: 6,
          pointerEvents: 'none',
        }}
      >
        <svg viewBox="0 0 10 6" width={10} height={6} style={{ display: 'block', color: hue }}>
          {isMyTurn
            ? <path d="M0 0 L10 0 L5 6 Z" fill="currentColor" />
            : <path d="M0 6 L10 6 L5 0 Z" fill="currentColor" />}
        </svg>
      </motion.div>

      {/* Keyframes — declared inline so the component is self-contained and
          can be dropped into PreviewGallery without external CSS. */}
      <style>{`
        @keyframes turn-compass-sweep-spin {
          from { --compass-sweep: 0deg; }
          to   { --compass-sweep: 360deg; }
        }
        .turn-compass-sweep {
          animation: turn-compass-sweep-spin 8s linear infinite;
        }
      `}</style>
    </motion.div>
  );
}

/** Idle state — a thin faint-ink arc orbiting slowly (~8s) around the disc.
 *  Hard stops so it reads as a printed dial mark, not a glowing halo. */
function IdleSweepRing() {
  return (
    <div
      aria-hidden
      className="turn-compass-sweep"
      style={{
        position: 'absolute',
        inset: -3,
        borderRadius: '50%',
        background: `conic-gradient(from var(--compass-sweep, 0deg),
          transparent 0deg 300deg,
          ${poster.inkFaint} 300deg 360deg)`,
        WebkitMask: RING_MASK,
        mask: RING_MASK,
        pointerEvents: 'none',
      }}
    />
  );
}

/** Combat state — N equal arcs around the ring, one per attack step.
 *  Resolved segments are solid in the attacker's colour (gold = you, red
 *  = rival), the active segment pulses, upcoming segments are faint-ink
 *  hairlines. */
function CombatRing({ combat }: { combat: NonNullable<CombatProgress> }) {
  const hue = combat.attackerIsMe ? poster.you : poster.rival;
  const gapDeg = 6;
  const seg = 360 / combat.total;
  // Static ring: filled colours for resolved + active segments, faint-ink
  // hairline for upcoming. Active segment uses the same fill as resolved
  // (the pulse layer below adds emphasis on top).
  const stops: string[] = [];
  for (let i = 0; i < combat.total; i++) {
    const a0 = i * seg;
    const a1 = a0 + seg - gapDeg;
    const fill = i <= combat.currentBeat ? hue : poster.inkFaint;
    stops.push(`${fill} ${a0}deg ${a1}deg`, `transparent ${a1}deg ${a0 + seg}deg`);
  }
  const ringBg = `conic-gradient(from -${gapDeg / 2}deg, ${stops.join(', ')})`;

  // Active segment overlay — only the arc for `currentBeat` is opaque, the
  // rest is transparent. A motion.div opacity pulse on this layer makes
  // the current beat unmistakable while the resolved segments stay calm.
  const activeA0 = combat.currentBeat * seg;
  const activeA1 = activeA0 + seg - gapDeg;
  const activeBg = `conic-gradient(from -${gapDeg / 2}deg,
    transparent 0deg ${activeA0}deg,
    ${hue} ${activeA0}deg ${activeA1}deg,
    transparent ${activeA1}deg 360deg)`;

  const ringMask = RING_MASK;

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: '50%',
          background: ringBg,
          WebkitMask: ringMask,
          mask: ringMask,
          pointerEvents: 'none',
        }}
      />
      {/* Pulse layer — only shown while there's still an in-flight beat
          (currentBeat < total). */}
      {combat.currentBeat < combat.total && (
        <motion.div
          aria-hidden
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            background: activeBg,
            WebkitMask: ringMask,
            mask: ringMask,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
