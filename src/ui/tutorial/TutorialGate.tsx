/**
 * The tutorial's gate — while a lesson step is up, the board is sealed except
 * for what the step lights, and only what the step allows can be touched.
 *
 * Two fixed layers, both pointer-opaque wherever they are painted:
 *
 *   scrim   (z 200)  a dark sheet with a hole cut for every SPOT target, so
 *                    the thing the step talks about reads at full strength;
 *   blocker (z 199)  an invisible sheet with a hole for every ALLOW target.
 *
 * A tap reaches the board only through both holes at once — so a stated step
 * can light the souls rail without making it tappable, and the skill step can
 * show the whole hero sheet while accepting only its skill plate. Nothing is
 * hit-tested or synthesised: the control under the hole gets a genuine event.
 *
 * Targets are resolved by accessible name (see `GateSpec` in the lesson), not
 * by markup added for the tutorial. If a task's target cannot be found for
 * more than a moment the gate opens rather than closes: a lesson that loses
 * its footing must never trap the player in their own game.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { poster } from '../poster';
import type { GateSpec } from '@/tutorial/lessons';

const Z = 200;
const PAD = 6;
const RADIUS = 12;
/** How long a task target may be missing (a sheet sliding in, a card in
 *  flight) before the gate concludes it is lost and opens. */
const MISSING_GRACE_MS = 700;

