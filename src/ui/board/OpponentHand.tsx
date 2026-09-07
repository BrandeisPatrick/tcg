import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { spring, text } from '../tokens';
import { poster } from '../poster';

interface Props {
  cards: CardInstance[];
}

// Mirror of the player's Hand fanning math, but inverted: cards open downward
// from a top anchor, so they look like an opponent's hand seen across the sheet.
function fanRotation(i: number, total: number): number {
  if (total <= 2) return 0;
  const center = (total - 1) / 2;
  const offset = i - center;
  const max = Math.min(6, 18 / total);
  return -offset * max;
}
function fanY(i: number, total: number): number {
  if (total <= 2) return 0;
  const center = (total - 1) / 2;
  const offset = Math.abs(i - center);
  return -Math.min(offset * offset * 1.6, 18);
}
function cardOverlap(total: number): number {
  if (total <= 2) return 14;
  if (total <= 3) return 8;
  if (total <= 4) return -8;
  if (total <= 5) return -22;
  if (total <= 6) return -38;
  if (total <= 7) return -50;
  return -60;
}

const CARD_W = 64;
const CARD_H = 92;

export function OpponentHand({ cards }: Props) {
  const total = cards.length;
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      gap: 0,
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: '4px 0 8px',
      minHeight: CARD_H + 4,
      // Purely decorative strip — never intercept clicks meant for the
      // board rows it can overlap.
      pointerEvents: 'none',
    }}>
      {/* Ambient shade behind the fan — a flat pool of neutral black where
          the rival's card backs peek over the sheet's top edge, so the ink
          plates read as resting there instead of pasted on the paper.
          Painted before the cards; their transforms stack them above it. */}
      {total > 0 && (
        <div aria-hidden style={{
          position: 'absolute',
          left: '50%',
          bottom: -6,
          width: Math.min(560, total * (CARD_W + 8) + 120),
          height: 54,
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse 50% 100% at 50% 100%, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.14) 55%, transparent 78%)',
          filter: 'blur(2px)',
        }} />
      )}
      {/* The strip hangs above the sheet on the dark scene, so the empty
          label is cream, not ink. */}
      {total === 0 && (
        <div style={{ ...text.label, fontSize: 11, letterSpacing: '0.18em', color: poster.creamDim, padding: '20px 0' }}>
          Rival — no cards in hand
        </div>
      )}
      <AnimatePresence>
        {cards.map((c, i) => {
          const rot = fanRotation(i, total);
          const y = fanY(i, total);
          return (
            <motion.div
              key={c.iid}
              layoutId={`oppcard-${c.iid}`}
              layout
              initial={{ opacity: 0, y: -50, scale: 0.6 }}
              animate={{ opacity: 1, y, scale: 1, rotate: rot }}
              exit={{ opacity: 0, y: 60, scale: 0.5, transition: { duration: 0.25 } }}
              transition={spring.default}
              style={{
                marginLeft: i === 0 ? 0 : cardOverlap(total),
                transformOrigin: 'top center',
                zIndex: i,
                width: CARD_W,
                height: CARD_H,
              }}
            >
              <CardBack />
            </motion.div>
          );
        })}
      </AnimatePresence>
      {/* No count chip — the rival PatronPlaque on the sheet's corner is the
          canonical hand counter; the fan itself just shows the cards. */}
    </div>
  );
}

/** Face-down card — the lobby's ink plate: charcoal panel, thin edge and
 *  the printer's dial mark centred in faint cream. Static by design: the
 *  border pulse is the draft's "live pick" signal, not the rival's hand. */
function CardBack() {
  return (
    <div style={{
      width: '100%', height: '100%',
      boxSizing: 'border-box',
      borderRadius: 10,
      background: poster.panel,
      border: `2px solid ${poster.edge}`,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <svg viewBox="0 0 40 40" width="38%" height="38%" fill="none" stroke={poster.creamFaint} strokeWidth="1.4" aria-hidden>
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
