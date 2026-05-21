import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { AttackPlan, AttackStep } from '@/engine/combat';
import { palette, fonts } from '../tokens';

/**
 * Position payload pushed at the impact moment of an attack beat. Carries the
 * card-top anchors for the primary target (and the attacker, when retaliation
 * lands), so the parent can feed them into the shared DamageFloaters layer at
 * the same relative position as every other damage / heal event.
 */
export interface BeatImpact {
  step: AttackStep;
  primary: { x: number; y: number; iid: string } | null;
  retaliation: { x: number; y: number; iid: string } | null;
}

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
  /** Fires once per beat at the impact moment with the anchor positions
   *  for the primary hit and (if any) the retaliation hit. The parent uses
   *  this to push a FloaterEntry into the shared damage-number layer so
   *  combat numbers share the same look as skill / spell / heal numbers. */
  onBeatImpact?: (impact: BeatImpact) => void;
  /** ms per step (default 1100). Controls combat tempo. */
  stepDuration?: number;
}

interface ActiveBeat {
  step: AttackStep;
  attackerRect: DOMRect | null;
  targetRect: DOMRect | null;
}

export function CombatChoreographer({ plan, slotRefs, onComplete, onBeatImpact, stepDuration = 1100 }: Props) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [done, setDone] = useState(false);
  const skippedRef = useRef(false);
  // Ref-stashed so the walk effect doesn't list onComplete in its deps;
  // unstable callers (inline arrows in parents) used to retrigger the effect
  // on every parent re-render and replay the same beat multiple times.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (done) return;
    if (plan.steps.length === 0) {
      setDone(true);
      onCompleteRef.current();
      return;
    }
    if (beatIndex >= plan.steps.length) {
      setDone(true);
      onCompleteRef.current();
      return;
    }
    const t = setTimeout(() => {
      if (!skippedRef.current) setBeatIndex((i) => i + 1);
    }, stepDuration);
    return () => clearTimeout(t);
  }, [beatIndex, plan.steps.length, stepDuration, done]);

  function skip() {
    skippedRef.current = true;
    setDone(true);
    onCompleteRef.current();
  }

  // Capture the beat once per beatIndex. Without useMemo, every parent re-render
  // produced a fresh `beat` object identity and framer-motion restarted the
  // tracer/flash animations mid-beat.
  const beat = useMemo<ActiveBeat | null>(() => {
    if (done) return null;
    const step = plan.steps[beatIndex];
    if (!step) return null;
    const attackerEl = slotRefs.get(step.attackerIid);
    const targetEl = step.targetIid ? slotRefs.get(step.targetIid) : null;
    return {
      step,
      attackerRect: attackerEl?.getBoundingClientRect() ?? null,
      targetRect: targetEl?.getBoundingClientRect() ?? null,
    };
  }, [beatIndex, plan.steps, slotRefs, done]);

  if (done || !beat) return null;

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

      <AttackBeat key={beatIndex} beat={beat} stepDuration={stepDuration} onBeatImpact={onBeatImpact} />

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
          fontFamily: fonts.ui,
          fontSize: 12,
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        Skip ▶▶
      </motion.button>

      {/* Combat label — full-width slide-in banner across the duel divider,
          same chrome as TurnBanner so the start of combat reads as a major
          beat (not just a small floating pill). Mounts once at combat start,
          settles centered, then exits when the choreographer unmounts. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          top: '50%',
          left: 0, right: 0,
          transform: 'translateY(-50%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 88,
        }}
      >
        <motion.div
          initial={{ x: '-100vw' }}
          animate={{ x: 0 }}
          exit={{ x: '100vw' }}
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          style={{
            width: '100%',
            padding: '20px 0',
            background: `linear-gradient(90deg, transparent 0%, ${palette.bg1}f5 12%, ${palette.bg2}f5 50%, ${palette.bg1}f5 88%, transparent 100%)`,
            borderTop: `2px solid ${palette.danger}`,
            borderBottom: `2px solid ${palette.danger}`,
            textAlign: 'center',
            fontFamily: fonts.ui,
            fontSize: 26, fontWeight: 700,
            color: palette.text,
            boxShadow: `0 0 36px ${palette.danger}66, 0 8px 24px rgba(40,20,0,0.45)`,
          }}
        >
          Combat · {beatIndex + 1} / {plan.steps.length}
        </motion.div>
      </motion.div>
    </>
  );
}

const AttackBeat = memo(function AttackBeat({ beat, stepDuration, onBeatImpact }: { beat: ActiveBeat; stepDuration: number; onBeatImpact?: (impact: BeatImpact) => void }) {
  const { step, attackerRect, targetRect } = beat;

  // Beat phases scaled to stepDuration:
  //  - 0%   – 15%:  wind-up
  //  - 15%  – 35%:  tracer in flight
  //  - 35%  – 100%: impact (EVA banner sweep + damage number) — most of the
  //    beat is the readable hold so the player can actually parse the banner.
  const totalSec = stepDuration / 1000;
  const projectileDuration = totalSec * 0.22;
  const projectileDelay = totalSec * 0.15;
  const impactDelay = totalSec * 0.35;
  const damagePersist = totalSec - impactDelay;

  // Compute geometry. These are derived before the early return so the
  // impact-callback effect's deps can be stable across renders.
  const sx = attackerRect ? attackerRect.left + attackerRect.width / 2 : 0;
  const sy = attackerRect ? attackerRect.top + attackerRect.height / 2 : 0;
  const tx = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
  const ty = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight - 100;
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  // Fire impact callback at the impact moment so the parent can push damage
  // floaters into the shared layer at the right cinematic beat (not at
  // engine-resolve time, which would land after the banner has faded).
  useEffect(() => {
    if (!onBeatImpact || !attackerRect) return;
    const t = setTimeout(() => {
      // Primary anchor: TOP of the target card, or the synthetic face band's
      // top edge for direct hits. Matches DamageFloaters' "anchor = card top"
      // convention so combat numbers sit at the same relative position as
      // skill / spell / heal numbers.
      const attackerIsTop = sy < window.innerHeight / 2;
      const faceBandTop = attackerIsTop ? window.innerHeight - 156 : 16;
      const primary = step.finalDamage > 0 ? {
        x: tx,
        y: targetRect ? targetRect.top : faceBandTop,
        iid: step.targetIid ?? `face-${attackerIsTop ? '0' : '1'}`,
      } : null;
      const retaliation = step.retaliationDamage > 0 ? {
        x: sx,
        y: attackerRect.top,
        iid: step.attackerIid,
      } : null;
      onBeatImpact({ step, primary, retaliation });
    }, impactDelay * 1000);
    return () => clearTimeout(t);
    // step / attackerRect / targetRect are captured fresh each beat via the
    // memoised `beat` prop; the effect only needs to fire once per beat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!attackerRect) return null;

  return (
    <>
      {/* Tracer — a gradient streak from attacker to target. The rotation must
          go through framer-motion's transform stack (not raw CSS transform),
          because the scaleX animation otherwise overwrites a static
          `transform: rotate(...)` and the tracer renders unrotated. */}
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
          rotate: `${angle}rad`,
          pointerEvents: 'none',
          zIndex: 81,
          borderRadius: 2,
        }}
      />

      {/* Retaliation tracer — defender swings back at the attacker. Only shown
          when the mutual-damage rule applied (active vs active). Same length
          and timing as the primary tracer but rotated 180° so it visually
          counters the incoming swing. */}
      {step.retaliationDamage > 0 && targetRect && (
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: [0, 1, 1, 0] }}
          transition={{ duration: projectileDuration, delay: projectileDelay, ease: [0.2, 0.6, 0.4, 1], times: [0, 0.1, 0.85, 1] }}
          style={{
            position: 'fixed',
            left: tx, top: ty - 2,
            width: dist, height: 4,
            background: `linear-gradient(90deg, ${palette.danger}, ${palette.danger}aa, ${palette.accent})`,
            boxShadow: `0 0 12px ${palette.danger}, 0 0 6px ${palette.accent}`,
            transformOrigin: '0 50%',
            rotate: `${angle + Math.PI}rad`,
            pointerEvents: 'none',
            zIndex: 81,
            borderRadius: 2,
          }}
        />
      )}

      {/* "Damaged by …" feedback for the PRIMARY target — the hero the attacker
          swung at. For face attacks (no targetRect), a synthetic band at the
          receiving player's avatar zone hosts the same banner. */}
      {(() => {
        let rect: { left: number; top: number; width: number; height: number; isCard: boolean };
        if (targetRect) {
          rect = { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height, isCard: true };
        } else {
          const attackerIsTop = sy < window.innerHeight / 2;
          const bandHeight = 140;
          const bandTop = attackerIsTop ? window.innerHeight - bandHeight - 16 : 16;
          const bandWidth = Math.min(560, window.innerWidth - 32);
          const bandLeft = (window.innerWidth - bandWidth) / 2;
          rect = { left: bandLeft, top: bandTop, width: bandWidth, height: bandHeight, isCard: false };
        }
        return (
          <DamageBanner
            rect={rect}
            sourceName={step.attackerName}
            isKO={step.predictedKO}
            damagePersist={damagePersist}
            impactDelay={impactDelay}
            keySuffix={`primary-${step.attackerIid}-${step.targetIid ?? 'face'}`}
          />
        );
      })()}

      {/* "Damaged by …" feedback for the ATTACKER when retaliation lands.
          Mutual-damage rule: the attacker also took a hit, so they get the
          same banner pointing at the defender as the source. */}
      {step.retaliationDamage > 0 && (
        <DamageBanner
          rect={{
            left: attackerRect.left, top: attackerRect.top,
            width: attackerRect.width, height: attackerRect.height,
            isCard: true,
          }}
          sourceName={step.targetName ?? ''}
          isKO={step.attackerKO}
          damagePersist={damagePersist}
          impactDelay={impactDelay}
          keySuffix={`retal-${step.attackerIid}-${step.targetIid ?? 'face'}`}
        />
      )}

      {/* Damage / retaliation numbers are emitted via onBeatImpact into the
          shared DamageFloaters layer — same renderer, same anchor, same look
          as every other damage / heal number on the board. */}

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
            fontFamily: fonts.ui,
            fontSize: 12, fontWeight: 700,
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
});

