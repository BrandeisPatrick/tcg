/**
 * Screen geometry for the FX layer — everything is positioned in viewport
 * pixels from the slots' bounding boxes, so the effects sit on the cards no
 * matter how the board is fit-scaled or laid out for a phone.
 */
export interface Pt { x: number; y: number }
export interface Rect { left: number; top: number; width: number; height: number }

export const center = (r: Rect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
export const angleOf = (a: Pt, b: Pt): number => Math.atan2(b.y - a.y, b.x - a.x);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function toRect(el: Element): Rect {
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
}

/** A hero tile's rect at rest. A kick shoves and tips the tile itself, so
 *  its own bounding box wanders mid-effect; the wrapper HeroSlot marks with
 *  `data-fx-rest` never moves, and effects anchor to that. */
export function restRect(el: Element): Rect {
  return toRect(el.closest('[data-fx-rest]') ?? el);
}

/** Where a ray from the rect's centre toward `toward` leaves the rect —
 *  the muzzle sits on the attacker's edge facing its target. */
export function edgePoint(r: Rect, toward: Pt): Pt {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = r.width / 2;
  const hh = r.height / 2;
  const t = Math.min(
    dx !== 0 ? hw / Math.abs(dx) : Infinity,
    dy !== 0 ? hh / Math.abs(dy) : Infinity,
  );
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Deterministic PRNG (mulberry32) — an effect seeded by its event's seq
 *  scatters the same way every time it re-renders. */
export function seeded(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PathBox {
  /** SVG path data in the box's local coordinates. */
  d: string;
  /** Viewport box the SVG should occupy. */
  box: Rect;
}

/** A lightning path: `segments` joints from `a` to `b`, each thrown sideways
 *  by up to `jitter` of the distance. */
export function jaggedPath(a: Pt, b: Pt, rng: () => number, segments = 7, jitter = 0.14, pad = 30): PathBox {
  const d = dist(a, b) || 1;
  const nx = -(b.y - a.y) / d;
  const ny = (b.x - a.x) / d;
  const pts: Pt[] = [a];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = (rng() * 2 - 1) * jitter * d;
    pts.push({ x: lerp(a.x, b.x, t) + nx * off, y: lerp(a.y, b.y, t) + ny * off });
  }
  pts.push(b);
  const left = Math.min(...pts.map((p) => p.x)) - pad;
  const top = Math.min(...pts.map((p) => p.y)) - pad;
  const right = Math.max(...pts.map((p) => p.x)) + pad;
  const bottom = Math.max(...pts.map((p) => p.y)) + pad;
  const box = { left, top, width: right - left, height: bottom - top };
  const dd = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x - left).toFixed(1)} ${(p.y - top).toFixed(1)}`).join(' ');
  return { d: dd, box };
}

/** Points on the inside of a rect, kept away from the edges by `margin`
 *  (a fraction of each side) — where bullet holes may land. */
export function scatterInRect(r: Rect, n: number, rng: () => number, margin = 0.18): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: r.width * (margin + rng() * (1 - 2 * margin)),
      y: r.height * (margin + rng() * (1 - 2 * margin)),
    });
  }
  return out;
}
