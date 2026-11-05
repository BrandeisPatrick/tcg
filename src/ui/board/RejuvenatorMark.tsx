import { motion } from 'framer-motion';
import type { PlayerState } from '@/engine/types';
import { fonts } from '../tokens';
import { poster } from '../poster';
import { MapIcon } from './MapIcon';

/**
 * The Rejuvenator on a side's vitals rule, while it holds one (it took the
 * Mid-Boss): the game's own Rejuvenator icon on an ink disc, the shop's badge,
 * riding a green tag with the revives left and the last round they are good
 * through — "2 · R7", in the stencil numerals of the shop's discount tag. A
 * hero of that side that falls comes straight back in place, one revive spent.
 * Nothing is drawn without credits.
 */
export function RejuvenatorMark({ ps, isMobile }: { ps: PlayerState; isMobile: boolean }) {
  if (ps.reviveCredits <= 0) return null;
  const n = ps.reviveCredits;
  const said = `Rejuvenator: ${n} revive${n === 1 ? '' : 's'}, through round ${ps.reviveUntilRound}`;
  const disc = isMobile ? 17 : 20;
  return (
    <motion.span
      key={`${n}-${ps.reviveUntilRound}`}
      role="img"
      aria-label={said}
      title={said}
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 20 }}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0, paddingLeft: disc - 5 }}
    >
      <MapIcon
        kind="rejuvenator"
        size={disc}
        round
        ground={poster.ink}
        ink={poster.green}
        zoom={0.86}
        style={{ position: 'absolute', left: 0, top: '50%', marginTop: -disc / 2, zIndex: 1 }}
      />
      <span style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 3,
        padding: isMobile ? '2px 5px 1px 8px' : '2px 7px 1px 10px',
        borderRadius: 999,
        background: poster.green,
        color: poster.ink,
        fontFamily: fonts.display,
        fontSize: isMobile ? 9.5 : 11,
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>
        {n}
        <span style={{ opacity: 0.6 }}>· R{ps.reviveUntilRound}</span>
      </span>
    </motion.span>
  );
}