/**
 * EVA-style damage feedback that sweeps a black banner across a hero card while
 * collapsing the card to grayscale. Used for both the primary target (attacker
 * → defender) and the retaliating attacker (defender → attacker on mutual hit),
 * so any hero that actually takes damage gets the same "Damaged by …" beat.
 *
 * `rect` is the card's bounding box (or a synthetic face band for direct
 * hits); the banner is clipped to it so it never bleeds onto the rest of the
 * board. `keySuffix` keeps each instance's motion divs uniquely keyed across
 * the primary / retaliation pair.
 */
function DamageBanner({
  rect, sourceName, isKO, damagePersist, impactDelay, keySuffix,
}: {
  rect: { left: number; top: number; width: number; height: number; isCard: boolean };
  sourceName: string;
  isKO: boolean;
  damagePersist: number;
  impactDelay: number;
  keySuffix: string;
}) {
  const bannerHeight = Math.max(24, Math.min(36, Math.round(rect.height * 0.24)));
  const koBorderTop = isKO ? 3 : 2;
  // Slightly shorter than damagePersist so the slide-out completes before the
  // beat unmounts the wrapper.
  const bannerDuration = damagePersist * 0.92;
  return (
    <div
      style={{
        position: 'fixed',
        left: rect.left, top: rect.top,
        width: rect.width, height: rect.height,
        overflow: 'hidden',
        borderRadius: rect.isCard ? 10 : 6,
        pointerEvents: 'none',
        zIndex: 84,
        isolation: 'isolate',
      }}
    >
      <motion.div
        key={`wash-${keySuffix}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.95, 0.95, 0] }}
        transition={{ duration: bannerDuration, delay: impactDelay, times: [0, 0.10, 0.85, 1] }}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(20, 20, 24, 0.6)',
          mixBlendMode: 'saturation',
        }}
      />
      <motion.div
        key={`banner-${keySuffix}`}
        initial={{ x: '-110%' }}
        animate={{ x: ['-110%', '0%', '0%', '110%'] }}
        transition={{ duration: bannerDuration, delay: impactDelay, times: [0, 0.18, 0.85, 1], ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'absolute',
          top: `calc(50% - ${(isKO ? bannerHeight * 1.7 : bannerHeight) / 2}px)`,
          left: 0,
          width: '100%',
          minHeight: bannerHeight,
          background: '#0a0a0a',
          borderTop: `${koBorderTop}px solid ${palette.danger}`,
          borderBottom: `1px solid ${palette.danger}88`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `${isKO ? 4 : 2}px 10px`,
          boxShadow: `0 2px 12px rgba(0,0,0,0.65), 0 0 18px ${palette.danger}55`,
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          fontFamily: fonts.ui,
          fontWeight: 700,
          fontSize: 14,
          color: '#fff',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
        }}>
          <span style={{
            color: isKO ? '#ffd98a' : palette.danger,
            marginRight: 8,
            fontSize: 18,
            lineHeight: 1,
          }}>▌</span>
          Damaged by {sourceName}
        </span>
        {isKO && (
          <span style={{
            fontFamily: fonts.ui,
            fontWeight: 700,
            fontSize: 28,
            color: palette.danger,
            whiteSpace: 'nowrap',
            marginTop: 3,
            textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 12px rgba(138,46,42,0.6)',
          }}>
            K.O.
          </span>
        )}
      </motion.div>
    </div>
  );
}

