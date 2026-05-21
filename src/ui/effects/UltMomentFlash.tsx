import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { palette, fonts } from '../tokens';

/**
 * Surfaces the dramatic screen-fill + nameplate when an ultimate is cast.
 * Driven by `G.action` with `kind: 'ult'` and `state: 'begin'`. Board.tsx
 * owns the dismissal timing via `completeAction`.
 */
interface Props {
  G: GameState;
}

export function UltMomentFlash({ G }: Props) {
  const action = G.action;
  if (!action || action.state !== 'begin' || action.kind !== 'ult') {
    return <AnimatePresence />;
  }
  const data = CARDS_BY_ID[action.cardId];
  if (!data) return <AnimatePresence />;
  return (
    <AnimatePresence>
      <UltFlashOverlay
        key={action.id}
        name={data.name}
        caster={action.by === '0' ? 'P0' : 'P1'}
      />
    </AnimatePresence>
  );
}

export function UltFlashOverlay({ name, caster }: { name: string; caster: string }) {
  // Tint by caster: gold for you, wine for rival.
  const accent = caster === 'P0' ? palette.accent : palette.danger;

  return (
    <>
      {/* Screen-fill flash */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.4, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2.2, times: [0, 0.10, 0.65, 1] }}
        style={{
          position: 'fixed', inset: 0,
          background: `radial-gradient(ellipse at center, ${accent}, transparent 70%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          zIndex: 98,
        }}
      />
      {/* Diagonal slash bars (Kingdom Hearts / FGO vibe) */}
      <motion.div
        initial={{ x: '-110%', opacity: 0 }}
        animate={{ x: '120%', opacity: [0, 0.85, 0.5, 0] }}
        transition={{ duration: 0.9, ease: [0.2, 0.7, 0.5, 1] }}
        style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, right: 0,
          background: `linear-gradient(115deg, transparent 38%, ${accent}99 47%, ${accent} 50%, ${accent}99 53%, transparent 62%)`,
          pointerEvents: 'none',
          zIndex: 99,
        }}
      />
      {/* Name plate */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6, y: 20 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.06, 1, 0.96], y: [20, 0, 0, -10] }}
        transition={{ duration: 2.3, times: [0, 0.12, 0.85, 1] }}
        style={{
          position: 'fixed',
          left: 0, right: 0,
          top: '38%',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          padding: '14px 36px',
          background: `linear-gradient(180deg, rgba(40,20,0,0.85), rgba(20,10,0,0.92))`,
          border: `2px solid ${accent}`,
          borderRadius: 8,
          boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 30px ${accent}aa`,
          backdropFilter: 'blur(6px)',
        }}>
          <span style={{
            fontFamily: fonts.ui, fontSize: 12, fontWeight: 700,
            color: accent,
            textShadow: `0 0 12px ${accent}`,
            marginBottom: 4,
          }}>
            Ultimate · {caster === 'P0' ? 'You' : 'Rival'}
          </span>
          <span style={{
            fontFamily: fonts.ui, fontSize: 22, fontWeight: 700,
            color: '#fff',
            textShadow: `0 2px 8px rgba(0,0,0,0.9), 0 0 18px ${accent}`,
          }}>
            {name}
          </span>
        </div>
      </motion.div>
    </>
  );
}
