import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CardFrame } from '../card/CardFrame';
import { fonts } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { PatronSigil, scale } from '../hud';

/** Reveal hold in ms — Board's completeAction timer must match. */
export const CARD_REVEAL_MS = 1350;

/**
 * Drives the item / hero reveal animation off `G.action`. While the engine's
 * action is `state: 'begin'` and matches an `item` (an active item used) or a
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
  const matching = action && action.state === 'begin' && (action.kind === 'item' || action.kind === 'skill');
  return (
    <AnimatePresence>
      {matching && (
        <CardPlayOverlay
          key={action.id}
          cardId={action.cardId}
          caster={action.by === '0' ? 'P0' : 'P1'}
          kind={action.kind === 'skill' ? 'skill' : 'item'}
          onSkip={onSkip}
        />
      )}
    </AnimatePresence>
  );
}

/** Dark Deadlock tag — the caption and hint plates above and below the print. */
const tagStyle = {
  display: 'inline-block',
  background: `linear-gradient(180deg, ${poster.slateLit} 0%, ${poster.slate} 100%)`,
  color: poster.cream,
  ...clipBoth(chamfer(4)),
  fontFamily: fonts.display,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  lineHeight: 1,
  whiteSpace: 'nowrap',
} as const;

export function CardPlayOverlay({ cardId, caster, kind = 'item', onSkip }: {
  cardId: string; caster: 'P0' | 'P1'; kind?: 'item' | 'skill'; onSkip?: () => void;
}) {
  const isOwn = caster === 'P0';
  // Owner accent on the caption: gold for you, sapphire for the rival.
  const accent = isOwn ? poster.you : poster.rival;
  const verb = 'used';
  const { isMobile } = useViewport();
  const dur = CARD_REVEAL_MS / 1000;
  // Once the action has resolved the overlay is only fading out; it must not
  // keep swallowing taps meant for the board underneath.
  const present = useIsPresent();
  // Desktop: anchor the reveal to the left margin so the board — where the
  // item's effect is about to land — stays readable behind it. Phones center it
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
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        transition={{ duration: dur, times: [0, 0.12, 0.82, 1] }}
        onClick={onSkip}
        style={{
          position: 'fixed', inset: 0,
          background: poster.scrim,
          pointerEvents: present && onSkip ? 'auto' : 'none',
          cursor: present && onSkip ? 'pointer' : undefined,
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
      {/* Caption above the card — a dark tag keyed in the caster's colour,
          with the patron's sigil. A static wrapper centres it: framer's `y`
          would overwrite a translateX on the animated element itself. */}
      <div style={{
        position: 'fixed', left: anchorLeft, top: 'calc(50% - 218px)',
        transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 73,
      }}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: [0, 1, 1, 0], y: [-8, 0, 0, -8] }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: dur, times: [0, 0.12, 0.82, 1] }}
        >
          <span style={{
            ...tagStyle,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '6px 12px 6px 9px',
            boxShadow: `inset 0 0 0 1.5px ${accent}`,
            fontSize: scale.label,
            color: accent,
          }}>
            <PatronSigil side={isOwn ? 'you' : 'rival'} size={14} />
            {isOwn ? `You ${verb}` : `Rival ${verb}`}
          </span>
        </motion.div>
      </div>
      {/* Skip hint — fades in after the card lands so it never competes with
          the reveal pop itself. It leaves with the scrim: an exit that kept
          the entry's 0.6s delay left the hint alone on screen for a second
          after the card had gone — over the hand strip, on a phone. */}
      {onSkip && (
        <div style={{
          position: 'fixed', left: anchorLeft, top: 'calc(50% + 200px)',
          transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 73,
        }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ delay: 0.6, duration: 0.35 }}
          >
            <span style={{ ...tagStyle, padding: '6px 12px', fontSize: scale.floor, color: poster.creamDim }}>
              Tap to skip
            </span>
          </motion.div>
        </div>
      )}
    </>
  );
}
