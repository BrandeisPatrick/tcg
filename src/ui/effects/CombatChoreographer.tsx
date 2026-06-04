import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { AttackPlan, AttackStep } from '@/engine/combat';
import { palette, fonts } from '../tokens';
import { DamageFlash } from './DamageFlash';

/** Fixed-positioned wrapper so the card-anchored DamageFlash can be used in the
 *  choreographer's overlay layer (over the target/attacker card rect). */
function FlashOverCard({ rect, ko, delaySec, keySuffix }: {
  rect: { left: number; top: number; width: number; height: number };
  ko: boolean;
  delaySec: number;
  keySuffix: string;
}) {
  return (
    <div style={{
      position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      borderRadius: 10, overflow: 'hidden', pointerEvents: 'none', zIndex: 82,
    }}>
      <DamageFlash key={keySuffix} type="attack" ko={ko} delayMs={delaySec * 1000} />
    </div>
  );
}

/**
 * Animated walk-through of an attack phase plan.
 *
 * Renders overlay visuals anchored to the attacker/target slot positions:
 * projectile, full-card red flash on the target, shake animation, and a
 * sweeping DamageBanner. Walks `plan.steps` one at a time, then invokes
 * `onComplete` so the engine can resolve for real. Damage numbers themselves
 * animate ON the hero cards via `useStatTick` in HeroSlot — no floater
 * push from this component.
 */
interface Props {
  plan: AttackPlan;
  /** Map of slot iid → DOM element for measuring positions. */
  slotRefs: Map<string, HTMLElement>;
  /** Called after all steps animate (or skip is clicked). */
  onComplete: () => void;
  /** ms per step (default 1100). Controls combat tempo. */
  stepDuration?: number;
  /** Notifies parents (Board → CombatProgressContext → TurnCompass) of
   *  every beat tick so the compass can drive its combat-mode ring. */
  onBeatIndexChange?: (beat: number) => void;
}

interface ActiveBeat {
  step: AttackStep;
  attackerRect: DOMRect | null;
  targetRect: DOMRect | null;
}

export function CombatChoreographer({ plan, slotRefs, onComplete, stepDuration = 1100, onBeatIndexChange }: Props) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [done, setDone] = useState(false);
  const skippedRef = useRef(false);
  // Ref-stashed so the walk effect doesn't list onComplete in its deps;
  // unstable callers (inline arrows in parents) used to retrigger the effect
  // on every parent re-render and replay the same beat multiple times.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  const onBeatIndexChangeRef = useRef(onBeatIndexChange);
  useEffect(() => { onBeatIndexChangeRef.current = onBeatIndexChange; }, [onBeatIndexChange]);

  // Broadcast every beat to the ambient CombatProgressContext consumers
  // (notably TurnCompass). Fires on mount (beat 0) and after each tick.
  useEffect(() => {
    onBeatIndexChangeRef.current?.(beatIndex);
  }, [beatIndex]);

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
      {/* Dim backdrop to focus attention; keeps board readable but mutes hand.
          14% — softer than the previous 22% now that the loud combat banner
          is gone and the backdrop carries more of the "combat in focus"
          weight. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.14)',
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
          fontFamily: fonts.ui,
          fontSize: 12,
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        Skip ▶▶
      </motion.button>

      {/* Beat progress is no longer a separate chip — the Turn Compass
          consumes CombatProgressContext and morphs its idle conic-sweep
          ring into a segmented progress ring while combat is in flight. */}
    </>
  );
}

