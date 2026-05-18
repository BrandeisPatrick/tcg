import { motion, AnimatePresence } from 'framer-motion';
import { palette, fonts } from './tokens';

export interface FloaterEntry {
  id: string;
  iid: string;        // target instance id
  value: number;      // negative = damage, positive = heal
  kind: 'attack' | 'spirit' | 'pure' | 'heal' | 'face';
  x: number;
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

export function DamageFloaters({ entries }: { entries: FloaterEntry[] }) {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 70 }}>
      <AnimatePresence>
        {entries.map((e) => {
          const isHeal = e.value > 0;
          const color = isHeal ? palette.success : colorFor(e.kind);
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: 1, y: -56, scale: 1.15 }}
              exit={{ opacity: 0, y: -84, scale: 0.9 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                left: e.x - 24,
                top: e.y - 12,
                color,
                fontFamily: fonts.display,
                fontSize: Math.abs(e.value) >= 5 ? 28 : 22,
                fontWeight: 700,
                textShadow: `0 0 12px ${color}cc, 0 2px 4px rgba(0,0,0,0.8)`,
                width: 48,
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
