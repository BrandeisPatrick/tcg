import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../tokens';
import { poster, chamfer, soulCoin } from '../poster';
import { boardRows } from './BoardTable';
import { useViewport } from '../hooks/useViewport';

interface Props {
  rivalSouls: number;
  yourSouls: number;
}

const CAP = 10;   // matches SOULS_MAX — full rack renders without an overflow tail

/** Hook: track the current "slot count" for a player. The slot count
 *  rebases to the current souls when souls go UP (a refill / gain) and
 *  stays put when souls go DOWN (a spend), so a spend leaves the socket
 *  visible-but-empty rather than removing it from the rack. */
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
 * Soul racks — one per player, pinned to the right edge of the sheet like
 * a tally column printed in the margin. Each rack is a slim paper tab
 * holding a stack of flat gold soul-coins: gaining a soul pops a coin into
 * the next socket, spending one leaves the socket as an empty ink outline.
 * The stencilled numeral at the rack's anchor end is the at-a-glance count.
 * Rival's rack anchors at the TOP row, yours at the BOTTOM.
 */
export function SoulsRail({ rivalSouls, yourSouls }: Props) {
  // Slot count rebases on refill but stays put on spend, so a spent
  // soul leaves the socket visible-but-empty rather than removing it.
  const rivalSlots = useSlotCount(rivalSouls);
  const yourSlots = useSlotCount(yourSouls);
  const { isMobile } = useViewport();
  // Mirror the parent grid's row layout (via the shared boardRows
  // metrics) so each rack sits vertically centred inside its bench row.
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        // Hug the right edge of the board grid so the racks read as part
        // of the print, not an off-board chrome strip.
        right: isMobile ? -4 : -18,
        top: 0,
        bottom: 0,
        width: isMobile ? 30 : 38,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: boardRows.gap(isMobile),
        pointerEvents: 'none',
      }}
    >
      {/* Rival's rack — centred within the rival-bench row. */}
      <div style={{
        flex: `0 0 ${boardRows.bench(isMobile)}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Rack filled={rivalSouls} slots={rivalSlots} side="rival" mobile={isMobile} />
      </div>

      {/* Lane row — empty spacer so the bottom rack lands inside the
          your-bench row, not the lane. */}
      <div style={{ flex: `0 0 ${boardRows.lane(isMobile)}px` }} />

      {/* Your rack — centred within the your-bench row. */}
      <div style={{
        flex: `0 0 ${boardRows.bench(isMobile)}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Rack filled={yourSouls} slots={yourSlots} side="you" mobile={isMobile} />
      </div>
    </div>
  );
}

function Rack({ filled, slots, side, mobile }: {
  filled: number;
  slots: number;
  side: 'rival' | 'you';
  mobile: boolean;
}) {
  // Souls gate every play — at 12px the rack was nearly invisible margin
  // noise. 14px coins + a bigger stencilled count keep it glanceable.
  const coin = mobile ? 10 : 14;
  // Always show at least 3 sockets so the tab reads as a coin rack even
  // before the economy spins up; clamp to CAP and show a "+N" overflow
  // tail for any souls past it. Cap is a soft guard — V1 economy
  // shouldn't push past ~6 in normal play.
  const rendered = Math.min(Math.max(slots, 3), CAP);
  const overflow = Math.max(0, slots - CAP);
  // Rival's rack reads top-down (numeral at the top edge, coins growing
  // toward the lane); yours reads bottom-up via column-reverse (numeral
  // at the bottom edge). Socket index 0 sits at the anchor end; the
  // first `filled` sockets hold coins, the rest sit empty.
  const isFilled = (i: number) => i < filled;
  return (
    <div style={{
      display: 'flex',
      flexDirection: side === 'rival' ? 'column' : 'column-reverse',
      alignItems: 'center',
      gap: mobile ? 3 : 4,
      padding: mobile ? '6px 4px' : '7px 5px',
      borderRadius: 0,
      // Paper tab — a chamfered band with a hairline rule, flat like the
      // rest of the print.
      background: poster.paperBand,
      border: `1px solid ${poster.inkRule}`,
      clipPath: chamfer(4),
      WebkitClipPath: chamfer(4),
    }}>
      {/* Stencilled count — the at-a-glance readout at the anchor end. */}
      <span style={{
        fontFamily: fonts.display,
        fontSize: mobile ? 11 : 15,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: poster.ink,
        padding: '1px 0 2px',
      }}>
        {filled}
      </span>

      {Array.from({ length: rendered }).map((_, i) => (
        <span
          key={`${side}-${i}`}
          style={{
            position: 'relative',
            // Empty socket — a printed ink outline.
            ...soulCoin(coin, true),
          }}
        >
          {/* Gold soul-coin — pops in on gain, shrinks away on spend. Sits
              on inset 0 so its fill covers the socket's outline. */}
          <motion.span
            initial={false}
            animate={{ opacity: isFilled(i) ? 1 : 0, scale: isFilled(i) ? 1 : 0.35 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24, mass: 0.7 }}
            style={{
              ...soulCoin(coin),
              position: 'absolute',
              inset: 0,
            }}
          />
        </span>
      ))}

      {overflow > 0 && (
        <span style={{
          fontFamily: fonts.display,
          fontSize: 10,
          color: poster.inkDim,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>+{overflow}</span>
      )}
    </div>
  );
}
