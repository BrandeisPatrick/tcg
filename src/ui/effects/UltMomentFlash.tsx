import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { fonts } from '../tokens';
import { poster, chamfer, PAPER_MOTTLE, clipBoth } from '../poster';

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
  // Owner accent: gold for you, red for the rival.
  const isOwn = caster === 'P0';
  const accent = isOwn ? poster.you : poster.rival;

  return (
    <>
      {/* Screen-fill strike — one flat overprint of the caster's ink. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.4, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2.2, times: [0, 0.10, 0.65, 1] }}
        style={{
          position: 'fixed', inset: 0,
          background: `${accent}5c`,
          pointerEvents: 'none',
          zIndex: 98,
        }}
      />
      {/* Diagonal slash — a hard-edged printed band sweeping left to right. */}
      <motion.div
        initial={{ x: '-110%', opacity: 0 }}
        animate={{ x: '120%', opacity: [0, 0.85, 0.5, 0] }}
        transition={{ duration: 0.9, ease: [0.2, 0.7, 0.5, 1] }}
        style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, right: 0,
          background: `linear-gradient(115deg, transparent 44%, ${accent} 44%, ${accent} 56%, transparent 56%)`,
          pointerEvents: 'none',
          zIndex: 99,
        }}
      />
      {/* Name plate — a cream paper plate with an owner sticker. */}
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
          // drop-shadow follows the chamfered silhouette (box-shadow would be clipped).
          filter: 'drop-shadow(0 14px 26px rgba(0,0,0,0.45))',
        }}
      >
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          padding: '14px 36px 16px',
          background: poster.paper,
          backgroundImage: PAPER_MOTTLE,
          backgroundSize: '320px 320px',
          color: poster.ink,
          border: `2px solid ${poster.ink}`,
          ...clipBoth(chamfer(8)),
        }}>
          <span style={{
            padding: '4px 9px 5px',
            borderRadius: 3,
            background: accent,
            color: isOwn ? poster.ink : poster.paper,
            fontFamily: fonts.display, fontSize: 10,
            letterSpacing: '0.24em', textTransform: 'uppercase', lineHeight: 1,
            marginBottom: 8,
          }}>
            Ultimate · {isOwn ? 'You' : 'Rival'}
          </span>
          <span style={{
            fontFamily: fonts.display, fontSize: 26,
            letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.05,
            color: poster.ink,
          }}>
            {name}
          </span>
        </div>
      </motion.div>
    </>
  );
}
