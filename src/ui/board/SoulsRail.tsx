import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { palette, fonts } from '../tokens';

interface Props {
  rivalSouls: number;
  yourSouls: number;
}

const RECT_WIDTH = 40;
const RECT_HEIGHT = 10;
const GAP = 4;
const CAP = 10;   // matches SOULS_MAX — full stack renders without an overflow tail

/** Hook: track the current "slot count" for a player. The slot count
 *  rebases to the current souls when souls go UP (a refill / gain) and
 *  stays put when souls go DOWN (a spend), so a spend leaves the slot
 *  visible-but-empty rather than removing it from the strip. */
function useSlotCount(souls: number): number {
  const [slots, setSlots] = useState(souls);
  const prev = useRef(souls);
  useEffect(() => {
    if (souls > prev.current) {
      // Refill / gain → rebase the slot count to the new total.
      setSlots(souls);
    } else if (souls > slots) {
      // Safety: external state out-of-sync (e.g. dev hot-reload).
      setSlots(souls);
    }
    prev.current = souls;
  }, [souls, slots]);
  return slots;
}

/**
 * Vertical stack of flat brass rectangles pinned to the right edge of
 * the 3×3 board grid. Each soul is one chip-like rectangle; rival's
 * stack anchors at the TOP edge of the grid, yours at the BOTTOM.
 * Stacks grow inward as souls accumulate.
 *
 * Reads as a tally of chip tokens viewed edge-on — minimal, flat,
 * close to the board so the gauge feels part of the battlefield
 * rather than a separate UI strip.
 */
export function SoulsRail({ rivalSouls, yourSouls }: Props) {
  // Slot count rebases on refill but stays put on spend, so a spent
  // soul leaves the slot visible-but-empty rather than removing it.
  const rivalSlots = useSlotCount(rivalSouls);
  const yourSlots = useSlotCount(yourSouls);
  // Mirror the parent grid's row layout (180 px bench / 290 px lane /
  // 180 px bench, gap 40) so each stack sits vertically centred inside
  // its bench row — directly aligned with the "Rival · Bench" /
  // "Your · Bench" labels which BenchRow renders at row centre.
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        // Hug the right edge of the board grid so the rail reads as
        // part of the battlefield, not an off-board chrome strip.
        right: -6,
        top: 0,
        bottom: 0,
        width: RECT_WIDTH + 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 40,
        pointerEvents: 'none',
      }}
    >
      {/* Rival's stack — centred within the 180 px rival-bench row so
          the stack midline matches the "Rival · Bench" label midline. */}
      <div style={{
        flex: '0 0 180px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Stack filled={rivalSouls} slots={rivalSlots} side="rival" />
      </div>

      {/* Lane row — empty spacer so the bottom stack lands inside the
          your-bench row, not the lane. */}
      <div style={{ flex: '0 0 290px' }} />

      {/* Your stack — centred within the 180 px your-bench row so the
          stack midline matches the "Your · Bench" label midline. */}
      <div style={{
        flex: '0 0 180px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Stack filled={yourSouls} slots={yourSlots} side="you" />
      </div>
    </div>
  );
}

function Stack({ filled, slots, side }: { filled: number; slots: number; side: 'rival' | 'you' }) {
  // Clamp render to CAP rects; show "+N" overflow tail in dim mahogany
  // for any souls past the cap. Cap is a soft guard — V1 economy
  // shouldn't push past ~6 in normal play.
  const rendered = Math.min(slots, CAP);
  const overflow = Math.max(0, slots - CAP);
  // Rival reads top-down (array index 0 sits at the top edge, newest
  // rect at the inner end of the stack). Your stack reads bottom-up
  // via column-reverse (array index 0 sits at the bottom edge, newest
  // rect on top of the pile).
  const flexDirection = side === 'rival' ? 'column' : 'column-reverse';
  // Compute which slot indices count as "filled" — the first `filled`
  // entries (in pile order) are full, the rest sit empty. For your
  // stack we want the EMPTY slots at the inner end so it visually
  // reads as a pile that's been drawn down from the top.
  const isFilled = (i: number) => i < filled;
  return (
    <div style={{
      flex: '0 0 auto',
      display: 'flex',
      flexDirection,
      alignItems: 'center',
      gap: GAP,
    }}>
      <AnimatePresence initial={false}>
        {Array.from({ length: rendered }).map((_, i) => (
          <motion.span
            key={`${side}-${i}`}
            initial={{ opacity: 0, scaleX: 0.3 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.3 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'relative',
              display: 'block',
              width: RECT_WIDTH,
              height: RECT_HEIGHT,
              borderRadius: 1,
              // Slot frame — same warm-mahogany outline whether filled
              // or empty. Matches `palette.textDim` of the bench labels
              // so the rail reads as the same typographic register.
              border: `1px solid ${palette.textDim}`,
              background: 'transparent',
              overflow: 'hidden',
            }}
          >
            <motion.span
              aria-hidden
              animate={{ opacity: isFilled(i) ? 0.4 : 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                inset: 0,
                // Translucent mahogany wash — the parchment bleeds through
                // so a filled chip reads as ink-on-paper density, matching
                // the bench labels' typographic weight rather than a solid
                // block. Empty stays at opacity 0.
                background: palette.textDim,
              }}
            />
          </motion.span>
        ))}
      </AnimatePresence>
      {overflow > 0 && (
        <span style={{
          fontFamily: fonts.ui,
          fontSize: 10, fontWeight: 700,
          color: palette.textDim,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>+{overflow}</span>
      )}
    </div>
  );
}
