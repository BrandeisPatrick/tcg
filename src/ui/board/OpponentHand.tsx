import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';

interface Props {
  cards: CardInstance[];
  /** Where the sheet's top edge is, px down from the top of the box the
   *  backs hang in (Board's band above the sheet). */
  edge: number;
  /** Phone-size backs. */
  compact?: boolean;
}

/** A back's size and how much of it shows over the paper's top edge, in
 *  stage px: enough for the printer's dial mark to read. */
const BACK = {
  phone: { w: 40, h: 56, peek: 36, overlap: -14, chip: 18 },
  desktop: { w: 56, h: 80, peek: 46, overlap: -18, chip: 22 },
} as const;
/** At most this many backs are drawn: the chip says how many there are. */
const MAX_BACKS = 4;

// The rival's hand, face down: what it has bought and not yet put on a hero —
// the AI plays each card as soon as it buys it, so a back shows for a beat,
// rising from behind the paper and sinking back as it goes onto a hero. Seen
// across the table the fan opens downward from a top anchor: the outer backs
// tilt out at their feet and ride up a little.
function fanRotation(i: number, total: number): number {
  if (total <= 2) return 0;
  const offset = i - (total - 1) / 2;
  return -offset * Math.min(5, 15 / total);
}
function fanY(i: number, total: number): number {
  if (total <= 2) return 0;
  const offset = Math.abs(i - (total - 1) / 2);
  return -Math.min(offset * offset * 1.6, 8);
}

/**
 * The rival's card backs, hung absolutely at the top edge of the board: they
 * peek over the paper and the rest is tucked behind it (Board stacks the sheet
 * above this box), so they never take room of their own — an empty hand holds
 * no row open and a card held for a beat moves nothing. A chip beside them
 * says how many cards the rival holds.
 */
export function OpponentHand({ cards, edge, compact = false }: Props) {
  const total = cards.length;
  const { w, h, peek, overlap, chip } = compact ? BACK.phone : BACK.desktop;
  const shown = cards.slice(0, MAX_BACKS);
  const fanW = shown.length * w + Math.max(0, shown.length - 1) * overlap;
  return (
    <div
      role={total > 0 ? 'img' : undefined}
      aria-label={total > 0 ? `Rival's hand: ${total} card${total === 1 ? '' : 's'}` : undefined}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: edge - peek,
        height: h,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        // Purely decorative — never intercept clicks meant for the board.
        pointerEvents: 'none',
      }}
    >
      {/* Ambient shade where the backs meet the paper's edge — a flat pool of
          neutral black, so the ink plates read as resting there instead of
          pasted on the scene. Painted first: the backs stack above it. */}
      {total > 0 && (
        <div aria-hidden style={{
          position: 'absolute',
          left: '50%',
          top: peek - 30,
          width: fanW + 90,
          height: 34,
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse 50% 100% at 50% 100%, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.14) 55%, transparent 78%)',
          filter: 'blur(2px)',
        }} />
      )}
      <AnimatePresence>
        {shown.map((c, i) => (
          <motion.div
            key={c.iid}
            // Rises from behind the paper; sinks back behind it as it is played.
            initial={{ opacity: 0, y: peek }}
            animate={{ opacity: 1, y: fanY(i, shown.length), rotate: fanRotation(i, shown.length) }}
            exit={{ opacity: 0, y: peek + 12, transition: { duration: 0.25 } }}
            transition={spring.default}
            style={{
              flex: '0 0 auto',
              marginLeft: i === 0 ? 0 : overlap,
              transformOrigin: 'top center',
              zIndex: i,
              width: w,
              height: h,
            }}
          >
            <CardBack radius={compact ? 7 : 9} />
          </motion.div>
        ))}
      </AnimatePresence>
      <AnimatePresence>
        {total > 0 && (
          <motion.span
            key="count"
            aria-hidden
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.2 } }}
            transition={spring.default}
            style={{
              position: 'absolute',
              // Beside the fan, centred in the strip of it that shows.
              left: `calc(50% + ${fanW / 2 + 6}px)`,
              top: (peek - chip) / 2,
              minWidth: chip,
              height: chip,
              padding: '0 5px',
              boxSizing: 'border-box',
              borderRadius: chip / 2,
              background: poster.ink,
              border: `1.5px solid ${poster.rival}`,
              color: poster.cream,
              fontFamily: fonts.display,
              fontSize: compact ? 11 : 13,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontVariantNumeric: 'tabular-nums',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
            }}
          >
            {total}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Face-down card — the lobby's ink plate: charcoal panel, thin edge and
 *  the printer's dial mark in faint cream, high enough on the plate to show
 *  over the paper's edge. Static by design: the border pulse is the draft's
 *  "live pick" signal, not the rival's hand. */
function CardBack({ radius }: { radius: number }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      boxSizing: 'border-box',
      borderRadius: radius,
      background: poster.panel,
      border: `2px solid ${poster.edge}`,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '12%',
    }}>
      <svg viewBox="0 0 40 40" width="62%" fill="none" stroke={poster.creamFaint} strokeWidth="1.6" aria-hidden>
        <circle cx="20" cy="20" r="15.5" />
        <circle cx="20" cy="20" r="6.5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={20 + Math.cos(a) * 6.5}
              y1={20 + Math.sin(a) * 6.5}
              x2={20 + Math.cos(a) * 15.5}
              y2={20 + Math.sin(a) * 15.5}
            />
          );
        })}
        <circle cx="20" cy="20" r="2" fill={poster.creamFaint} stroke="none" />
      </svg>
    </div>
  );
}
