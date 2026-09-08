/**
 * The tutorial's gate — while a lesson step names a target, that target is the
 * only thing on screen you can touch.
 *
 * Implemented as four scrim bands laid around the target's bounding box rather
 * than one overlay with a hole: the bands swallow every click, and the gap
 * between them has nothing over it at all, so the real control underneath
 * receives a genuine event. No hit-testing, no synthetic dispatch, no
 * pointer-events juggling inside the board.
 *
 * Targets are resolved by accessible name, not by markup added for the
 * tutorial — the hand card already announces "Extra Health, cost 1 souls" and
 * the hero already announces "Kelvin — 2 attack, 6 health". If a target cannot
 * be found the gate opens rather than closes: a lesson that loses its footing
 * must never trap the player.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { poster } from '../poster';

/** A target spec. `~` prefix matches visible text; anything else matches the
 *  start of an aria-label. */
export type GateSpec = string;

const SCRIM = 'rgba(6, 12, 14, 0.62)';
const Z = 200;

function resolve(specs: GateSpec[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const spec of specs) {
    if (spec.startsWith('~')) {
      const needle = spec.slice(1).toLowerCase();
      const el = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
        .find((e) => (e.textContent ?? '').toLowerCase().includes(needle));
      if (el) out.push(el);
    } else {
      const el = [...document.querySelectorAll<HTMLElement>('[aria-label]')]
        .find((e) => (e.getAttribute('aria-label') ?? '').startsWith(spec));
      if (el) out.push(el);
    }
  }
  return out;
}

interface Box { x: number; y: number; w: number; h: number }

/** Union of the targets' boxes, padded so the ring clears the artwork. */
function hole(els: HTMLElement[], pad: number): Box | null {
  if (!els.length) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const el of els) {
    const q = el.getBoundingClientRect();
    if (q.width === 0 && q.height === 0) continue;
    l = Math.min(l, q.left); t = Math.min(t, q.top);
    r = Math.max(r, q.right); b = Math.max(b, q.bottom);
  }
  if (l === Infinity) return null;
  return { x: l - pad, y: t - pad, w: r - l + pad * 2, h: b - t + pad * 2 };
}

export function TutorialGate({ specs, onBlocked }: {
  /** Empty = nothing is legal yet; the whole screen is sealed. */
  specs: GateSpec[];
  onBlocked?: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const raf = useRef(0);

  // Re-measure every frame: cards animate into the hand, heroes lift on
  // hover, the sheet slides in. A static measurement drifts off its target
  // within a few hundred milliseconds.
  useEffect(() => {
    const tick = () => {
      const els = resolve(specs);
      setMissing(specs.length > 0 && els.length === 0);
      setBox(hole(els, 6));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [specs]);

  // A step whose target has not appeared yet (or has gone) opens the gate
  // rather than sealing the player out of their own game.
  if (missing) return null;

  const band = (style: React.CSSProperties) => (
    <div
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onBlocked?.(); }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{ position: 'fixed', background: SCRIM, zIndex: Z, ...style }}
    />
  );

  if (!box) {
    // Stated step: nothing on the board is legal, so seal all of it. The
    // coach plate sits above this and keeps its Next.
    return band({ inset: 0 });
  }

  return (
    <>
      {band({ left: 0, top: 0, right: 0, height: Math.max(0, box.y) })}
      {band({ left: 0, top: box.y + box.h, right: 0, bottom: 0 })}
      {band({ left: 0, top: box.y, width: Math.max(0, box.x), height: box.h })}
      {band({ left: box.x + box.w, top: box.y, right: 0, height: box.h })}
      {/* The ring is decoration and must never eat the click it is pointing at. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'fixed',
          left: box.x, top: box.y, width: box.w, height: box.h,
          border: `2.5px solid ${poster.gold}`,
          borderRadius: 12,
          boxShadow: `0 0 0 3px rgba(217, 182, 74, 0.25), 0 0 22px rgba(217, 182, 74, 0.45)`,
          pointerEvents: 'none',
          zIndex: Z + 1,
        }}
      />
    </>
  );
}
