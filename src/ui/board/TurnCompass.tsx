import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { useCombatProgress, type CombatProgress } from '../effects/CombatProgressContext';

/** Where a turn stands. It runs Prepare → Battle → Prepare → End Turn;
 *  'regroup' is the second prepare phase. */
export type TurnPhase = 'prepare' | 'battle' | 'regroup';

/** The phase in words — for the dial's accessible name only. */
const PHASE_WORD: Record<TurnPhase, string> = { prepare: 'Prepare', battle: 'Battle', regroup: 'Prepare' };

interface Props {
  isMyTurn: boolean;
  turn: number;
  phase: TurnPhase;
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
 * The phase: each has its own look, and none is a word. Preparing, the dial
 * is quiet — only the spinner moves, a faint arc sweeping slowly round the
 * edge. The battle is loud: the ring becomes one arc per attack step,
 * filling in the attacker's colour, and level bars like a music player's
 * stand out all round the dial and bounce. Every attack step lands as a
 * thump — the bars jump, the dial pops, a ring bursts off it. Once the
 * battle is fought the bars settle into a short fringe that stays until the
 * turn changes hands, so the second prepare phase reads as the first with
 * the battle behind it. It all changes with the turn button's label — Enter
 * Battle while the battle is ahead, End Turn once it is fought — so the two
 * always tell the same story.
 *
 * This component is the single mid-board focal token; combat does NOT
 * introduce any sibling chrome, and nothing is hung off one side of it.
 */
// Disc diameter. The duel divider column is ~180px of open paper — at the
// old 36px the compass read as a stray dot rather than the board's focal
// token.
const SIZE = 54;
// Ring mask hole tracks the disc radius (ring layers sit at inset -3).
const RING_MASK = `radial-gradient(circle, transparent ${SIZE / 2 - 3}px, #000 ${SIZE / 2 - 2}px)`;

export function TurnCompass({ isMyTurn, turn, phase, combatOverride }: Props) {
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

  const battle = phase === 'battle';
  // The attack step in flight. Each new one lands as a thump: the two
  // keyframes are the same, and swapping from one name to the other is what
  // starts the animation over.
  const beat = battle && combat && combat.currentBeat < combat.total ? combat.currentBeat : null;
  const thump = beat === null ? undefined : `turn-compass-thump-${beat % 2 ? 'b' : 'a'} 0.4s ease-out`;
  const name = `Turn ${turn} · ${isMyTurn ? 'Your Move' : "Rival's Move"} · ${PHASE_WORD[phase]} phase`;

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
      }}
    >
      <LevelBars phase={phase} hue={hue} thump={thump} />

      {/* The dial itself — everything that pops together on a thump. */}
      <div className="turn-compass-thump" style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: thump,
        ...thumpFrom(1.09),
      }}>
        {/* Paper disc — flat cream with an ink keyline and one inner
            hairline ring, printed on the divider like a dial. No shadow, no
            blur. Through the battle the hairline takes the attacker's
            colour. */}
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
            border: battle ? `1.5px solid ${hue}` : `1px solid ${poster.inkRule}`,
            transition: 'border-color 0.25s ease',
            pointerEvents: 'none',
          }}
        />

        {combat ? <CombatRing combat={combat} /> : <IdleSweepRing />}

        {/* Centred readout — a micro "TURN" caption over the turn numeral.
            Static, so it is always readable in a single beat (also during
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
      </div>

      {/* Ring-bursts — one on every isMyTurn flip (it replaces the old "Your
          Move / Rival's Move" banner, and is skipped on first mount so it
          doesn't fire on game load), and a heavier one for every attack
          step of the battle. */}
      <AnimatePresence>
        {rippleKey > 0 && <RingBurst key={`turn-${rippleKey}`} hue={hue} weight={1.5} reach={1.65} />}
        {beat !== null && <RingBurst key={`beat-${beat}`} hue={hue} weight={2.5} reach={1.9} />}
      </AnimatePresence>

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
        @keyframes turn-compass-ring-in {
          from { opacity: 0; }
        }
        .turn-compass-ring {
          animation: turn-compass-ring-in 0.3s ease-out;
        }
        .turn-compass-sweep {
          animation: turn-compass-sweep-spin 8s linear infinite, turn-compass-ring-in 0.3s ease-out;
        }
        @keyframes turn-compass-bar-bounce {
          0%, 100% { transform: scaleY(0.3); }
          50%      { transform: scaleY(1); }
        }
        .turn-compass-bar {
          animation: turn-compass-bar-bounce 600ms ease-in-out infinite;
        }
        @keyframes turn-compass-thump-a {
          from { transform: scale(var(--thump-from)); }
        }
        @keyframes turn-compass-thump-b {
          from { transform: scale(var(--thump-from)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .turn-compass-bar { animation: none; transform: scaleY(0.75); }
          .turn-compass-thump { animation: none !important; }
        }
      `}</style>
    </motion.div>
  );
}

/** How far out a thump starts, for the keyframes to read. */
const thumpFrom = (scale: number) => ({ '--thump-from': scale }) as CSSProperties;

/** A ring that leaves the dial's edge, grows to `reach` times its size and
 *  fades. Mounted under AnimatePresence with a fresh key for every burst. */
function RingBurst({ hue, weight, reach }: { hue: string; weight: number; reach: number }) {
  return (
    <motion.div
      aria-hidden
      initial={{ scale: 1, opacity: 0.75 }}
      animate={{ scale: reach, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: `${weight}px solid ${hue}`,
        pointerEvents: 'none',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

/** A stretch of the ring in one ink, in degrees clockwise from the top. */
type Arc = { a0: number; a1: number; ink: string };

/** A ring layer: its arcs as a conic gradient with nothing between them,
 *  shown only through the ring mask. */
function ringLayer(arcs: Arc[], from = '0deg') {
  const stops: string[] = [];
  let at = 0;
  for (const arc of arcs) {
    if (arc.a0 > at) stops.push(`transparent ${at}deg ${arc.a0}deg`);
    stops.push(`${arc.ink} ${arc.a0}deg ${arc.a1}deg`);
    at = arc.a1;
  }
  if (at < 360) stops.push(`transparent ${at}deg 360deg`);
  return {
    position: 'absolute' as const,
    inset: -3,
    borderRadius: '50%',
    background: `conic-gradient(from ${from}, ${stops.join(', ')})`,
    WebkitMask: RING_MASK,
    mask: RING_MASK,
    pointerEvents: 'none' as const,
  };
}

/** The spinner — a thin faint-ink arc orbiting slowly (~8s) around the disc.
 *  Hard stops so it reads as a printed dial mark, not a glowing halo. Like
 *  the battle's ring it arrives on a short fade, so a change of ring is
 *  never a jump. */
function IdleSweepRing() {
  return (
    <div
      aria-hidden
      className="turn-compass-sweep"
      style={ringLayer([{ a0: 300, a1: 360, ink: poster.inkFaint }], 'var(--compass-sweep, 0deg)')}
    />
  );
}

/** Combat state — N equal arcs around the ring, one per attack step.
 *  Resolved segments are solid in the attacker's colour (gold = you, red
 *  = rival), the active segment pulses, upcoming segments are faint-ink
 *  hairlines. */
function CombatRing({ combat }: { combat: NonNullable<CombatProgress> }) {
  const hue = combat.attackerIsMe ? poster.you : poster.rival;
  const gap = 6;
  const width = 360 / combat.total - gap;
  const arcs: Arc[] = [];
  for (let i = 0; i < combat.total; i++) {
    const a0 = gap / 2 + i * (width + gap);
    arcs.push({ a0, a1: a0 + width, ink: i <= combat.currentBeat ? hue : poster.inkFaint });
  }
  const active = combat.currentBeat < combat.total ? arcs[combat.currentBeat] : null;
  return (
    <>
      <div aria-hidden className="turn-compass-ring" style={ringLayer(arcs)} />
      {/* The beat in flight, on a layer whose opacity pulses, so it is
          unmistakable while the resolved arcs stay calm. */}
      {active && (
        <motion.div
          aria-hidden
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={ringLayer([active])}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The level bars
// ---------------------------------------------------------------------------

/** Bars stand every BAR_STEP degrees round the dial, except at the two
 *  poles, where the chevron and the divider are. Long and short alternate. */
const BAR_STEP = 12;
const BARS_A_SIDE = 180 / BAR_STEP - 1;
/** A long and a short bar at full stretch, and the fringe the long ones are
 *  left at once the battle is fought. */
const BAR_LONG = 10;
const BAR_SHORT = 6;
const BAR_FRINGE = 3;
/** Each bar bounces to its own beat so they never move as one. */
const BAR_BEAT_MS = [520, 680, 440, 760, 600, 480, 720, 560, 640, 500, 700, 460, 740, 580];

/**
 * Level bars, like a music player's, bent round the dial: nothing while the
 * battle is ahead, bouncing through it, a short even fringe after it. The
 * long bars are ink and the short ones between them the attacker's colour;
 * only the long ones stay on as the fringe. They open like a fan, from the
 * top pole down, and all jump outward together on every thump. A bar and its
 * twin across the dial share a length and a beat, so the two sides always
 * match.
 */
function LevelBars({ phase, hue, thump }: { phase: TurnPhase; hue: string; thump: string | undefined }) {
  const battle = phase === 'battle';
  const fought = phase === 'regroup';
  return (
    <div
      aria-hidden
      className="turn-compass-thump"
      style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none', animation: thump, ...thumpFrom(1.2) }}
    >
      {Array.from({ length: BARS_A_SIDE * 2 }, (_, n) => {
        const i = n % BARS_A_SIDE;
        const long = i % 2 === 0;
        const angle = (i + 1) * BAR_STEP * (n < BARS_A_SIDE ? 1 : -1);
        return (
          // Turned about the dial's centre; the bar grows outward from just
          // past the ring.
          <span key={n} style={{ position: 'absolute', left: 0, top: 0, transform: `rotate(${angle}deg)` }}>
            <span
              className={battle ? 'turn-compass-bar' : undefined}
              style={{
                position: 'absolute',
                left: -1,
                bottom: SIZE / 2 + 5,
                width: 2,
                height: battle ? (long ? BAR_LONG : BAR_SHORT) : fought && long ? BAR_FRINGE : 0,
                background: battle ? (long ? poster.ink : hue) : poster.inkDim,
                transformOrigin: '50% 100%',
                animationDuration: `${BAR_BEAT_MS[i]}ms`,
                // Negative delays start them out of step.
                animationDelay: `${-i * 137}ms`,
                transition: `height 0.25s ease ${i * 12}ms, background-color 0.25s ease`,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}
