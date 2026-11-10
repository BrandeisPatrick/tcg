import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';

interface Props {
  cards: CardInstance[];
  /** Where the fan's centre is, px across the stage. */
  centre: number;
  /** Where the backs' top edge hangs, px down the stage (negative: above
   *  it, so only the lower part peeks in). */
  top: number;
}

/** A back's size and the overlap between backs, stage px. */
const BACK = { w: 40, h: 56, overlap: -14, chip: 18 } as const;
/** At most this many backs are drawn: the chip says how many there are. */
const MAX_BACKS = 4;

// The rival's hand, face down: the heroes and items it has drawn and not yet
// played — a back rises in at the top edge as it draws and sinks away as the
// card goes onto the board. Seen across the table the fan opens downward
// from a top anchor: the outer backs tilt out at their feet and ride up a
// little.
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
 * The rival's card backs, peeking in at the very top edge of the stage as
 * Pokémon TCG Pocket's do: hung above the table with only their lower part
 * showing, so they take no room of the table's own. A chip beside them says
 * how many cards the rival holds.
 */
export function OpponentHand({ cards, centre, top }: Props) {
  const total = cards.length;
  const { w, h, overlap, chip } = BACK;
  const shown = cards.slice(0, MAX_BACKS);
  const fanW = shown.length * w + Math.max(0, shown.length - 1) * overlap;
  return (
    <div
      role={total > 0 ? 'img' : undefined}
      aria-label={total > 0 ? `Rival's hand: ${total} card${total === 1 ? '' : 's'}` : undefined}
      data-hand="rival"
      style={{
        position: 'absolute',
        left: centre - fanW / 2,
        top,
        width: fanW,
        height: h,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        // Purely decorative — never intercept clicks meant for the board.
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <AnimatePresence>
        {shown.map((c, i) => (
          <motion.div
            key={c.iid}
            // The motion layer finds the back a draw flies to by it.
            data-hand-card={c.iid}
            // Rises in from above the edge; sinks back up as it is played.
            initial={{ opacity: 0, y: -h * 0.6 }}
            animate={{ opacity: 1, y: fanY(i, shown.length), rotate: fanRotation(i, shown.length) }}
            exit={{ opacity: 0, y: -h * 0.6, transition: { duration: 0.25 } }}
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
            <CardBack radius={7} />
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
              // Beside the fan, in the strip of it that shows.
              left: fanW + 6,
              top: h - top - chip - 4,
              minWidth: chip,
              height: chip,
              padding: '0 5px',
              boxSizing: 'border-box',
              borderRadius: chip / 2,
              background: poster.ink,
              border: `1.5px solid ${poster.rival}`,
              color: poster.cream,
              fontFamily: fonts.display,
              fontSize: 11,
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
 *  the printer's dial mark in faint cream, set low enough on the plate to
 *  show where only its foot peeks in. Static by design: the border pulse is
 *  the draft's "live pick" signal, not the rival's hand. */
export function CardBack({ radius }: { radius: number }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      boxSizing: 'border-box',
      borderRadius: radius,
      background: poster.panel,
      border: `2px solid ${poster.edge}`,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
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
