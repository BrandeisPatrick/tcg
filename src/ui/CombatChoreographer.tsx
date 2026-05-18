import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AttackPlan, AttackStep } from '@/engine/combat';
import { palette, fonts } from './tokens';

/**
 * Animated walk-through of an attack phase plan.
 *
 * Renders overlay visuals anchored to the attacker/target slot positions:
 * projectile, full-card red flash on the target, shake animation, an HP
 * tick-down indicator showing before→after, and a damage number pop.
 * Walks `plan.steps` one at a time, then invokes `onComplete` so the engine
 * can resolve for real.
 */
interface Props {
  plan: AttackPlan;
  /** Map of slot iid → DOM element for measuring positions. */
  slotRefs: Map<string, HTMLElement>;
  /** Called after all steps animate (or skip is clicked). */
  onComplete: () => void;
  /** ms per step (default 1100). Controls combat tempo. */
  stepDuration?: number;
}

interface ActiveBeat {
  step: AttackStep;
  attackerRect: DOMRect | null;
  targetRect: DOMRect | null;
  /** Cumulative damage on this target including the current step. */
  hpBefore: number;
  hpAfter: number;
}

export function CombatChoreographer({ plan, slotRefs, onComplete, stepDuration = 1100 }: Props) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [done, setDone] = useState(false);
  const skippedRef = useRef(false);

  // Walk through each step, scheduling the next.
  useEffect(() => {
    if (done) return;
    if (plan.steps.length === 0) {
      setDone(true);
      onComplete();
      return;
    }
    if (beatIndex >= plan.steps.length) {
      setDone(true);
      onComplete();
      return;
    }
    const t = setTimeout(() => {
      if (!skippedRef.current) setBeatIndex((i) => i + 1);
    }, stepDuration);
    return () => clearTimeout(t);
  }, [beatIndex, plan.steps.length, stepDuration, done, onComplete]);

  function skip() {
    skippedRef.current = true;
    setDone(true);
    onComplete();
  }

  if (done) return null;

  const step = plan.steps[beatIndex];
  if (!step) return null;

  const attackerEl = slotRefs.get(step.attackerIid);
  const targetEl = step.targetIid ? slotRefs.get(step.targetIid) : null;

  // hpBefore = post-step HP + the damage we're about to deal. Simple and correct.
  const hpAfter = step.predictedHpAfter ?? 0;
  const hpBefore = hpAfter + step.finalDamage;

  const beat: ActiveBeat = {
    step,
    attackerRect: attackerEl?.getBoundingClientRect() ?? null,
    targetRect: targetEl?.getBoundingClientRect() ?? null,
    hpBefore,
    hpAfter,
  };

  return (
    <>
      {/* Dim backdrop to focus attention; keeps board readable but mutes hand */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.22)',
          pointerEvents: 'none',
          zIndex: 70,
        }}
      />

      <AttackBeat key={beatIndex} beat={beat} stepDuration={stepDuration} />

      {/* Skip button — corner overlay, visible during combat */}
      <motion.button
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={skip}
        style={{
          position: 'fixed',
          top: 16, right: 16,
          zIndex: 90,
          padding: '8px 16px',
          background: `linear-gradient(180deg, ${palette.bg1}, ${palette.bg2})`,
          color: palette.text,
          border: `1.5px solid ${palette.accent}`,
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: fonts.display,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        Skip ▶▶
      </motion.button>

      {/* Combat label — top center */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          position: 'fixed',
          top: 24, left: 0, right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 88,
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '8px 18px',
          background: `linear-gradient(90deg, ${palette.bg1}f0, ${palette.bg2}f0)`,
          border: `1.5px solid ${palette.accent}`,
          borderRadius: 999,
          fontFamily: fonts.display,
          fontSize: 12, fontWeight: 800,
          letterSpacing: '0.28em', textTransform: 'uppercase',
          color: palette.text,
          boxShadow: `0 4px 16px rgba(40,20,0,0.4), 0 0 18px ${palette.accent}44`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: palette.accent, boxShadow: `0 0 8px ${palette.accent}`,
          }} />
          <span>Combat · {beatIndex + 1} / {plan.steps.length}</span>
        </span>
      </motion.div>
    </>
  );
}

