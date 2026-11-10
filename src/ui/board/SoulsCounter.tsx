import { motion } from 'framer-motion';
import { fonts } from '../tokens';
import { poster } from '../poster';
import { useStatTick } from './useStatTick';

/**
 * Your souls — a round gold counter at the stage's lower right, where
 * Pokémon TCG Pocket keeps its energy zone: a flat soul coin with the
 * numeral on it, that pulses as the count changes.
 */
export function SoulsCounter({ souls, size }: { souls: number; size: number }) {
  const tick = useStatTick(souls);
  return (
    <motion.div
      role="img"
      aria-label={`Your souls: ${souls}`}
      title="Souls"
      animate={tick ? { scale: [1, 1.14, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: poster.gold,
        border: `2px solid ${poster.ink}`,
        boxShadow: `0 0 0 2px ${poster.paper}, inset 0 0 0 2px rgba(255, 244, 216, 0.55), 0 4px 10px rgba(0, 0, 0, 0.4)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: poster.ink,
        fontFamily: fonts.display, fontSize: souls >= 100 ? 14 : 18, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {souls}
    </motion.div>
  );
}
