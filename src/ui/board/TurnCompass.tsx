import { Fragment, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { useCombatProgress, type CombatProgress } from '../effects/CombatProgressContext';

/** Where a turn stands. It runs Prepare → Battle → Prepare → End Turn;
 *  'regroup' is the second prepare phase, printed "Prepare" like the first. */
export type TurnPhase = 'prepare' | 'battle' | 'regroup';

/** The ways the compass can print the phase. The Gallery's Board tab shows
 *  them side by side; the board uses DEFAULT_PHASE_STYLE.
 *
 *    track   the word on a slip under the dial, over three pips — where the
 *            turn is and what comes next
 *    bars    the word under five level bars: flat before the battle, bouncing
 *            through it, held where they stopped after it
 *    tag     a numbered ink tag under the dial, in the owner's colour for
 *            the battle
 *    thirds  nothing added: the dial's ring is the turn in three arcs, and
 *            its caption is the word
 *    ink     nothing added: the dial itself floods with ink for the battle
 */
export const PHASE_STYLES = ['track', 'bars', 'tag', 'thirds', 'ink'] as const;
export type PhaseStyle = (typeof PHASE_STYLES)[number];
export const DEFAULT_PHASE_STYLE: PhaseStyle = 'track';

const PHASES: TurnPhase[] = ['prepare', 'battle', 'regroup'];
const PHASE_WORD: Record<TurnPhase, string> = { prepare: 'Prepare', battle: 'Battle', regroup: 'Prepare' };

interface Props {
  isMyTurn: boolean;
  turn: number;
  phase: TurnPhase;
  phaseStyle?: PhaseStyle;
  /** Override for the ambient `CombatProgressContext` value — only the
   *  preview gallery passes this so it can demo the combat-mode ring
   *  without a real battle. Live game always reads context. */
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
 * Persistent turn indicator pinned at the centre of the duel divider: whose
 * turn it is, which turn, and where in the turn — Prepare, Battle, Prepare.
 *
 * The dial: a flat paper disc with ink rings, the turn numeral at its
 * centre, and an external chevron pointing at whichever player owns the
 * turn. A turn changing hands fires one ring-burst, flips the chevron and
 * swaps the hue.
 *
 * The ring: outside the battle, a slow faint-ink sweep around the edge.
 * While the battle is fought (CombatProgressContext non-null) it becomes a
 * segmented progress fill — one arc per attack step, filling in the
 * attacker's colour, the active segment pulsing.
 *
 * The phase: printed quietly, in one of the PHASE_STYLES. It changes with
 * the turn button's label — Enter Battle while the battle is ahead, End
 * Turn once it is fought — so the two always tell the same story.
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

export function TurnCompass({ isMyTurn, turn, phase, phaseStyle = DEFAULT_PHASE_STYLE, combatOverride }: Props) {
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

  const word = PHASE_WORD[phase];
  // 'thirds' and 'ink' print the phase inside the dial; the others hang a
  // readout under it.
  const readout = phaseStyle === 'thirds' || phaseStyle === 'ink' ? null : phaseStyle;
  const inDial = readout === null;
  const flooded = phaseStyle === 'ink' && phase === 'battle';
  const name = `Turn ${turn} · ${isMyTurn ? 'Your Move' : "Rival's Move"} · ${word} phase`;

  return (
    <motion.div
      aria-label={name}
      title={name}
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
          background: flooded ? poster.ink : poster.paper,
          border: `1.5px solid ${poster.ink}`,
          transition: 'background-color 0.25s ease',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 5,
          borderRadius: '50%',
          border: `1px solid ${flooded ? poster.creamFaint : poster.inkRule}`,
          pointerEvents: 'none',
        }}
      />

      {phaseStyle === 'thirds'
        ? <ThirdsRing phase={phase} combat={combat} hue={hue} />
        : combat
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

      {/* Centred readout — a micro caption over the turn numeral. The
          caption is "TURN", or the phase where the style prints it in the
          dial. The numeral stays static so it's always readable in a single
          beat (also during combat — beat progress lives in the ring). */}
      <span style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        zIndex: 1,
      }}>
        <span
          // Keyed so a phase change lands as new type; no exit animation to
          // wait on (one that stalls in a throttled tab would hold the old
          // word on screen).
          key={inDial ? phase : 'turn'}
          style={{
            fontFamily: fonts.display,
            fontSize: inDial ? 6.5 : 7,
            letterSpacing: inDial ? '0.12em' : '0.34em',
            paddingLeft: inDial ? '0.12em' : '0.34em', // optically recenters tracked-out caps
            textTransform: 'uppercase',
            color: flooded ? poster.cream : poster.inkDim,
            lineHeight: 1,
          }}
        >
          {inDial ? word : 'Turn'}
        </span>
        <span style={{
          fontFamily: fonts.display,
          fontSize: 19,
          lineHeight: 1,
          color: flooded ? poster.paper : poster.ink,
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

      {readout && <PhaseReadout kind={readout} phase={phase} hue={hue} mine={isMyTurn} />}

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
        @keyframes turn-compass-bar-bounce {
          0%, 100% { transform: scaleY(0.25); }
          50%      { transform: scaleY(1); }
        }
        .turn-compass-bar {
          animation: turn-compass-bar-bounce 600ms ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .turn-compass-bar { animation: none; transform: scaleY(0.75); }
        }
      `}</style>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The phase, printed under the dial
// ---------------------------------------------------------------------------

/** Stencil micro-type shared by the readouts. */
const phaseType = {
  fontFamily: fonts.display,
  fontSize: 11,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
  whiteSpace: 'nowrap' as const,
};

/** Level-bar heights in px: flat before the battle, and frozen mid-song
 *  after it. During the battle every bar is full height and bounces. */
const BARS_REST = [3, 3, 3, 3, 3];
const BARS_HELD = [5, 9, 6, 11, 7];
const BARS_MAX = 12;
/** Each bar bounces to its own beat so the five never move as one. */
const BAR_BEAT_MS = [520, 680, 440, 760, 600];

/**
 * The phase on a slip of paper under the dial — the dial's own paper with a
 * faint keyline, so it reads as a label pinned to the divider (and masks the
 * hairline behind it). The tag style is its own plate and needs no slip.
 * Sits below the chevron's low position, so the two never touch, and stays
 * put when the turn changes hands — one place to look. Decorative: the
 * dial's accessible name already says the phase.
 */
function PhaseReadout({ kind, phase, hue, mine }: {
  kind: 'track' | 'bars' | 'tag';
  phase: TurnPhase;
  hue: string;
  mine: boolean;
}) {
  const at = PHASES.indexOf(phase);
  const battle = phase === 'battle';
  const word = PHASE_WORD[phase];
  // A plate in the owner's colour: ink reads on your gold, paper on the
  // rival's red.
  const onHue = mine ? poster.ink : poster.paper;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: SIZE + 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        ...(kind === 'tag' ? {} : {
          padding: '3px 5px 5px',
          background: poster.paper,
          border: `1px solid ${poster.inkFaint}`,
          borderRadius: 3,
        }),
        pointerEvents: 'none',
      }}
    >
      {kind === 'bars' && (
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: BARS_MAX }}>
          {BARS_REST.map((rest, i) => (
            <span
              key={i}
              className={battle ? 'turn-compass-bar' : undefined}
              style={{
                width: 3,
                height: battle ? BARS_MAX : phase === 'regroup' ? BARS_HELD[i] : rest,
                background: battle ? poster.ink : phase === 'regroup' ? poster.inkDim : poster.inkFaint,
                transformOrigin: '50% 100%',
                animationDuration: `${BAR_BEAT_MS[i]}ms`,
                // Negative delays start the five out of step.
                animationDelay: `${-i * 137}ms`,
                transition: 'height 0.25s ease, background-color 0.25s ease',
              }}
            />
          ))}
        </span>
      )}

      {kind === 'tag' ? (
        <motion.span
          key={phase}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{
            ...phaseType,
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 6,
            padding: '5px 9px 5px 10px',
            background: battle ? hue : poster.ink,
            color: battle ? onHue : poster.paper,
            ...clipBoth(chamfer(4)),
          }}
        >
          <span style={{ opacity: 0.62, letterSpacing: 0 }}>{at + 1}</span>
          {word}
        </motion.span>
      ) : (
        // The word in ink; for the battle it inverts to a plate, so the
        // change of phase is a change of weight rather than of colour.
        <motion.span
          key={phase}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{
            ...phaseType,
            padding: '3px 5px 3px calc(5px + 0.2em)',
            background: battle ? poster.ink : 'transparent',
            color: battle ? poster.paper : poster.ink,
            ...clipBoth(chamfer(3)),
          }}
        >
          {word}
        </motion.span>
      )}

      {kind === 'track' && (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {PHASES.map((p, i) => (
            <Fragment key={p}>
              {i > 0 && (
                <span style={{ width: 12, height: 1, background: i <= at ? poster.ink : poster.inkFaint }} />
              )}
              <TrackPip diamond={p === 'battle'} state={i < at ? 'done' : i === at ? 'now' : 'ahead'} hue={hue} />
            </Fragment>
          ))}
        </span>
      )}
    </div>
  );
}

/** One stop on the track: a dot for a prepare phase, a diamond for the
 *  battle. Behind you it is ink, where you stand it is the owner's colour
 *  with an ink rim (pulsing through the battle), ahead it is an outline. */
function TrackPip({ diamond, state, hue }: { diamond: boolean; state: 'done' | 'now' | 'ahead'; hue: string }) {
  const size = diamond ? 7 : 8;
  return (
    <motion.span
      animate={diamond && state === 'now' ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
      transition={diamond && state === 'now'
        ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0.2 }}
      style={{
        width: size,
        height: size,
        // The diamond's corners reach past its box; the margin keeps the
        // connectors off them.
        margin: diamond ? '0 2px' : 0,
        boxSizing: 'border-box',
        borderRadius: diamond ? 0 : '50%',
        rotate: diamond ? 45 : 0,
        background: state === 'done' ? poster.ink : state === 'now' ? hue : 'transparent',
        border: `1px solid ${state === 'ahead' ? poster.inkFaint : poster.ink}`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

/** A ring layer: a conic gradient shown only through the ring mask. */
function Ring({ background }: { background: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: -3,
        borderRadius: '50%',
        background,
        WebkitMask: RING_MASK,
        mask: RING_MASK,
        pointerEvents: 'none',
      }}
    />
  );
}

/** The ring layer for the beat in flight: only its arc is opaque, and the
 *  layer's opacity pulses, so the current beat is unmistakable while the
 *  resolved arcs stay calm. */
function PulsingArc({ from, a0, a1, hue }: { from: number; a0: number; a1: number; hue: string }) {
  return (
    <motion.div
      aria-hidden
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        position: 'absolute',
        inset: -3,
        borderRadius: '50%',
        background: `conic-gradient(from ${from}deg,
          transparent 0deg ${a0}deg,
          ${hue} ${a0}deg ${a1}deg,
          transparent ${a1}deg 360deg)`,
        WebkitMask: RING_MASK,
        mask: RING_MASK,
        pointerEvents: 'none',
      }}
    />
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

/**
 * Arcs for `total` beats laid over `span` degrees starting at `start`, as
 * conic-gradient stops: beats up to `current` in the attacker's colour, the
 * rest faint-ink hairlines, `gap` degrees of nothing after each. Returns
 * the stops and the arc of the beat in flight.
 */
function beatArcs(total: number, current: number, hue: string, start: number, span: number, gap: number) {
  const seg = span / total;
  const stops: string[] = [];
  for (let i = 0; i < total; i++) {
    const a0 = start + i * seg;
    const a1 = a0 + seg - gap;
    stops.push(`${i <= current ? hue : poster.inkFaint} ${a0}deg ${a1}deg`, `transparent ${a1}deg ${a0 + seg}deg`);
  }
  const active = current < total
    ? { a0: start + current * seg, a1: start + (current + 1) * seg - gap }
    : null;
  return { stops, active };
}

/** Combat state — N equal arcs around the ring, one per attack step.
 *  Resolved segments are solid in the attacker's colour (gold = you, red
 *  = rival), the active segment pulses, upcoming segments are faint-ink
 *  hairlines. */
function CombatRing({ combat }: { combat: NonNullable<CombatProgress> }) {
  const hue = combat.attackerIsMe ? poster.you : poster.rival;
  const gap = 6;
  const { stops, active } = beatArcs(combat.total, combat.currentBeat, hue, 0, 360, gap);
  return (
    <>
      <Ring background={`conic-gradient(from -${gap / 2}deg, ${stops.join(', ')})`} />
      {active && <PulsingArc from={-gap / 2} a0={active.a0} a1={active.a1} hue={hue} />}
    </>
  );
}

/**
 * The ring as the turn itself: three arcs clockwise from the top — prepare,
 * battle, prepare. Arcs behind the current phase are ink, the current one
 * is the owner's colour, those ahead are faint. While the battle is fought
 * its arc splits into one notch per attack step, the notch in flight
 * pulsing.
 */
function ThirdsRing({ phase, combat, hue }: { phase: TurnPhase; combat: CombatProgress; hue: string }) {
  const at = PHASES.indexOf(phase);
  const gap = 8;
  const third = 360 / PHASES.length;
  const stops: string[] = [];
  let active: { a0: number; a1: number } | null = null;
  for (let i = 0; i < PHASES.length; i++) {
    const a0 = i * third;
    const end = `transparent ${a0 + third - gap}deg ${a0 + third}deg`;
    if (PHASES[i] === 'battle' && phase === 'battle' && combat) {
      // The beats share the battle's arc: notch gaps between them, and the
      // arc's own gap after the last.
      const notch = 4;
      const beats = beatArcs(combat.total, combat.currentBeat, hue, a0, third - gap + notch, notch);
      stops.push(...beats.stops.slice(0, -1), end);
      active = beats.active;
      continue;
    }
    const fill = i < at ? poster.ink : i === at ? hue : poster.inkFaint;
    stops.push(`${fill} ${a0}deg ${a0 + third - gap}deg`, end);
  }
  const from = gap / 2;
  return (
    <>
      <Ring background={`conic-gradient(from ${from}deg, ${stops.join(', ')})`} />
      {active && <PulsingArc from={from} a0={active.a0} a1={active.a1} hue={hue} />}
    </>
  );
}
