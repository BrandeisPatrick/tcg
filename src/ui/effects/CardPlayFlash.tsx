import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CardFrame } from '../card/CardFrame';
import { fonts } from '../tokens';
import { poster, chamfer } from '../poster';
import { useViewport } from '../hooks/useViewport';

/** Reveal hold in ms — Board's completeAction timer must match. */
export const CARD_REVEAL_MS = 1350;

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
  /** Resolve the action reveal early (tap-to-skip). Wired by Board to
   *  `completeAction` so the player never has to sit through the full hold. */
  onSkip?: () => void;
}

export function CardPlayFlash({ G, onSkip }: Props) {
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
          onSkip={onSkip}
        />
      )}
    </AnimatePresence>
  );
}

/** Ink tag — the caption and hint plates above and below the print. */
const tagStyle = {
  display: 'inline-block',
  background: poster.ink,
  color: poster.cream,
  clipPath: chamfer(4),
  WebkitClipPath: chamfer(4),
  fontFamily: fonts.display,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  lineHeight: 1,
  whiteSpace: 'nowrap',
} as const;

export function CardPlayOverlay({ cardId, caster, kind = 'play', onSkip }: {
  cardId: string; caster: 'P0' | 'P1'; kind?: 'play' | 'skill'; onSkip?: () => void;
}) {
  const isOwn = caster === 'P0';
  // Owner accent on the caption: gold for you, red for the rival.
  const accent = isOwn ? poster.you : poster.rival;
  const verb = kind === 'skill' ? 'used' : 'played';
  const { isMobile } = useViewport();
  const dur = CARD_REVEAL_MS / 1000;
  // Desktop: anchor the reveal to the left margin so the board — where the
  // spell is about to land — stays readable behind it. Phones center it
  // (no side margin to borrow).
  const anchorLeft = isMobile ? '50%' : 'clamp(170px, 20vw, 330px)';
  return (
    <>
      {/* Scrim over the scene so the print pops off the sheet behind it.
          When skippable it also captures the tap — a click anywhere resolves
          the action immediately instead of waiting out the full hold. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.22, 0.22, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: dur, times: [0, 0.12, 0.82, 1] }}
        onClick={onSkip}
        style={{
          position: 'fixed', inset: 0,
          background: poster.scrim,
          pointerEvents: onSkip ? 'auto' : 'none',
          cursor: onSkip ? 'pointer' : undefined,
          zIndex: 70,
        }}
      />
      {/* The card itself, side-anchored, with a brief pop-in / hold / fade-out.
          A static outer wrapper handles centering so framer-motion's
          `transform: scale(...) translateY(...)` doesn't clobber the
          `translate(-50%, -50%)` we'd need on the same element. */}
      <div style={{
        position: 'fixed',
        left: anchorLeft, top: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 72,
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.45, y: 20, rotateY: 38 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [0.45, 0.92, 0.86, 0.82],
            y: [20, 0, 0, -10],
            // Flips face-up toward the viewer as it lands — "dealt onto the
            // sheet" rather than just fading in.
            rotateY: [38, -4, 0, 0],
            // Scripted cast sheen: `--cast` sweeps CardShine's light bar
            // across the print once it has landed (the only card CSS
            // variable still read now that the glare layers are gone).
            ['--cast' as string]: [0, 0, 1, 1],
          }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: dur, times: [0, 0.12, 0.82, 1], ease: [0.22, 1, 0.36, 1] }}
          style={{
            transformPerspective: 1100,
            filter: 'drop-shadow(0 16px 36px rgba(0,0,0,0.55))',
          }}
        >
          <CardFrame cardId={cardId} size="full" physical={false} castSheen hideStats={kind === 'skill'} />
        </motion.div>
      </div>
      {/* Caption above the card — an ink tag keyed in the caster's colour. */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: [0, 1, 1, 0], y: [-8, 0, 0, -8] }}
        transition={{ duration: dur, times: [0, 0.12, 0.82, 1] }}
        style={{
          position: 'fixed',
          left: anchorLeft,
          transform: 'translateX(-50%)',
          top: 'calc(50% - 218px)',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 73,
        }}
      >
        <span style={{
          ...tagStyle,
          padding: '7px 14px 8px',
          border: `1.5px solid ${accent}`,
          fontSize: 10.5,
        }}>
          <span aria-hidden style={{
            display: 'inline-block', width: 7, height: 7, marginRight: 9,
            background: accent, verticalAlign: '0.05em',
          }} />
          {isOwn ? `You ${verb}` : `Rival ${verb}`}
        </span>
      </motion.div>
      {/* Skip hint — fades in after the card lands so it never competes with
          the reveal pop itself. */}
      {onSkip && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 0.6, duration: 0.35 }}
          style={{
            position: 'fixed',
            left: anchorLeft,
            transform: 'translateX(-50%)',
            top: 'calc(50% + 200px)',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 73,
          }}
        >
          <span style={{ ...tagStyle, padding: '6px 12px 7px', fontSize: 10, color: poster.creamDim }}>
            Tap anywhere to continue
          </span>
        </motion.div>
      )}
    </>
  );
}
