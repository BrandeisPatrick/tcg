import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { AttackPlan, AttackStep } from '@/engine/combat';
import { fonts } from '../tokens';
import { poster, chamfer } from '../poster';
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
 * a flat tracer in the attacker's colour, the type-coloured hit flash on the
 * target, and a DamageBanner sticker. Walks `plan.steps` one at a time, then invokes
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
      {/* Dim backdrop to focus attention; keeps the sheet readable but mutes
          the hand. 14% is enough — the tracer and stickers carry the
          "combat in focus" weight. */}
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

      {/* Skip button — a chamfered paper plate in the corner, visible during
          combat. */}
      <motion.button
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={skip}
        style={{
          position: 'fixed',
          // right offset clears the persistent system gear in the corner.
          top: 16, right: 62,
          zIndex: 90,
          padding: '8px 16px',
          background: poster.paper,
          color: poster.ink,
          border: `2px solid ${poster.ink}`,
          clipPath: chamfer(6),
          WebkitClipPath: chamfer(6),
          cursor: 'pointer',
          fontFamily: fonts.display,
          fontSize: 12,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        Skip ▶▶
      </motion.button>
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
  // The rival's row sits on the top half of the sheet, yours on the bottom —
  // so the attacker's side (and its ink) follows from where it swings from.
  const attackerIsTop = sy < window.innerHeight / 2;
  const attackerInk = attackerIsTop ? poster.rival : poster.you;
  const defenderInk = attackerIsTop ? poster.you : poster.rival;

  if (!attackerRect) return null;

  return (
    <>
      {/* Tracer — a flat streak in the attacker's ink, fading in from its
          origin so the leading edge lands solid. The rotation must go
          through framer-motion's transform stack (not raw CSS transform),
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
          background: `linear-gradient(90deg, ${attackerInk}00, ${attackerInk} 35%, ${attackerInk})`,
          transformOrigin: '0 50%',
          rotate: `${angle}rad`,
          pointerEvents: 'none',
          zIndex: 81,
          borderRadius: 2,
        }}
      />

      {/* Retaliation tracer — defender swings back at the attacker in its own
          ink. Only shown when the mutual-damage rule applied (active vs
          active). Same length and timing as the primary tracer but rotated
          180° so it visually counters the incoming swing. */}
      {step.retaliationDamage > 0 && targetRect && (
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: [0, 1, 1, 0] }}
          transition={{ duration: projectileDuration, delay: projectileDelay, ease: [0.2, 0.6, 0.4, 1], times: [0, 0.1, 0.85, 1] }}
          style={{
            position: 'fixed',
            left: tx, top: ty - 2,
            width: dist, height: 4,
            background: `linear-gradient(90deg, ${defenderInk}00, ${defenderInk} 35%, ${defenderInk})`,
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

      {/* "Damaged" feedback for the PRIMARY target — the hero the attacker
          swung at. For face attacks (no targetRect), a synthetic band at the
          receiving player's avatar zone hosts the same marker. */}
      {(() => {
        let rect: { left: number; top: number; width: number; height: number; isCard: boolean };
        if (targetRect) {
          rect = { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height, isCard: true };
        } else {
          const bandHeight = 140;
          const bandTop = attackerIsTop ? window.innerHeight - bandHeight - 16 : 16;
          const bandWidth = Math.min(560, window.innerWidth - 32);
          const bandLeft = (window.innerWidth - bandWidth) / 2;
          rect = { left: bandLeft, top: bandTop, width: bandWidth, height: bandHeight, isCard: false };
        }
        return (
          <DamageBanner
            rect={rect}
            isKO={step.predictedKO}
            damagePersist={damagePersist}
            impactDelay={impactDelay}
            keySuffix={`primary-${step.attackerIid}-${step.targetIid ?? 'face'}`}
          />
        );
      })()}

      {/* "Damaged" feedback for the ATTACKER when retaliation lands.
          Mutual-damage rule: the attacker also took a hit, so they get the
          same marker. */}
      {step.retaliationDamage > 0 && (
        <DamageBanner
          rect={{
            left: attackerRect.left, top: attackerRect.top,
            width: attackerRect.width, height: attackerRect.height,
            isCard: true,
          }}
          isKO={step.attackerKO}
          damagePersist={damagePersist}
          impactDelay={impactDelay}
          keySuffix={`retal-${step.attackerIid}-${step.targetIid ?? 'face'}`}
        />
      )}

      {/* Damage numbers animate on the target card's HP/BP via useStatTick
          when the engine applies the hit — no per-beat floater here. */}

      {/* Bonus label (e.g. "Haze +2 vs Stunned") if present — a small ink
          sticker rising off the attacker. */}
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
            pointerEvents: 'none',
            zIndex: 87,
          }}
        >
          <span style={{
            display: 'inline-block',
            padding: '3px 7px 4px',
            background: poster.ink,
            color: poster.paper,
            clipPath: chamfer(3),
            WebkitClipPath: chamfer(3),
            fontFamily: fonts.display,
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}>
            {step.bonusLabel}
          </span>
        </motion.div>
      )}
    </>
  );
});