function byLabel(scope: ParentNode, prefix: string, all: boolean): HTMLElement[] {
  const els = [...scope.querySelectorAll<HTMLElement>('[aria-label]')]
    .filter((e) => (e.getAttribute('aria-label') ?? '').startsWith(prefix));
  return all ? els : els.slice(0, 1);
}
function byText(scope: ParentNode, needle: string, all: boolean): HTMLElement[] {
  const n = needle.toLowerCase();
  const els = [...scope.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((e) => (e.textContent ?? '').toLowerCase().includes(n));
  return all ? els : els.slice(0, 1);
}

function resolve(specs: GateSpec[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const raw of specs) {
    if (!raw) continue;
    let scope: ParentNode = document;
    let spec = raw;
    const cut = raw.indexOf(' >> ');
    if (cut >= 0) {
      const holder = byLabel(document, raw.slice(0, cut), false)[0];
      if (!holder) continue;
      scope = holder;
      spec = raw.slice(cut + 4);
    }
    const all = spec.startsWith('*');
    if (all) spec = spec.slice(1);
    out.push(...(spec.startsWith('~') ? byText(scope, spec.slice(1), all) : byLabel(scope, spec, all)));
  }
  return out;
}

interface Box { x: number; y: number; w: number; h: number }

function boxes(els: HTMLElement[]): Box[] {
  const out: Box[] = [];
  for (const el of els) {
    const q = el.getBoundingClientRect();
    if (q.width === 0 && q.height === 0) continue;
    out.push({
      x: Math.round(q.left - PAD), y: Math.round(q.top - PAD),
      w: Math.round(q.width + PAD * 2), h: Math.round(q.height + PAD * 2),
    });
  }
  return out;
}

/** Union any boxes that touch. The sheet is one even-odd path, where two
 *  overlapping holes cancel back to solid — so a fanned hand (or a target
 *  that is both lit and allowed) must be cut as one hole, not several. */
function merge(boxes: Box[]): Box[] {
  const out: Box[] = [];
  for (const b of boxes) {
    let cur = b;
    let i = 0;
    while (i < out.length) {
      const o = out[i];
      const touches = cur.x <= o.x + o.w && o.x <= cur.x + cur.w && cur.y <= o.y + o.h && o.y <= cur.y + cur.h;
      if (!touches) { i++; continue; }
      const x = Math.min(cur.x, o.x), y = Math.min(cur.y, o.y);
      cur = { x, y, w: Math.max(cur.x + cur.w, o.x + o.w) - x, h: Math.max(cur.y + cur.h, o.y + o.h) - y };
      out.splice(i, 1);
      i = 0; // the union may now touch a box it did not before
    }
    out.push(cur);
  }
  return out;
}

/** A full-viewport sheet with rounded holes, as one even-odd path. */
function sheetPath(W: number, H: number, holes: Box[]): string {
  let d = `M0 0H${W}V${H}H0Z`;
  for (const b of holes) {
    const r = Math.min(RADIUS, b.w / 2, b.h / 2);
    d += ` M${b.x + r} ${b.y}H${b.x + b.w - r}A${r} ${r} 0 0 1 ${b.x + b.w} ${b.y + r}`
      + `V${b.y + b.h - r}A${r} ${r} 0 0 1 ${b.x + b.w - r} ${b.y + b.h}`
      + `H${b.x + r}A${r} ${r} 0 0 1 ${b.x} ${b.y + b.h - r}`
      + `V${b.y + r}A${r} ${r} 0 0 1 ${b.x + r} ${b.y}Z`;
  }
  return d;
}

interface Layout { W: number; H: number; spot: Box[]; allow: Box[]; missing: boolean }

export function TutorialGate({ spot, allow, dim = 0.62, onBlocked, onTap }: {
  /** Lit through the scrim. Empty = the whole screen is sealed. */
  spot: GateSpec[];
  /** Tappable. Empty = nothing is; the step is only telling you something. */
  allow: GateSpec[];
  /** Scrim opacity — lighter while something is playing out underneath. */
  dim?: number;
  onBlocked?: () => void;
  /** When set, the lit things are not passed through to the board: a tap on
   *  any of them is the step's answer (for things that are not controls —
   *  a patron's rule, a fallen hero). */
  onTap?: () => void;
}) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [open, setOpen] = useState(false);
  const raf = useRef(0);
  const lastKey = useRef('');
  const missingSince = useRef<number | null>(null);

  // Re-measure every frame: cards animate into the hand, heroes lift on
  // hover, the sheet slides in. A static measurement drifts off its target
  // within a few hundred milliseconds — but only commit when something moved.
  useEffect(() => {
    lastKey.current = '';
    missingSince.current = null;
    setOpen(false);
    const tick = () => {
      const a = merge(boxes(resolve(allow)));
      // Everything tappable is also lit, whether or not the step said so.
      const s = merge([...boxes(resolve(spot)), ...a]);
      const missing = allow.length > 0 && a.length === 0;
      const now = performance.now();
      if (missing) {
        missingSince.current ??= now;
        if (now - missingSince.current > MISSING_GRACE_MS) setOpen(true);
      } else {
        missingSince.current = null;
        setOpen(false);
      }
      const next: Layout = { W: window.innerWidth, H: window.innerHeight, spot: s, allow: a, missing };
      const key = JSON.stringify(next);
      if (key !== lastKey.current) { lastKey.current = key; setLayout(next); }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [spot, allow]);

  // A task whose target has gone opens the gate rather than sealing the
  // player out of their own game.
  if (open) return null;

  const W = layout?.W ?? window.innerWidth;
  const H = layout?.H ?? window.innerHeight;
  // First frame (nothing measured yet): sealed, no holes.
  const spotHoles = layout?.spot ?? [];
  const allowHoles = layout?.allow ?? [];

  const eat = {
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); onBlocked?.(); },
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); },
  };
  const sheet: React.CSSProperties = {
    position: 'fixed', inset: 0, width: '100%', height: '100%',
    pointerEvents: 'none', display: 'block',
  };

  return (
    <>
      {/* Blocker — invisible, under the scrim, holed only where taps may land. */}
      <svg style={{ ...sheet, zIndex: Z - 1 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path
          d={sheetPath(W, H, allowHoles)}
          fill="rgba(0,0,0,0.001)"
          fillRule="evenodd"
          style={{ pointerEvents: 'fill' }}
          {...eat}
        />
      </svg>
      {/* Scrim — holed where the step points. */}
      <svg style={{ ...sheet, zIndex: Z }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path
          d={sheetPath(W, H, spotHoles)}
          fill="rgb(6, 12, 14)"
          fillOpacity={dim}
          fillRule="evenodd"
          style={{ pointerEvents: 'fill', transition: 'fill-opacity 260ms ease' }}
          {...eat}
        />
      </svg>
      {/* Tap-to-continue: a clear catcher over each lit thing, above the
          scrim, so the tap is answered by the coach rather than the board. */}
      {onTap && spotHoles.map((b, i) => (
        <div
          key={`t-${i}`}
          role="button"
          aria-label="Continue"
          onClick={(e) => { e.stopPropagation(); onTap(); }}
          style={{
            position: 'fixed',
            left: b.x, top: b.y, width: b.w, height: b.h,
            cursor: 'pointer',
            zIndex: Z + 2,
          }}
        />
      ))}
      {/* Rings: a pulsing gold frame on every tappable target, a quieter one
          on anything merely pointed at. Decoration — never eats the tap. */}
      {(allowHoles.length || onTap ? (allowHoles.length ? allowHoles : spotHoles) : spotHoles).map((b, i) => (
        <motion.div
          key={`${allowHoles.length ? 'a' : 's'}-${i}`}
          aria-hidden
          animate={{ opacity: allowHoles.length || onTap ? [0.55, 1, 0.55] : [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'fixed',
            left: b.x, top: b.y, width: b.w, height: b.h,
            border: `${allowHoles.length || onTap ? 2.5 : 2}px solid ${poster.gold}`,
            borderRadius: RADIUS,
            boxShadow: allowHoles.length || onTap
              ? '0 0 0 3px rgba(217, 182, 74, 0.25), 0 0 22px rgba(217, 182, 74, 0.45)'
              : '0 0 0 2px rgba(217, 182, 74, 0.18), 0 0 14px rgba(217, 182, 74, 0.3)',
            pointerEvents: 'none',
            zIndex: Z + 1,
          }}
        />
      ))}
    </>
  );
}
