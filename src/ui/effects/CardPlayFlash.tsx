import { useLayoutEffect, useState } from 'react';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CardFrame } from '../card/CardFrame';
import { fonts } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
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

/** Paper tag — the caption and the hint above and below the print. */
const tagStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  background: poster.paper,
  color: poster.ink,
  boxShadow: `inset 0 0 0 1.5px ${poster.ink}`,
  ...clipBoth(chamfer(4)),
  fontFamily: fonts.display,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  lineHeight: 1,
  whiteSpace: 'nowrap',
} as const;

/** The full card's printed size, px. */
const FULL = { w: 300, h: 420 } as const;
/** The caption's and the hint's row, and the gap between the rows, px. */
const TAG_H = 26;
const GAP = 8;

interface Box { left: number; top: number; width: number; height: number }

/** The sheet's box on screen (`data-sheet`): the reveal is laid out inside
 *  it, so the caption, the card and the hint never reach the hand or the
 *  controls under the sheet. Without a sheet (a gallery, a test) it is the
 *  window. */
function sheetBox(): Box {
  const r = typeof document !== 'undefined' ? document.querySelector('[data-sheet]')?.getBoundingClientRect() : undefined;
  if (r && r.width > 0 && r.height > 0) return { left: r.left, top: r.top, width: r.width, height: r.height };
  const W = typeof window !== 'undefined' ? window.innerWidth : 390;
  const H = typeof window !== 'undefined' ? window.innerHeight : 844;
  return { left: 0, top: 0, width: W, height: H };
}

export function CardPlayOverlay({ cardId, caster, kind = 'item', onSkip }: {
  cardId: string; caster: 'P0' | 'P1'; kind?: 'item' | 'skill'; onSkip?: () => void;
}) {
  const isOwn = caster === 'P0';
  const verb = 'used';
  const dur = CARD_REVEAL_MS / 1000;
  // Once the action has resolved the overlay is only fading out; it must not
  // keep swallowing taps meant for the board underneath.
  const present = useIsPresent();
  const [box, setBox] = useState<Box>(sheetBox);
  useLayoutEffect(() => { setBox(sheetBox()); }, []);
  // The card as large as the sheet has room for, under its caption and over
  // the hint: one centred column, nothing outside the sheet.
  const fit = Math.max(0.4, Math.min(0.92, (box.height - 16 - (TAG_H + GAP) * 2) / FULL.h, (box.width - 16) / FULL.w));
  const fade = { duration: dur, times: [0, 0.12, 0.82, 1] };
  return (
    <>
      {/* Scrim over the scene so the print pops off the sheet behind it.
          When skippable it also captures the tap — a click anywhere resolves
          the action immediately instead of waiting out the full hold. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.22, 0.22, 0] }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        transition={fade}
        onClick={onSkip}
        style={{
          position: 'fixed', inset: 0,
          background: poster.scrim,
          pointerEvents: present && onSkip ? 'auto' : 'none',
          cursor: present && onSkip ? 'pointer' : undefined,
          zIndex: 70,
        }}
      />
      {/* One column on the sheet: who used it, the card, the skip hint. */}
      <div data-card-reveal style={{
        position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: GAP,
        pointerEvents: 'none', zIndex: 72,
      }}>
        {/* Caption — a paper tag with the caster's patron sigil. */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: [0, 1, 1, 0], y: [-8, 0, 0, -8] }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={fade}
          style={{ flex: `0 0 ${TAG_H}px`, display: 'flex', alignItems: 'center' }}
        >
          <span style={{ ...tagStyle, gap: 7, height: TAG_H, padding: '0 12px 0 9px', fontSize: scale.label }}>
            <PatronSigil side={isOwn ? 'you' : 'rival'} size={14} color={isOwn ? poster.ink : poster.red} />
            {isOwn ? `You ${verb}` : `Rival ${verb}`}
          </span>
        </motion.div>
        {/* The card, with a brief pop-in / hold / fade-out. A static box
            holds its place at the fitted size; framer animates inside it. */}
        <div style={{ position: 'relative', flex: '0 0 auto', width: FULL.w * fit, height: FULL.h * fit }}>
          <div style={{
            position: 'absolute', left: '50%', top: '50%', width: FULL.w, height: FULL.h,
            margin: `${-FULL.h / 2}px 0 0 ${-FULL.w / 2}px`,
            transform: `scale(${fit})`,
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 20, rotateY: 38 }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0.5, 1, 0.94, 0.9],
                y: [20, 0, 0, -10],
                // Flips face-up toward the viewer as it lands — "dealt onto the
                // sheet" rather than just fading in.
                rotateY: [38, -4, 0, 0],
                // Scripted cast sheen: `--cast` sweeps CardShine's light bar
                // across the print once it has landed (the only card CSS
                // variable still read now that the glare layers are gone).
                ['--cast' as string]: [0, 0, 1, 1],
              }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ ...fade, ease: [0.22, 1, 0.36, 1] }}
              style={{
                transformPerspective: 1100,
                filter: 'drop-shadow(0 10px 0 rgba(0, 0, 0, 0.25))',
              }}
            >
              <CardFrame cardId={cardId} size="full" physical={false} castSheen hideStats={kind === 'skill'} />
            </motion.div>
          </div>
        </div>
        {/* Skip hint — fades in after the card lands so it never competes with
            the reveal pop itself, and leaves with the scrim. Its row is held
            whether or not it shows, so the card does not move. */}
        <div style={{ flex: `0 0 ${TAG_H}px`, display: 'flex', alignItems: 'center' }}>
          {onSkip && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ delay: 0.6, duration: 0.35 }}
            >
              <span style={{ ...tagStyle, height: 22, padding: '0 10px', fontSize: scale.floor, color: poster.inkSoft }}>
                Tap to skip
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
