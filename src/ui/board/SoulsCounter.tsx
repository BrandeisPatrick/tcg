import { motion } from 'framer-motion';
import { poster } from '../poster';
import { Souls, scale } from '../hud';
import { useStatTick } from './useStatTick';

/**
 * Your souls, beside End Turn: Deadlock's soul wisp and the number in ink on
 * a paper tag with an ink keyline, `size` px tall. It pulses as the count
 * changes.
 */
export function SoulsCounter({ souls, size }: { souls: number; size: number }) {
  const tick = useStatTick(souls);
  return (
    <motion.div
      role="img"
      aria-label={`Your souls: ${souls}`}
      title="Souls"
      data-souls-plate
      animate={tick ? { scale: [1, 1.1, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        height: size,
        minWidth: size + 18,
        boxSizing: 'border-box',
        flexShrink: 0,
        padding: '0 10px 0 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: poster.paper,
        borderRadius: 6,
        boxShadow: `inset 0 0 0 1.5px ${poster.ink}`,
      }}
    >
      <Souls n={souls} size={scale.title} tone="paper" />
    </motion.div>
  );
}