function AttackBeat({ beat, stepDuration }: { beat: ActiveBeat; stepDuration: number }) {
  const { step, attackerRect, targetRect, hpBefore, hpAfter } = beat;
  if (!attackerRect) return null;

  const sx = attackerRect.left + attackerRect.width / 2;
  const sy = attackerRect.top + attackerRect.height / 2;
  // For face attacks, aim at bottom-center of screen (player avatar zone)
  const tx = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
  const ty = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight - 100;

  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  // Beat is broken into three phases scaled to stepDuration:
  //  - 0%   – 25%:  wind-up (source flash)
  //  - 25%  – 55%:  projectile in flight
  //  - 55%  – 100%: impact, shake, damage number, HP tick — held long enough to read.
  const totalSec = stepDuration / 1000;
  const projectileDuration = totalSec * 0.30;
  const projectileDelay = totalSec * 0.25;
  const impactDelay = totalSec * 0.55;
  const damagePersist = totalSec - impactDelay;

  return (
    <>
      {/* Source flash — small white aura around attacker for the lunge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.1, 1.5] }}
        transition={{ duration: totalSec * 0.30 }}
        style={{
          position: 'fixed',
          left: sx - 30, top: sy - 30,
          width: 60, height: 60,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${palette.accent}cc, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 80,
        }}
      />

      {/* Projectile / swing arc — line that grows from attacker to target */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: [0, 1, 1, 0] }}
        transition={{ duration: projectileDuration, delay: projectileDelay, ease: [0.2, 0.6, 0.4, 1], times: [0, 0.1, 0.85, 1] }}
        style={{
          position: 'fixed',
          left: sx, top: sy - 2,
          width: dist, height: 4,
          background: `linear-gradient(90deg, ${palette.accent}, ${palette.danger}aa, ${palette.danger})`,
          boxShadow: `0 0 12px ${palette.danger}, 0 0 6px ${palette.accent}`,
          transformOrigin: '0 50%',
          transform: `rotate(${angle}rad)`,
          pointerEvents: 'none',
          zIndex: 81,
          borderRadius: 2,
        }}
      />

      {/* Bullet head — a sharp arrow at the impact point arrival */}
      <motion.div
        initial={{ x: 0, y: 0, opacity: 0 }}
        animate={{ x: dx, y: dy, opacity: [0, 1, 1, 0] }}
        transition={{ duration: projectileDuration, delay: projectileDelay, ease: [0.3, 0.5, 0.4, 1] }}
        style={{
          position: 'fixed',
          left: sx - 6, top: sy - 6,
          width: 12, height: 12,
          borderRadius: '50%',
          background: `radial-gradient(circle, #fff, ${palette.accent}, ${palette.danger})`,
          boxShadow: `0 0 14px ${palette.accent}, 0 0 8px ${palette.danger}`,
          pointerEvents: 'none',
          zIndex: 82,
        }}
      />

      {/* === TARGET REACTION === */}
      {targetRect && (
        <>
          {/* Full-card red wash — the card visibly takes the hit. Held longer than other effects. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 0.7, 0.4, 0] }}
            transition={{ duration: damagePersist + 0.15, delay: impactDelay, times: [0, 0.05, 0.18, 0.55, 1] }}
            style={{
              position: 'fixed',
              left: targetRect.left, top: targetRect.top,
              width: targetRect.width, height: targetRect.height,
              background: step.predictedKO
                ? `linear-gradient(180deg, ${palette.danger}, #5a1c1a)`
                : `${palette.danger}`,
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
              borderRadius: 10,
              zIndex: 79,
            }}
          />

          {/* Inner card shake — small horizontal jitter on the card outline only.
              We do this as a translucent overlay drawn over the card with motion that mimics shake. */}
          <motion.div
            initial={{ x: 0, opacity: 0 }}
            animate={{
              x: [0, -6, 6, -4, 4, -2, 0],
              opacity: [0, 1, 1, 1, 1, 1, 0],
            }}
            transition={{ duration: 0.55, delay: impactDelay, times: [0, 0.05, 0.18, 0.32, 0.5, 0.8, 1] }}
            style={{
              position: 'fixed',
              left: targetRect.left - 2, top: targetRect.top - 2,
              width: targetRect.width + 4, height: targetRect.height + 4,
              border: step.predictedKO
                ? `3px solid ${palette.danger}`
                : `2px solid ${palette.danger}`,
              borderRadius: 12,
              boxShadow: step.predictedKO
                ? `0 0 36px ${palette.danger}, inset 0 0 16px ${palette.danger}66`
                : `0 0 22px ${palette.danger}aa, inset 0 0 10px ${palette.danger}55`,
              pointerEvents: 'none',
              zIndex: 84,
            }}
          />

          {/* Impact starburst at the contact point */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0, 1, 0], scale: [0.5, 0.5, 1.6, 2.2] }}
            transition={{ duration: 0.6, delay: impactDelay - 0.05, times: [0, 0.15, 0.4, 1] }}
            style={{
              position: 'fixed',
              left: tx - 45, top: ty - 45,
              width: 90, height: 90,
              borderRadius: '50%',
              background: `radial-gradient(circle, #fff, ${palette.danger}aa, transparent 70%)`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
              zIndex: 83,
            }}
          />

          {/* HP ticker — shows BEFORE → AFTER right above the card so the player sees the damage land. */}
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.9 }}
            animate={{ opacity: [0, 0, 1, 1, 0], y: -14, scale: [0.9, 0.9, 1.06, 1, 0.96] }}
            transition={{ duration: damagePersist + 0.2, delay: impactDelay, times: [0, 0.05, 0.18, 0.7, 1] }}
            style={{
              position: 'fixed',
              left: targetRect.left, top: targetRect.top - 28,
              width: targetRect.width,
              display: 'flex', justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 86,
            }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
              padding: '4px 10px',
              background: `linear-gradient(180deg, rgba(20,10,0,0.92), rgba(40,20,0,0.92))`,
              border: `1.5px solid ${palette.danger}`,
              borderRadius: 6,
              fontFamily: fonts.display, fontWeight: 800,
              boxShadow: `0 4px 12px rgba(0,0,0,0.55), 0 0 16px ${palette.danger}aa`,
            }}>
              <span style={{ color: '#fff', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                {hpBefore}
              </span>
              <span style={{ color: palette.danger, fontSize: 11, letterSpacing: '0.1em' }}>→</span>
              <span style={{
                color: step.predictedKO ? palette.danger : '#fff',
                fontSize: 18,
                fontVariantNumeric: 'tabular-nums',
                textShadow: step.predictedKO ? `0 0 8px ${palette.danger}` : 'none',
              }}>
                {hpAfter}
              </span>
              <span style={{ color: palette.textFaint, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                HP
              </span>
            </span>
          </motion.div>
        </>
      )}

      {/* Damage number pop-up — slower fade so it's legible */}
      <motion.div
        initial={{ opacity: 0, y: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0, 1, 1, 0], y: -46, scale: [0.5, 0.5, 1.35, 1.05, 0.95] }}
        transition={{ duration: damagePersist + 0.25, delay: impactDelay, times: [0, 0.05, 0.18, 0.7, 1] }}
        style={{
          position: 'fixed',
          left: tx - 50, top: ty - 10,
          width: 100,
          textAlign: 'center',
          color: '#fff',
          fontFamily: fonts.display,
          fontSize: step.predictedKO ? 42 : 32,
          fontWeight: 800,
          letterSpacing: '0.02em',
          textShadow: `0 3px 6px rgba(0,0,0,0.9), 0 0 14px ${palette.danger}, 0 0 6px rgba(0,0,0,0.7)`,
          pointerEvents: 'none',
          zIndex: 87,
          WebkitTextStroke: '1px rgba(0,0,0,0.6)',
        }}
      >
        −{step.finalDamage}
      </motion.div>

      {/* KO splash overlay (extra dramatic kill marker) — held longer */}
      {step.predictedKO && (
        <motion.div
          initial={{ opacity: 0, scale: 0.3, rotate: -10 }}
          animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.3, 0.3, 1.15, 1, 0.95], rotate: [-10, -10, 0, 0, 5] }}
          transition={{ duration: damagePersist + 0.3, delay: impactDelay + 0.15, times: [0, 0.1, 0.3, 0.75, 1] }}
          style={{
            position: 'fixed',
            left: tx - 60, top: ty + 24,
            width: 120,
            textAlign: 'center',
            padding: '5px 10px',
            background: `linear-gradient(180deg, #8a2e2a, #5a1c1a)`,
            border: `2px solid #2a0a0a`,
            color: '#fff',
            fontFamily: fonts.display,
            fontSize: 16, fontWeight: 800,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.6), 0 0 20px #c44a3a',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 88,
          }}
        >
          K.O.
        </motion.div>
      )}

      {/* Bonus label (e.g. "Haze +2 vs Stunned") if present */}
      {step.bonusLabel && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: [0, 0, 1, 1, 0], y: -28 }}
          transition={{ duration: damagePersist + 0.15, delay: impactDelay, times: [0, 0.1, 0.25, 0.8, 1] }}
          style={{
            position: 'fixed',
            left: sx - 80, top: sy + 24,
            width: 160,
            textAlign: 'center',
            color: palette.accentWarm,
            fontFamily: fonts.display,
            fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
            zIndex: 87,
          }}
        >
          {step.bonusLabel}
        </motion.div>
      )}
    </>
  );
}

