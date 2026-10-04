import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { AttackPlan, AttackStep } from '@/engine/combat';
import { fonts } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { GunBurst, KoShatter, KoSticker } from './fx/hits';
import { ShieldDeflect } from './fx/support';
import { Fixed, FxCardContext, Gunfire, Numeral, Wash, numeralSize } from './fx/primitives';
import { FX_TIMING, NUMERAL_INK } from './fx/fxCatalog';
import { FxImpulseContext, type FxImpulse, hitStrength } from './fx/FxImpulse';
import { useFxCalm } from './fx/FxMotionContext';
import { quake, tableCenter } from './fx/FxLayer';
import { type Rect, center, edgePoint, restRect, seeded } from './fx/geometry';
import { useStage, useStageEngine } from './fx/stage/FxStage';
import { gunImpact, ring } from './fx/stage/emitters';

/**
 * Animated walk-through of an attack phase plan.
 *
 * Each beat is a firefight between two cards: the attacker's tile comes up
 * off the table and kicks back with every round (FxImpulse), the FX stage
 * throws the muzzle flash, the casings and a volley of tracers in the
 * attacker's colour, and the rounds land on the target — holes punched into
 * its print (GunBurst, the same family the FX layer uses for skill-sourced
 * bullets), the tile rocking under them, the amount in stencil digits and a
 * DamageBanner sticker. A lethal blow breaks the card into shards
 * (KoShatter) and every other card on the table jumps. Walks `plan.steps`
 * one at a time, then invokes `onComplete` so the engine can resolve for
 * real; the HP numbers on the cards move then (`useStatTick` in HeroSlot).
 * A card that went down stays under a grey veil until that happens, so it
 * never stands back up between beats.
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
  index: number;
  attackerRect: Rect | null;
  targetRect: Rect | null;
  /** The target's live tile — a lethal blow cuts it into shards. */
  attackerTile: HTMLElement | null;
  targetTile: HTMLElement | null;
  /** Every card on the table, for the jolt when one breaks. */
  rects: Map<string, Rect>;
}

/** The beat's clock, as fractions of one step: wind-up, the volley in
 *  flight, then the impact and its readable hold. The HP number on the
 *  target moves when the engine applies the damage, after the walk-through. */
