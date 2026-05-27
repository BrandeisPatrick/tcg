import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CardFrame } from '../card/CardFrame';
import { palette, fonts } from '../tokens';

/**
 * Drives the card / hero reveal animation off `G.action`. While the engine's
 * action is `state: 'begin'` and matches a `play` (spell/equipment) or
 * `skill` (hero activation), the overlay renders the relevant card mid-screen.
 * Ultimates are handled by `UltMomentFlash` instead.
 *
 * Lifecycle is owned by `Board.tsx`: it schedules the `completeAction` move
 * after a fixed hold so dispatch unblocks at the same time the animation
 * naturally finishes. This component is presentational — when action.state
 * flips to `done` (or the action is replaced), the overlay unmounts.
 */
interface Props {
  G: GameState;
}

export function CardPlayFlash({ G }: Props) {
  const action = G.action;
  const matching = action && action.state === 'begin' && (action.kind === 'play' || action.kind === 'skill');
  return (
    <AnimatePresence>
      {matching && (
        <CardPlayOverlay
          key={action.id}
          cardId={action.cardId}
          caster={action.by === '0' ? 'P0' : 'P1'}
          kind={action.kind === 'skill' ? 'skill' : 'play'}
        />
      )}
    </AnimatePresence>
  );
}

export function CardPlayOverlay({ cardId, caster, kind = 'play' }: {
  cardId: string; caster: 'P0' | 'P1'; kind?: 'play' | 'skill';
}) {
  const isOwn = caster === 'P0';
  const accent = isOwn ? palette.accent : palette.danger;
  const verb = kind === 'skill' ? 'used' : 'played';
  return (
    <>
      {/* Soft backdrop tint so the card pops out from the board behind it. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.35, 0.35, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 3.2, times: [0, 0.10, 0.88, 1] }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          pointerEvents: 'none',
          zIndex: 70,
        }}
      />
      {/* The card itself, centered, with a brief pop-in / hold / fade-out.
          A static outer wrapper handles centering so framer-motion's
          `transform: scale(...) translateY(...)` doesn't clobber the
          `translate(-50%, -50%)` we'd need on the same element. */}
      <div style={{
        position: 'fixed',
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 72,
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1.08, 1.0, 0.95],
            y: [20, 0, 0, -10],
          }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 3.2, times: [0, 0.10, 0.88, 1], ease: [0.22, 1, 0.36, 1] }}
          style={{
            filter: `drop-shadow(0 16px 36px rgba(0,0,0,0.55)) drop-shadow(0 0 22px ${accent}88)`,
          }}
        >
          <CardFrame cardId={cardId} size="full" />
        </motion.div>
      </div>
      {/* Caption above the card. */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: [0, 1, 1, 0], y: [-8, 0, 0, -8] }}
        transition={{ duration: 3.2, times: [0, 0.10, 0.88, 1] }}
        style={{
          position: 'fixed',
          left: 0, right: 0,
          top: 'calc(50% - 250px)',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 73,
        }}
      >
        <span style={{
          display: 'inline-block',
          padding: '6px 16px',
          background: `linear-gradient(180deg, rgba(40,20,0,0.85), rgba(20,10,0,0.92))`,
          border: `1.5px solid ${accent}`,
          borderRadius: 999,
          fontFamily: fonts.ui,
          fontSize: 12, fontWeight: 700,
          color: '#fff',
          textShadow: `0 1px 2px rgba(0,0,0,0.9)`,
          boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 18px ${accent}66`,
        }}>
          {isOwn ? `You ${verb}` : `Rival ${verb}`}
        </span>
      </motion.div>
    </>
  );
}
