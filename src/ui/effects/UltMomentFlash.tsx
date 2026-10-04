import { useContext, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { fonts } from '../tokens';
import { poster, chamfer, PAPER_MOTTLE, clipBoth } from '../poster';
import { FxImpulseContext } from './fx/FxImpulse';
import { useFxCalm } from './fx/FxMotionContext';
import { useStage } from './fx/stage/FxStage';
import { chads, ring, sparks } from './fx/stage/emitters';

/**
 * Surfaces the dramatic screen-fill + nameplate when an ultimate is cast.
 * Driven by `G.action` with `kind: 'ult'` and `state: 'begin'`. Board.tsx
 * owns the dismissal timing via `completeAction`.
 *
 * The name plate is dropped onto the table from above — large and tipped
 * toward the viewer, its shadow far beneath it — and where it lands the
 * table jumps: every card bobs, a shockwave rolls out under them, sparks
 * and paper fly, and speed lines burst from behind the plate.
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

/** ms into the overlay when the plate hits the table. */
const PLATE_LANDS = 250;

export function UltFlashOverlay({ name, caster }: { name: string; caster: string }) {
  // Owner accent: gold for you, red for the rival.
  const isOwn = caster === 'P0';
  const accent = isOwn ? poster.you : poster.rival;
  const calm = useFxCalm();

  // The landing: the whole table jumps, and the stage throws the rest.
  const bus = useContext(FxImpulseContext);
  useEffect(() => {
    if (!bus || calm) return;
    const t = setTimeout(() => bus.emitAll({ kind: 'wave', strength: 0.8 }), PLATE_LANDS);
    return () => clearTimeout(t);
  }, [bus, calm]);
  useStage((s) => s.at(PLATE_LANDS, (stage) => {
    const at = { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
    const reach = Math.max(window.innerWidth, window.innerHeight) * 0.7;
    stage.add(ring({ at, r0: 80, r1: reach, color: accent, width: 8, life: 720 }));
    stage.add(ring({ at, r0: 60, r1: reach * 0.8, color: poster.cream, width: 3, life: 760, delay: 80 }));
    stage.add(sparks({ at, seed: 31, count: 26, color: accent, speed: [300, 900], lift: [200, 620], density: stage.density }));
    stage.add(chads({ at, seed: 37, count: 14, colors: [poster.paper, accent, poster.ink], speed: [160, 520], lift: [320, 700], size: [5, 9], spread: Math.PI * 2, density: stage.density }));
  }));

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
      {/* The room dims at its edges so the plate is the brightest thing in it. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.8, 0] }}
        transition={{ duration: 2.2, times: [0, 0.12, 0.7, 1] }}
        style={{
          position: 'fixed', inset: 0,
          background: 'radial-gradient(ellipse at 50% 42%, transparent 30%, rgba(0, 0, 0, 0.55) 100%)',
          pointerEvents: 'none',
          zIndex: 98,
        }}
      />
      {/* Speed lines — a printed burst racing out from behind the plate. */}
      {!calm && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{ opacity: [0, 0.5, 0.24, 0], scale: [0.6, 1.2, 1.45, 1.6], rotate: [0, 5, 9, 12] }}
          transition={{ duration: 1.5, delay: PLATE_LANDS / 1000 - 0.04, times: [0, 0.14, 0.6, 1], ease: 'easeOut' }}
          style={{
            position: 'fixed', left: '50%', top: '42%',
            width: '150vmax', height: '150vmax', marginLeft: '-75vmax', marginTop: '-75vmax',
            borderRadius: '50%',
            background: `repeating-conic-gradient(from 0deg, ${accent} 0deg 2deg, transparent 2deg 5deg, ${poster.cream} 5deg 5.8deg, transparent 5.8deg 11deg)`,
            maskImage: 'radial-gradient(circle, transparent 0 14%, black 26%, black 52%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 0 14%, black 26%, black 52%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 98,
          }}
        />
      )}
      {/* Diagonal slashes — hard-edged printed bands sweeping across, one
          each way. */}
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
      {!calm && (
        <motion.div
          initial={{ x: '110%', opacity: 0 }}
          animate={{ x: '-120%', opacity: [0, 0.7, 0.4, 0] }}
          transition={{ duration: 0.8, delay: 0.12, ease: [0.2, 0.7, 0.5, 1] }}
          style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, right: 0,
            background: `linear-gradient(65deg, transparent 47%, ${poster.cream} 47%, ${poster.cream} 51%, transparent 51%)`,
            pointerEvents: 'none',
            zIndex: 99,
          }}
        />
      )}
      {/* Name plate — a cream paper plate with an owner sticker, dropped
          onto the table from the viewer's side. */}
      <motion.div
        initial={calm ? { opacity: 0, scale: 0.6, y: 20 } : { opacity: 0, scale: 2, y: -46, rotateX: 58 }}
        animate={calm
          ? { opacity: [0, 1, 1, 0], scale: [0.6, 1.06, 1, 0.96], y: [20, 0, 0, -10] }
          : {
            opacity: [0, 1, 1, 1, 0],
            scale: [2, 0.93, 1.04, 1, 0.96],
            y: [-46, 5, 0, 0, -14],
            rotateX: [58, -9, 0, 0, -34],
            // drop-shadow follows the chamfered silhouette (box-shadow would
            // be clipped): far below the plate in the air, tight under it once
            // it has landed.
            filter: [
              'drop-shadow(0px 70px 30px rgba(0,0,0,0.2))', 'drop-shadow(0px 4px 6px rgba(0,0,0,0.6))',
              'drop-shadow(0px 14px 26px rgba(0,0,0,0.45))', 'drop-shadow(0px 14px 26px rgba(0,0,0,0.45))', 'drop-shadow(0px 30px 30px rgba(0,0,0,0.2))',
            ],
          }}
        transition={{ duration: 2.3, times: calm ? [0, 0.12, 0.85, 1] : [0, PLATE_LANDS / 2300, 0.17, 0.85, 1] }}
        style={{
          position: 'fixed',
          left: 0, right: 0,
          top: '38%',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 100,
          transformPerspective: 900,
          filter: 'drop-shadow(0px 14px 26px rgba(0,0,0,0.45))',
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
