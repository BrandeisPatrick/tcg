import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { palette, fonts, spring } from '../tokens';
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
 * Idle (no combat in flight): a glassmorphic orb with a slow
 * conic-gradient sweep, centre turn numeral, and an external chevron
 * pointing at whichever player owns the turn.
 *
 * Combat mode (CombatProgressContext non-null): the same orb, but the
 * conic-gradient ring swaps from "slow ambient highlight" to "segmented
 * progress fill" — one arc per attack step, filling left → right in the
 * attacker's hue family. The active segment pulses for the duration of
 * its beat. The centre numeral and chevron are unchanged so the player
 * never loses the whose-turn signal.
 *
 * This component is the single mid-board focal token; combat does NOT
 * introduce any sibling chrome.
 */
export function TurnCompass({ isMyTurn, turn, combatOverride }: Props) {
  const contextCombat = useCombatProgress();
  const combat = combatOverride !== undefined ? combatOverride : contextCombat;
  // Hue family follows the turn owner — brass tones when it's the player's
  // move, wine tones when it's the rival's. Matches the board-wide
  // "you = brass, opponent = wine" convention. During combat the ring's
  // fill colour follows the *attacker* instead (which is always the
  // current-turn player, so this stays consistent with `hue`).
  const hue = isMyTurn ? palette.accent : palette.danger;

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
      animate={{ scale: [1, 1.04, 1] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        position: 'relative',
        zIndex: 2,
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Glass surface — translucent parchment over a backdrop blur so the
          token reads as floating glass on the duel divider, not a chip. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'rgba(245, 232, 204, 0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: `1px solid ${hue}88`,
          boxShadow: isMyTurn
            ? `0 0 14px ${hue}55, inset 0 0 0 1px rgba(255, 255, 255, 0.25)`
            : `0 2px 6px rgba(40, 20, 0, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.18)`,
        }}
      />

      {combat
        ? <CombatRing combat={combat} />
        : <IdleSweepRing hue={hue} />}

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

      {/* Centred turn numeral — the only piece of glanceable info inside
          the orb. Stays static so it's always readable in a single beat
          (also during combat — beat progress lives in the ring). */}
      <span style={{
        position: 'relative',
        fontFamily: fonts.ui,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1,
        color: palette.text,
        fontVariantNumeric: 'tabular-nums',
        zIndex: 1,
      }}>
        {turn}
      </span>

      {/* External chevron — sits OUTSIDE the orb's edge and points at the
          active player. Anchored only by `top` so framer-motion can spring
          between the two numeric positions (interpolating `top` ↔ `auto`
          parks the element mid-orb). Slides from above the orb (opponent)
          to below (you) on turn change. */}
      <motion.div
        aria-hidden
        animate={{ top: isMyTurn ? 38 : -8 }}
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

/** Idle state — a thin coloured arc orbiting slowly (~8s) around the orb.
 *  Reads as a compass-dial sweep, not a busy halo. */
function IdleSweepRing({ hue }: { hue: string }) {
  return (
    <div
      aria-hidden
      className="turn-compass-sweep"
      style={{
        position: 'absolute',
        inset: -3,
        borderRadius: '50%',
        background: `conic-gradient(from var(--compass-sweep, 0deg),
          transparent 0deg,
          transparent 290deg,
          ${hue}cc 330deg,
          ${hue}ff 350deg,
          ${hue}cc 10deg,
          transparent 50deg,
          transparent 360deg)`,
        WebkitMask: 'radial-gradient(circle, transparent 15px, #000 16px)',
        mask: 'radial-gradient(circle, transparent 15px, #000 16px)',
        pointerEvents: 'none',
      }}
    />
  );
}

/** Combat state — N equal arcs around the ring, one per attack step.
 *  Resolved segments are solid in the attacker's hue, the active segment
 *  pulses, upcoming segments are low-alpha hairlines. */
function CombatRing({ combat }: { combat: NonNullable<CombatProgress> }) {
  const hue = combat.attackerIsMe ? palette.accent : palette.danger;
  const gapDeg = 6;
  const seg = 360 / combat.total;
  // Static ring: filled colours for resolved + active segments, low-alpha
  // hairline for upcoming. Active segment uses the same fill as resolved
  // (the pulse layer below adds emphasis on top).
  const stops: string[] = [];
  for (let i = 0; i < combat.total; i++) {
    const a0 = i * seg;
    const a1 = a0 + seg - gapDeg;
    const fill = i <= combat.currentBeat ? hue : `${hue}33`;
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

  const ringMask = 'radial-gradient(circle, transparent 15px, #000 16px)';

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
            filter: `drop-shadow(0 0 4px ${hue}cc)`,
          }}
        />
      )}
    </>
  );
}
