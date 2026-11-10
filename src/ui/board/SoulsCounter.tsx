import { motion } from 'framer-motion';
import { poster } from '../poster';
import { Souls, scale } from '../hud';
import { useStatTick } from './useStatTick';

/**
 * Your souls — Deadlock's souls counter in the turn row beside End Turn: the
 * HUD's dark green plate with the soul wisp and a mint number, `size` px
 * tall. It pulses as the count changes.
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
        padding: '0 11px 0 9px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: poster.plate,
        borderRadius: 6,
        boxShadow: `inset 0 0 0 1.5px ${poster.plateEdge}, inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 3px 8px rgba(0, 0, 0, 0.45)`,
      }}
    >
      <Souls n={souls} size={scale.title} />
    </motion.div>
  );
}