const beatTiming = (stepDuration: number) => {
  const projectileDelay = stepDuration * 0.15;
  const projectileDuration = stepDuration * 0.22;
  const impactDelay = stepDuration * 0.35;
  // Each round flies for most of the projectile window; the three are
  // spaced so the last one lands on the impact beat.
  const roundGap = projectileDuration * 0.12;
  const roundMs = Math.max(120, projectileDuration - 2 * roundGap);
  return { projectileDelay, impactDelay, roundGap, roundMs, damagePersist: stepDuration - impactDelay };
};

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
  const stage = useStageEngine();
  // Cards that went down in an earlier beat, and where they lie.
  const fallen = useRef(new Map<string, { rect: Rect; beat: number }>());

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
    const rects = new Map<string, Rect>();
    for (const [iid, el] of slotRefs) if (document.body.contains(el)) rects.set(iid, restRect(el));
    const table = tableCenter(rects);
    if (table) stage?.lookAt(table);
    const attackerRect = rects.get(step.attackerIid) ?? null;
    const targetRect = step.targetIid ? rects.get(step.targetIid) ?? null : null;
    if (step.predictedKO && step.targetIid && targetRect) fallen.current.set(step.targetIid, { rect: targetRect, beat: beatIndex });
    if (step.attackerKO && attackerRect) fallen.current.set(step.attackerIid, { rect: attackerRect, beat: beatIndex });
    return {
      step,
      index: beatIndex,
      attackerRect,
      targetRect,
      attackerTile: slotRefs.get(step.attackerIid) ?? null,
      targetTile: step.targetIid ? slotRefs.get(step.targetIid) ?? null : null,
      rects,
    };
  }, [beatIndex, plan.steps, slotRefs, done, stage]);

  const { impactDelay } = beatTiming(stepDuration);

  return (
    <>
      {!done && beat && (
        <>
          {/* Dim backdrop to focus attention; keeps the sheet readable but mutes
              the hand. 14% is enough — the gunfire and stickers carry the
              "combat in focus" weight. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
              ...clipBoth(chamfer(6)),
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
      )}

      {/* The fallen stay down. The engine only resolves once the whole walk
          is over, so until then a veil greys each card that broke — landing
          under its shatter's backing, and fading as the real corpse look
          takes over. */}
      {[...fallen.current].map(([iid, f]) => (
        <motion.div
          key={iid}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
          transition={{ duration: 0.05, delay: f.beat === beatIndex ? (impactDelay + FX_TIMING.koBreak + 80) / 1000 : 0 }}
          style={{
            position: 'fixed', left: f.rect.left, top: f.rect.top, width: f.rect.width, height: f.rect.height,
            borderRadius: 10, pointerEvents: 'none', zIndex: 79,
            backdropFilter: 'grayscale(0.95) brightness(0.4) contrast(0.9)',
            WebkitBackdropFilter: 'grayscale(0.95) brightness(0.4) contrast(0.9)',
          }}
        />
      ))}
    </>
  );
}

const AttackBeat = memo(function AttackBeat({ beat, stepDuration }: { beat: ActiveBeat; stepDuration: number }) {
  const { step, index, attackerRect, targetRect, rects } = beat;
  // Seeds the hole scatter / crack pattern so re-renders within the beat draw
  // the same picture, and each beat draws a different one.
  const seed = index * 7919 + 13;
  const { projectileDelay, impactDelay, roundGap, roundMs, damagePersist } = beatTiming(stepDuration);
  const calm = useFxCalm();

  const attackerC = attackerRect ? center(attackerRect) : { x: 0, y: 0 };
  // The rival's row sits on the top half of the sheet, yours on the bottom —
  // so the attacker's side (and its ink) follows from where it swings from.
  const attackerIsTop = attackerC.y < window.innerHeight / 2;
  const attackerInk = attackerIsTop ? poster.rival : poster.you;
  const defenderInk = attackerIsTop ? poster.you : poster.rival;
  // A face hit has no card to land on: the rounds fly to the far edge of the
  // sheet, where the receiving patron sits, and a band there takes the blow.
  const band = useMemo<Rect>(() => {
    const height = 140;
    const width = Math.min(560, window.innerWidth - 32);
    return { left: (window.innerWidth - width) / 2, top: attackerIsTop ? window.innerHeight - height - 16 : 16, width, height };
  }, [attackerIsTop]);
  const hitRect = targetRect ?? band;
  const targetC = center(hitRect);
  const angle = Math.atan2(targetC.y - attackerC.y, targetC.x - attackerC.x);
  const retaliates = step.retaliationDamage > 0 && !!targetRect;

  // The tiles take their part: the attacker comes up and kicks back with
  // its volley, the target rocks at the impact beat, the attacker a beat
  // later when retaliation lands, and a card breaking jolts the table.
  const bus = useContext(FxImpulseContext);
  useEffect(() => {
    if (!bus) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const emit = (iid: string, impulse: FxImpulse, at: number) => { timers.push(setTimeout(() => bus.emit(iid, impulse), at)); };
    emit(step.attackerIid, { kind: 'fire', angle, strength: hitStrength(step.finalDamage), lead: projectileDelay / 1000, gap: roundGap / 1000 }, 0);
    if (step.targetIid) {
      const kind: FxImpulse['kind'] | null = step.finalDamage > 0 ? (step.predictedKO ? 'ko' : 'hit') : step.shieldAbsorbed > 0 ? 'shield' : null;
      if (kind) emit(step.targetIid, { kind, angle, strength: hitStrength(step.finalDamage) }, impactDelay);
      if (retaliates) emit(step.targetIid, { kind: 'fire', angle: angle + Math.PI, strength: hitStrength(step.retaliationDamage), lead: 0.03, gap: roundGap / 1000 }, projectileDelay + 100);
      if (step.predictedKO && targetRect) {
        timers.push(...quake(bus, rects, center(targetRect), impactDelay + FX_TIMING.koBreak, 0.9, step.targetIid));
        emit(step.targetIid, { kind: 'slam', strength: 1 }, impactDelay + FX_TIMING.koStamp + 90);
      }
    }
    if (step.retaliationDamage > 0) {
      emit(step.attackerIid, { kind: step.attackerKO ? 'ko' : 'hit', angle: angle + Math.PI, strength: hitStrength(step.retaliationDamage) }, impactDelay + 100);
      if (step.attackerKO && attackerRect) {
        timers.push(...quake(bus, rects, center(attackerRect), impactDelay + 100 + FX_TIMING.koBreak, 0.9, step.attackerIid));
      }
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, step]);

  // A face hit: the rounds chew along the band at the patron's edge.
  useStage((s) => {
    if (targetRect || step.finalDamage <= 0) return;
    const rng = seeded(seed + 5);
    for (let i = 0; i < 4; i++) {
      const at = { x: band.left + band.width * (0.2 + rng() * 0.6), y: band.top + band.height * (0.3 + rng() * 0.4) };
      s.at(impactDelay + i * 60, (stage) => stage.add(gunImpact({ at, dir: angle, seed: seed + i * 19, power: 0.8, density: stage.density })));
    }
    s.at(impactDelay, (stage) => stage.add(ring({ at: center(band), r0: 30, r1: band.width * 0.5, color: attackerInk, width: 5, life: 520 })));
  });

  if (!attackerRect) return null;

  const muzzle = edgePoint(attackerRect, targetC);
  const targetEdge = targetRect ? edgePoint(targetRect, attackerC) : targetC;
  const shatterAt = impactDelay + FX_TIMING.koBreak;
  const stampAt = impactDelay + FX_TIMING.koStamp;
  const persist = damagePersist * 0.9;

  return (
    <>
      {/* Gunfire — a muzzle flash, a casing and a tracer per round from the
          attacker's edge facing the target, in the attacker's ink; the last
          round lands at the impact beat. */}
      <Gunfire from={muzzle} to={targetEdge} ink={attackerInk} seed={seed + 7} at={projectileDelay} dur={roundMs} rounds={3} gap={roundGap} />
      {/* …and the flash lights the shooter's own card from the muzzle. */}
      <FxCardContext.Provider value={step.attackerIid}>
        <Fixed rect={attackerRect} clip z={80}>
          <Wash color={attackerInk} peak={0.55} at={projectileDelay} dur={2 * roundGap + 260} radial holdFrac={0.5}
            origin={`${(muzzle.x - attackerRect.left).toFixed(0)}px ${(muzzle.y - attackerRect.top).toFixed(0)}px`} />
        </Fixed>
      </FxCardContext.Provider>

      {/* Retaliation — the defender shoots back from its own edge in its own
          ink, a beat behind the incoming volley. Only when the mutual-damage
          rule applied (active vs active). */}
      {retaliates && targetRect && (
        <>
          <Gunfire from={targetEdge} to={muzzle} ink={defenderInk} seed={seed + 9} at={projectileDelay + 100} dur={roundMs} rounds={3} gap={roundGap} />
          <FxCardContext.Provider value={step.targetIid}>
            <Fixed rect={targetRect} clip z={80}>
              <Wash color={defenderInk} peak={0.55} at={projectileDelay + 100} dur={2 * roundGap + 260} radial holdFrac={0.5}
                origin={`${(targetEdge.x - targetRect.left).toFixed(0)}px ${(targetEdge.y - targetRect.top).toFixed(0)}px`} />
            </Fixed>
          </FxCardContext.Provider>
        </>
      )}

      {/* Everything printed on the target rides the target's tile as it rocks. */}
      <FxCardContext.Provider value={step.targetIid ?? null}>
        {/* Shield-absorbed deflect — when the target's Shield ate part/all of the
            hit, the shield swings up over the target card so the impact reads
            even when HP doesn't move. */}
        {step.shieldAbsorbed > 0 && targetRect && (
          <ShieldDeflect
            rect={targetRect}
            absorbed={step.shieldAbsorbed}
            fullyAbsorbed={step.finalDamage === 0}
            at={impactDelay}
            hold={damagePersist}
            seed={seed + 4}
          />
        )}

        {/* Bullets land: holes punched into the target, sparks and chads off
            the far side, and on a lethal blow the card itself breaks. */}
        {step.finalDamage > 0 && targetRect && (
          <>
            <GunBurst rect={targetRect} amount={step.finalDamage} at={impactDelay} hold={persist} seed={seed} from={attackerC} ownerInk={attackerInk} volley={false} />
            {step.predictedKO && (
              <>
                <KoShatter rect={targetRect} tile={beat.targetTile} at={shatterAt} seed={seed + 1} hold={stepDuration - shatterAt} dir={angle} />
                <KoSticker rect={targetRect} at={stampAt} hold={stepDuration - stampAt} seed={seed + 1} />
              </>
            )}
            {/* The amount, in stencil digits above the banner. */}
            <Fixed rect={targetRect} z={89}>
              <Numeral text={`−${step.finalDamage}`} ink={step.predictedKO ? NUMERAL_INK.ko : NUMERAL_INK.attack}
                at={impactDelay + 30} dur={Math.min(damagePersist * 0.85, 1000)} size={numeralSize(targetRect)} top="26%" />
            </Fixed>
          </>
        )}

        {/* "Damaged" feedback for the PRIMARY target — the hero the attacker
            swung at; a card that broke carries the K.O. sticker instead. For
            face attacks the band at the receiving patron's edge hosts the
            same marker and the amount. */}
        {step.finalDamage > 0 && !(step.predictedKO && targetRect) && (
          <DamageBanner
            rect={hitRect}
            isCard={!!targetRect}
            calm={calm}
            damagePersist={damagePersist / 1000}
            impactDelay={impactDelay / 1000}
            keySuffix={`primary-${step.attackerIid}-${step.targetIid ?? 'face'}`}
          />
        )}
        {!targetRect && step.finalDamage > 0 && (
          <Fixed rect={band} z={89}>
            <Numeral text={`−${step.finalDamage}`} ink={NUMERAL_INK.attack} at={impactDelay + 30} dur={Math.min(damagePersist * 0.85, 1000)} size={34} top="22%" />
          </Fixed>
        )}
      </FxCardContext.Provider>

      {/* The same on the attacker when the defender retaliates (the
          mutual-damage rule): the attacker also took a hit. */}
      {step.retaliationDamage > 0 && (
        <FxCardContext.Provider value={step.attackerIid}>
          <GunBurst rect={attackerRect} amount={step.retaliationDamage} at={impactDelay + 100} hold={damagePersist * 0.85} seed={seed + 2} from={targetC} ownerInk={defenderInk} volley={false} />
          {step.attackerKO ? (
            <>
              <KoShatter rect={attackerRect} tile={beat.attackerTile} at={shatterAt + 100} seed={seed + 3} hold={stepDuration - shatterAt - 100} dir={angle + Math.PI} />
              <KoSticker rect={attackerRect} at={stampAt + 100} hold={stepDuration - stampAt - 100} seed={seed + 3} />
            </>
          ) : (
            <DamageBanner
              rect={attackerRect}
              isCard
              calm={calm}
              damagePersist={damagePersist / 1000}
              impactDelay={(impactDelay + 100) / 1000}
              keySuffix={`retal-${step.attackerIid}-${step.targetIid ?? 'face'}`}
            />
          )}
          <Fixed rect={attackerRect} z={89}>
            <Numeral text={`−${step.retaliationDamage}`} ink={step.attackerKO ? NUMERAL_INK.ko : NUMERAL_INK.attack}
              at={impactDelay + 130} dur={Math.min(damagePersist * 0.8, 1000)} size={numeralSize(attackerRect)} top="26%" />
          </Fixed>
        </FxCardContext.Provider>
      )}

      {/* The HP number itself moves when the engine applies the hit, after
          the walk-through (useStatTick in HeroSlot). */}

      {/* Bonus label (e.g. "Haze +2 vs Stunned") if present — a small ink
          sticker rising off the attacker. */}
      {step.bonusLabel && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: [0, 0, 1, 1, 0], y: -28 }}
          transition={{ duration: damagePersist / 1000 + 0.15, delay: impactDelay / 1000, times: [0, 0.1, 0.25, 0.8, 1] }}
          style={{
            position: 'fixed',
            left: attackerC.x - 80, top: attackerC.y + 24,
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
            ...clipBoth(chamfer(3)),
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
 * sticker slammed down over the art carrying the single word "Damaged" (ink
 * sticker, red fill). The fill charges across the word left→right, like a
 * progress bar. Used for both the primary target and a retaliating attacker,
 * so any hero that takes damage gets the same beat. (A lethal blow breaks
 * the card and gets the K.O. sticker instead.)
 *
 * `rect` is the card's bounding box (or a synthetic face band for direct hits).
 * The whole effect is clipped to it and the type size is derived from the card
 * width, so it scales with the board / browser window. `keySuffix` keeps each
 * instance's motion divs uniquely keyed across the primary / retaliation pair.
 */
function DamageBanner({
  rect, isCard, calm, damagePersist, impactDelay, keySuffix,
}: {
  rect: Rect;
  isCard: boolean;
  calm: boolean;
  damagePersist: number;
  impactDelay: number;
  keySuffix: string;
}) {
  const word = 'Damaged';
  const fill = poster.red;          // progress fill
  const sticker = poster.ink;       // the plate under the word
  // Type scales with the card so it tracks the board / window size and never
  // overflows a narrow card the way a fixed 14px line did.
  const fontSize = Math.max(13, Math.min(Math.round(rect.width * 0.15), 34));
  const dur = damagePersist * 0.92;
  return (
    <Fixed rect={rect} clip radius={isCard ? 10 : 6} z={84}>
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
          card. The sticker carries legibility over bright art, so no scrim.
          It comes down from the viewer's side and lands with a squash. */}
      <motion.div
        key={`word-${keySuffix}`}
        initial={calm ? { opacity: 0, scale: 0.92 } : { opacity: 0, scale: 2.1, rotateX: 38 }}
        animate={calm
          ? { opacity: [0, 1, 1, 0], scale: [0.92, 1, 1, 1] }
          : { opacity: [0, 1, 1, 1, 0], scale: [2.1, 0.93, 1.03, 1, 1], rotateX: [38, -6, 0, 0, 0] }}
        transition={{ duration: dur, delay: impactDelay + 0.09, times: calm ? [0, 0.12, 0.85, 1] : [0, 0.09, 0.16, 0.85, 1], ease: 'easeOut' }}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transformPerspective: 520,
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
              transition={{ duration: dur * 0.5, delay: impactDelay + 0.09, ease: [0.22, 1, 0.36, 1] }}
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
    </Fixed>
  );
}
