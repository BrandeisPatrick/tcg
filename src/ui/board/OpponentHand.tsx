import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { spring } from '../tokens';
import { poster } from '../poster';
import { scale } from '../hud';

/** The mini back on the scoreboard, px; at most this many cards are drawn
 *  stacked on it (the number beside it says how many there are). */
const MINI = { w: 13, h: 18, step: 1.5 } as const;
const MAX_STACK = 3;

/**
 * The rival's hand on the scoreboard: one small card back with the count
 * beside it. Every card the rival holds is its own element stacked on the
 * mini back (`data-hand-card`), so the motion layer can fly a draw to it and
 * hide it while the card is in the air; the root (`data-hand="rival"`) is
 * where a card with no element of its own flies from or to.
 */
export function RivalHandChip({ cards }: { cards: CardInstance[] }) {
  const total = cards.length;
  return (
    <span
      role="img"
      aria-label={`Rival's hand: ${total} card${total === 1 ? '' : 's'}`}
      data-hand="rival"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
    >
      <span style={{ position: 'relative', width: MINI.w + MINI.step * (MAX_STACK - 1), height: MINI.h, flexShrink: 0 }}>
        {total === 0 && (
          <span style={{
            position: 'absolute', left: 0, top: 0, width: MINI.w, height: MINI.h, boxSizing: 'border-box',
            borderRadius: 2, border: `1px dashed ${EMPTY_DASH}`,
          }} />
        )}
        <AnimatePresence>
          {cards.map((c, i) => {
            // The top few sit offset into a little stack; the rest lie under them.
            const depth = Math.min(MAX_STACK - 1, total - 1 - i);
            return (
              <motion.span
                key={c.iid}
                data-hand-card={c.iid}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
                transition={spring.default}
                style={{
                  position: 'absolute', top: 0,
                  left: (MAX_STACK - 1 - depth) * MINI.step,
                  width: MINI.w, height: MINI.h, zIndex: i,
                  display: 'block',
                }}
              >
                <CardBack radius={2} mini />
              </motion.span>
            );
          })}
        </AnimatePresence>
      </span>
      <span aria-hidden style={{
        fontWeight: 800, fontSize: scale.body, lineHeight: 1, color: poster.cream,
        fontVariantNumeric: 'tabular-nums',
      }}>{total}</span>
    </span>
  );
}

/** An empty pile's dashed outline: light enough to show on the teal-black. */
export const EMPTY_DASH = 'rgba(232, 224, 204, 0.34)';

/** Face-down card — Deadlock's teal-black with a thin light keyline that
 *  stands it off the table, a darker inner edge, and the printer's dial mark
 *  in faint cream (dropped on a `mini` back, too small to read). Static by
 *  design: the border pulse is the draft's "live pick" signal. */
export function CardBack({ radius, mini = false }: { radius: number; mini?: boolean }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      boxSizing: 'border-box',
      borderRadius: radius,
      background: `linear-gradient(160deg, ${poster.slateLit} 0%, ${poster.slate} 70%)`,
      border: `${mini ? 1 : 1.5}px solid rgba(232, 224, 204, 0.42)`,
      boxShadow: mini
        ? '0 1px 2px rgba(0, 0, 0, 0.5)'
        : 'inset 0 0 0 2px rgba(4, 10, 10, 0.75), inset 0 0 0 3px rgba(232, 224, 204, 0.08), 0 4px 12px rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {!mini && (
        <svg viewBox="0 0 40 40" width="58%" fill="none" stroke={poster.creamFaint} strokeWidth="1.6" aria-hidden>
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
      )}
    </div>
  );
}
