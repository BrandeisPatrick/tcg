import { motion } from 'framer-motion';
import type { DamageType } from '@/engine/types';
import { damageFxColor } from '../tokens';

/**
 * "Card got hit" reaction — layered, type-coloured, and held bright so it's
 * clearly noticeable without ever shaking the card. Three stacked overlays:
 *   1. colour wash — snaps in, HOLDS bright for most of the duration, then fades
 *   2. edge ring   — a crisp colour-matched border + inset glow
 *   3. core pop     — a quick near-white centre flash at impact, for punch
 * KO adds a dark vignette + wine colour and runs a touch longer.
 *
 * The colour tells you the damage type (bullet = vermillion, spirit = plum,
 * pure = teal, KO = wine); the HP-number pulse (useStatTick) tells you the
 * amount. Mount it keyed by the hit's `seq` so each new hit replays. Fills its
 * positioned parent (the hero card) — render inside a slot with
 * `position: relative` and a matching `borderRadius` (inherited).
 */
export function DamageFlash({ type, ko = false, durationMs = 1200, delayMs = 0 }: {
  type: DamageType;
  ko?: boolean;
  durationMs?: number;
  /** Hold before the flash plays — used by the attack choreographer to sync
   *  the flash to the tracer's impact moment. */
  delayMs?: number;
}) {
  const color = damageFxColor(type, ko);
  const dur = (ko ? Math.max(durationMs, 1400) : durationMs) / 1000;
  const delay = delayMs / 1000;
  // Hold the peak bright through most of the window, then fade — this is the
  // difference between a 240ms blip and a clearly-readable reaction.
  const holdOpacity = ko ? [0, 0.92, 0.8, 0] : [0, 0.82, 0.78, 0];
  const holdTimes = ko ? [0, 0.05, 0.62, 1] : [0, 0.06, 0.55, 1];
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <>
      {/* 1 — colour wash (held bright) */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: holdOpacity }}
        transition={{ duration: dur, delay, ease, times: holdTimes }}
        style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          pointerEvents: 'none', zIndex: 6,
          background: ko
            ? `radial-gradient(ellipse at center, ${color}77, ${color}40 45%, rgba(0,0,0,0.55) 100%)`
            : `radial-gradient(ellipse at center, ${color}73, ${color}30 58%, transparent 85%)`,
        }}
      />

      {/* 2 — edge ring: crisp border + inset glow */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: ko ? [0, 1, 0.85, 0] : [0, 0.95, 0.85, 0] }}
        transition={{ duration: dur, delay, ease, times: holdTimes }}
        style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          pointerEvents: 'none', zIndex: 7,
          border: `2px solid ${color}`,
          boxShadow: `inset 0 0 24px ${color}, inset 0 0 8px ${color}`,
        }}
      />

      {/* 3 — impact core pop: quick near-white centre flash for punch */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 1.18 }}
        animate={{ opacity: [0, 0.7, 0], scale: [1.18, 1, 0.96] }}
        transition={{ duration: 0.2, delay, ease, times: [0, 0.4, 1] }}
        style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          pointerEvents: 'none', zIndex: 8,
          background: `radial-gradient(ellipse at center, #fff8ee, ${color}55 40%, transparent 70%)`,
        }}
      />
    </>
  );
}
