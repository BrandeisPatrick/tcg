import { motion, AnimatePresence } from 'framer-motion';
import { palette, fonts } from '../tokens';

export interface FloaterEntry {
  id: string;
  iid: string;        // target instance id
  value: number;      // negative = damage, positive = heal
  kind: 'attack' | 'spirit' | 'pure' | 'heal' | 'face';
  /** x is the horizontal centre of the affected card / face zone. */
  x: number;
  /** y is the TOP edge of the affected card / face zone. The number is rendered
   *  just above this point and floats upward — so the anchor is identical
   *  whether the trigger is combat damage, skill damage, or a heal. */
  y: number;
}

function colorFor(kind: FloaterEntry['kind']): string {
  switch (kind) {
    case 'attack': return palette.text;
    case 'spirit': return palette.spirit;
    case 'pure':   return palette.pure;
    case 'heal':   return palette.success;
    case 'face':   return palette.danger;
  }
}

/**
 * Single source-of-truth renderer for damage / heal numbers. Every damage or
 * heal event — combat hits, retaliation, skill / spell damage, status ticks
 * (Bleed, Djinn's Mark), Abrams' regen, Dynamo healing, face damage — pushes
 * a FloaterEntry into the same array, so the player sees the same number
 * style and the same relative position no matter what triggered it.
 */
export function DamageFloaters({ entries }: { entries: FloaterEntry[] }) {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 86 }}>
      <AnimatePresence>
        {entries.map((e) => {
          const isHeal = e.value > 0;
          const color = isHeal ? palette.success : colorFor(e.kind);
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: 1, y: -32, scale: 1.2 }}
              exit={{ opacity: 0, y: -56, scale: 0.95 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                left: e.x - 30,
                top: e.y - 30,
                color,
                fontFamily: fonts.ui,
                fontSize: 32,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 2px 6px rgba(0,0,0,0.9), 0 0 14px ${color}cc`,
                WebkitTextStroke: '1px rgba(0,0,0,0.55)',
                width: 60,
                textAlign: 'center',
              }}
            >
              {isHeal ? '+' : '−'}{Math.abs(e.value)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
