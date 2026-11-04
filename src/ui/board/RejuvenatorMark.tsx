import { motion } from 'framer-motion';
import type { PlayerState } from '@/engine/types';
import { fonts } from '../tokens';
import { poster } from '../poster';

/**
 * The Rejuvenator on a side's vitals rule, while it holds one (it took the
 * Mid-Boss): a green tag with the revives left and the last round they are
 * good through — "+2 · R7". A hero of that side that falls comes straight
 * back in place, one revive spent. Nothing is drawn without credits.
 */
export function RejuvenatorMark({ ps, isMobile }: { ps: PlayerState; isMobile: boolean }) {
  if (ps.reviveCredits <= 0) return null;
  const n = ps.reviveCredits;
  const said = `Rejuvenator: ${n} revive${n === 1 ? '' : 's'}, through round ${ps.reviveUntilRound}`;
  return (
    <motion.span
      key={`${n}-${ps.reviveUntilRound}`}
      role="img"
      aria-label={said}
      title={said}
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 20 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        flexShrink: 0,
        padding: isMobile ? '1px 4px' : '1px 6px',
        borderRadius: 3,
        background: poster.green,
        color: poster.ink,
        fontFamily: fonts.ui,
        fontWeight: 800,
        fontSize: isMobile ? 9 : 10.5,
        lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {/* A plus: the revive. */}
      <svg aria-hidden viewBox="0 0 10 10" width={isMobile ? 7 : 8} height={isMobile ? 7 : 8}>
        <path d="M4 1h2v3h3v2H6v3H4V6H1V4h3z" fill={poster.ink} />
      </svg>
      {n}
      <span style={{ fontWeight: 600, opacity: 0.75 }}>· R{ps.reviveUntilRound}</span>
    </motion.span>
  );
}