/**
 * Damage feedback clipped to a hero card: a brief desaturation wash plus a
 * sticker slapped over the art carrying the single word "Damaged" (ink
 * sticker, red fill) or "K.O." on a lethal blow (red sticker, gold fill).
 * The fill charges across the word left→right, like a progress bar. Used for
 * both the primary target and a retaliating attacker, so any hero that takes
 * damage gets the same beat.
 *
 * `rect` is the card's bounding box (or a synthetic face band for direct hits).
 * The whole effect is clipped to it and the type size is derived from the card
 * width, so it scales with the board / browser window. `keySuffix` keeps each
 * instance's motion divs uniquely keyed across the primary / retaliation pair.
 */
function DamageBanner({
  rect, isKO, damagePersist, impactDelay, keySuffix,
}: {
  rect: { left: number; top: number; width: number; height: number; isCard: boolean };
  isKO: boolean;
  damagePersist: number;
  impactDelay: number;
  keySuffix: string;
}) {
  const word = isKO ? 'K.O.' : 'Damaged';
  const fill = isKO ? poster.gold : poster.red;          // progress fill: red, gold on a KO
  const sticker = isKO ? poster.red : poster.ink;        // the plate under the word
  // Type scales with the card so it tracks the board / window size and never
  // overflows a narrow card the way a fixed 14px line did.
  const fontSize = Math.max(13, Math.min(Math.round(rect.width * (isKO ? 0.2 : 0.15)), isKO ? 44 : 34));
  const dur = damagePersist * 0.92;
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
      {/* Drain the card's colour for the beat — reads as "took a hit". */}
      <motion.div
        key={`wash-${keySuffix}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0.9, 0] }}
        transition={{ duration: dur, delay: impactDelay, times: [0, 0.1, 0.85, 1] }}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(23, 20, 16, 0.6)',
          mixBlendMode: 'saturation',
        }}
      />
      {/* The word — printed in paper on a sticker, centred and clipped to the
          card. The sticker carries legibility over bright art, so no scrim. */}
      <motion.div
        key={`word-${keySuffix}`}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.92, 1, 1, 1] }}
        transition={{ duration: dur, delay: impactDelay, times: [0, 0.12, 0.85, 1], ease: 'easeOut' }}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{
          display: 'inline-block',
          padding: `${Math.round(fontSize * 0.22)}px ${Math.round(fontSize * 0.4)}px`,
          background: sticker,
          borderRadius: 3,
          transform: 'rotate(-4deg)',
          boxShadow: '0 3px 8px rgba(0,0,0,0.35)',
          fontFamily: fonts.display, fontSize,
          letterSpacing: '0.08em', whiteSpace: 'nowrap', lineHeight: 1,
          textTransform: 'uppercase',
        }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* Paper word. */}
            <span style={{ color: poster.paper }}>{word}</span>
            {/* Progress fill charging INSIDE the paper word, left→right, with a
                solid leading edge — the "bar fills the text" the design calls for. */}
            <motion.span
              key={`fill-${keySuffix}`}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: dur * 0.5, delay: impactDelay, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute', left: 0, top: 0, height: '100%',
                overflow: 'hidden', display: 'block',
                color: fill,
                borderRight: `2px solid ${fill}`,
              }}
            >
              <span style={{ whiteSpace: 'nowrap' }}>{word}</span>
            </motion.span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Green shield-deflect flash anchored over the target card. Renders when the
 * target's Shield ate part or all of the incoming damage — gives the impact a
 * visible cue even when HP doesn't change. Composes a flat green wash, a
 * scaling shield glyph, and an "ABSORBED N" / "BLOCKED N" ink tag.
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
  const green = poster.green;
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
      {/* Flat green wash that fades in with impact and out before the beat ends */}
      <motion.div
        key={`shieldwash-${keySuffix}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.55, 0] }}
        transition={{ duration: flashDuration, delay: impactDelay, times: [0, 0.12, 0.7, 1] }}
        style={{
          position: 'absolute', inset: 0,
          background: `${green}99`,
        }}
      />
      {/* Shield glyph — punches in at impact, holds, fades out. A hard offset
          shadow grounds it like a printed sticker. */}
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
          filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.45))',
        }}
      >
        <svg viewBox="0 0 16 16" width="100%" height="100%">
          <path
            d="M8 1.2 L14 3 L14 8 C 14 11.5, 11.5 13.6, 8 14.8 C 4.5 13.6, 2 11.5, 2 8 L 2 3 Z"
            fill={green}
            stroke={poster.ink}
            strokeWidth="0.7"
            strokeLinejoin="round"
          />
          <path d="M8 2.4 L4 3.6 L4 7.5 C 4 8.4, 4.5 9.2, 5 9.8 L 5 4.4 Z" fill="rgba(242,230,203,0.4)" />
        </svg>
      </motion.div>
      {/* Label — "BLOCKED N" when shield ate it all, "ABSORBED N" partial —
          as an ink tag with green type. */}
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
        }}
      >
        <span style={{
          display: 'inline-block',
          padding: '4px 9px 5px',
          background: poster.ink,
          color: green,
          clipPath: chamfer(4),
          WebkitClipPath: chamfer(4),
          fontFamily: fonts.display,
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}>
          {fullyAbsorbed ? 'BLOCKED' : 'ABSORBED'} {absorbed}
        </span>
      </motion.div>
    </div>
  );
}