const AttackBeat = memo(function AttackBeat({ beat, stepDuration }: { beat: ActiveBeat; stepDuration: number }) {
  const { step, attackerRect, targetRect } = beat;

  // Beat phases scaled to stepDuration:
  //  - 0%   – 15%:  wind-up
  //  - 15%  – 35%:  tracer in flight
  //  - 35%  – 100%: impact (EVA banner sweep) — most of the beat is the
  //    readable hold so the player can parse the banner. The HP number on
  //    the target card animates via useStatTick when the engine applies the
  //    damage; no per-beat floater push from this component.
  const totalSec = stepDuration / 1000;
  const projectileDuration = totalSec * 0.22;
  const projectileDelay = totalSec * 0.15;
  const impactDelay = totalSec * 0.35;
  const damagePersist = totalSec - impactDelay;

  const sx = attackerRect ? attackerRect.left + attackerRect.width / 2 : 0;
  const sy = attackerRect ? attackerRect.top + attackerRect.height / 2 : 0;
  const tx = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
  const ty = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight - 100;
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

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

      {/* Shield-absorbed deflect — when the target's Shield ate part/all of the
          hit, flash a green shield over the target card so the impact reads
          even when HP doesn't move. Triggers at impactDelay so it lands with
          the banner sweep. */}
      {step.shieldAbsorbed > 0 && targetRect && (
        <ShieldDeflect
          rect={{ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height }}
          impactDelay={impactDelay}
          damagePersist={damagePersist}
          absorbed={step.shieldAbsorbed}
          fullyAbsorbed={step.finalDamage === 0}
          keySuffix={`shield-${step.attackerIid}-${step.targetIid ?? 'face'}`}
        />
      )}

      {/* Bullet "got hit" flash on the target, synced to impact (matches the
          ability-damage flash from DamageFlash; attacks are always bullet). */}
      {step.finalDamage > 0 && targetRect && (
        <FlashOverCard
          rect={{ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height }}
          ko={step.predictedKO}
          delaySec={impactDelay}
          keySuffix={`hit-${step.attackerIid}-${step.targetIid ?? 'face'}`}
        />
      )}
      {/* Same flash on the attacker when the defender retaliates. */}
      {step.retaliationDamage > 0 && (
        <FlashOverCard
          rect={{ left: attackerRect.left, top: attackerRect.top, width: attackerRect.width, height: attackerRect.height }}
          ko={false}
          delaySec={impactDelay}
          keySuffix={`retal-${step.attackerIid}-${step.targetIid ?? 'face'}`}
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

      {/* Damage numbers animate on the target card's HP/BP via useStatTick
          when the engine applies the hit — no per-beat floater here. */}

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

/**
 * Green shield-deflect flash anchored over the target card. Renders when the
 * target's Shield ate part or all of the incoming damage — gives the impact a
 * visible cue even when HP doesn't change. Composes a soft green wash, a
 * scaling shield glyph, and an "ABSORBED N" / "BLOCKED N" label.
 */
function ShieldDeflect({
  rect, impactDelay, damagePersist, absorbed, fullyAbsorbed, keySuffix,
}: {
  rect: { left: number; top: number; width: number; height: number };
  impactDelay: number;
  damagePersist: number;
  absorbed: number;
  fullyAbsorbed: boolean;
  keySuffix: string;
}) {
  const flashDuration = damagePersist * 0.85;
  const glyphSize = Math.max(36, Math.min(72, Math.round(rect.width * 0.42)));
  const greenBright = '#6dc04b';
  const greenDeep = '#4a7030';
  return (
    <div
      style={{
        position: 'fixed',
        left: rect.left, top: rect.top,
        width: rect.width, height: rect.height,
        overflow: 'hidden',
        borderRadius: 10,
        pointerEvents: 'none',
        zIndex: 85,
        isolation: 'isolate',
      }}
    >
      {/* Green wash that fades in with impact and out before the beat ends */}
      <motion.div
        key={`shieldwash-${keySuffix}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.55, 0] }}
        transition={{ duration: flashDuration, delay: impactDelay, times: [0, 0.12, 0.7, 1] }}
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, ${greenBright}aa, ${greenDeep}55 55%, transparent 85%)`,
        }}
      />
      {/* Shield glyph — punches in at impact, holds, fades out */}
      <motion.div
        key={`shieldglyph-${keySuffix}`}
        initial={{ scale: 0.55, opacity: 0 }}
        animate={{ scale: [0.55, 1.18, 1.05, 1.05], opacity: [0, 1, 1, 0] }}
        transition={{ duration: flashDuration, delay: impactDelay, times: [0, 0.18, 0.7, 1], ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: glyphSize, height: glyphSize,
          transform: 'translate(-50%, -50%)',
          filter: `drop-shadow(0 0 12px ${greenBright}cc)`,
        }}
      >
        <svg viewBox="0 0 16 16" width="100%" height="100%">
          <path
            d="M8 1.2 L14 3 L14 8 C 14 11.5, 11.5 13.6, 8 14.8 C 4.5 13.6, 2 11.5, 2 8 L 2 3 Z"
            fill={greenBright}
            stroke="rgba(0,0,0,0.55)"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
          <path d="M8 2.4 L4 3.6 L4 7.5 C 4 8.4, 4.5 9.2, 5 9.8 L 5 4.4 Z" fill="rgba(255,255,255,0.32)" />
        </svg>
      </motion.div>
      {/* Label — "BLOCKED N" when shield ate it all, "ABSORBED N" partial */}
      <motion.div
        key={`shieldlabel-${keySuffix}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
        transition={{ duration: flashDuration, delay: impactDelay + 0.06, times: [0, 0.2, 0.7, 1] }}
        style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: `calc(50% - ${glyphSize * 0.85}px)`,
          textAlign: 'center',
          fontFamily: fonts.ui,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.16em',
          color: '#fff',
          textShadow: `0 1px 2px rgba(0,0,0,0.9), 0 0 8px ${greenDeep}`,
        }}
      >
        {fullyAbsorbed ? 'BLOCKED' : 'ABSORBED'} {absorbed}
      </motion.div>
    </div>
  );
}

