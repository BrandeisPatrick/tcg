import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';

/**
 * The rival's hand in the strip above the sheet, face down: a small fan of
 * card backs, closed up as it grows so it never passes `maxWidth`, and a chip
 * that says how many cards there are. Every card is its own back
 * (`data-hand-card`), so the motion layer can fly a draw to it and hide it
 * while the card is in the air; the root (`data-hand="rival"`) is where a
 * card with no back of its own flies from or to.
 */
export function OpponentHand({ cards, height, maxWidth }: { cards: CardInstance[]; height: number; maxWidth: number }) {
  const total = cards.length;
  const w = Math.round(height * 0.71);
  const step = total > 1 ? Math.min(w * 0.62, (maxWidth - w) / (total - 1)) : w;
  const fanW = total > 0 ? w + step * (total - 1) : w;
  const chip = 18;
  return (
    <div
      role="img"
      aria-label={`Rival's hand: ${total} card${total === 1 ? '' : 's'}`}
      data-hand="rival"
      style={{ display: 'flex', alignItems: 'center', gap: 6, height, flexShrink: 0, pointerEvents: 'none' }}
    >
      <div style={{ position: 'relative', width: fanW, height, flexShrink: 0 }}>
        {total === 0 && (
          <span style={{
            position: 'absolute', left: 0, top: 0, width: w, height, boxSizing: 'border-box',
            borderRadius: 4, border: `1.5px dashed ${EMPTY_DASH}`,
          }} />
        )}
        <AnimatePresence>
          {cards.map((c, i) => (
            <motion.div
              key={c.iid}
              data-hand-card={c.iid}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={spring.default}
              style={{ position: 'absolute', top: 0, left: i * step, width: w, height, zIndex: i }}
            >
              <CardBack radius={4} small />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <span aria-hidden style={{
        minWidth: chip, height: chip, padding: '0 5px', boxSizing: 'border-box',
        borderRadius: chip / 2,
        background: poster.ink,
        border: `1.5px solid ${poster.rival}`,
        color: poster.cream,
        fontFamily: fonts.display, fontSize: 11, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}>{total}</span>
    </div>
  );
}

/** An empty pile's dashed outline: light enough to show on the dark ground. */
export const EMPTY_DASH = 'rgba(232, 224, 204, 0.34)';

/** Face-down card — the lobby's ink plate: charcoal panel, thin edge and the
 *  printer's dial mark in faint cream. Flat: no light on it. A `small` back
 *  (the rival's hand, a chip-size pile) keeps a thinner edge. Static by
 *  design: the border pulse is the draft's "live pick" signal. */
export function CardBack({ radius, small = false }: { radius: number; small?: boolean }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      boxSizing: 'border-box',
      borderRadius: radius,
      background: poster.panel,
      border: `${small ? 1.5 : 2}px solid ${small ? 'rgba(232, 224, 204, 0.3)' : poster.edge}`,
      boxShadow: small ? '0 1px 3px rgba(0, 0, 0, 0.45)' : '0 4px 12px rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <svg viewBox="0 0 40 40" width="62%" fill="none" stroke={poster.creamFaint} strokeWidth={small ? 2.4 : 1.6} aria-hidden>
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
