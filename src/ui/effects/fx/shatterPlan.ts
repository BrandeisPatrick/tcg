/**
 * How a card breaks: `planShatter` cuts a w × h rect into shards along
 * cracks radiating from a seeded impact point — a fan of triangles at the
 * impact and a ring of larger pieces out to the edge. Pure, so the cut can
 * be pinned by tests: the shards tile the rect exactly (shatter.tsx relies
 * on that to swap the live tile for its pieces unseen).
 */
import { type Pt, seeded } from './geometry';

export interface Shard {
  /** The shard's outline in the card's own pixels, clockwise. */
  poly: Pt[];
  centroid: Pt;
  /** Touching the impact point — these go first and fly furthest. */
  inner: boolean;
}

export interface ShatterPlan {
  impact: Pt;
  shards: Shard[];
  /** SVG path data for every crack, in the card's own pixels. */
  cracks: string[];
}

const RAYS = 8;

/** Where a ray from `c` at `angle` leaves a w × h rect, and how far round
 *  the perimeter that is (0..4 clockwise from the top-left corner). */
function exit(c: Pt, angle: number, w: number, h: number): { p: Pt; t: number } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tx = dx > 0 ? (w - c.x) / dx : dx < 0 ? -c.x / dx : Infinity;
  const ty = dy > 0 ? (h - c.y) / dy : dy < 0 ? -c.y / dy : Infinity;
  const k = Math.min(tx, ty);
  const p = { x: Math.max(0, Math.min(w, c.x + dx * k)), y: Math.max(0, Math.min(h, c.y + dy * k)) };
  const t = tx < ty
    ? (dx > 0 ? 1 + p.y / h : 3 + (h - p.y) / h)
    : (dy > 0 ? 2 + (w - p.x) / w : p.x / w);
  return { p, t };
}

const centroidOf = (poly: Pt[]): Pt => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

/** Cut a w × h card into shards round a seeded impact point: a fan of
 *  triangles at the impact and a ring of larger pieces out to the edge. */
export function planShatter(w: number, h: number, seed: number): ShatterPlan {
  const rng = seeded(seed);
  const impact = { x: w * (0.35 + rng() * 0.3), y: h * (0.3 + rng() * 0.3) };
  const rays = Array.from({ length: RAYS }, (_, i) => {
    const angle = (i / RAYS) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const e = exit(impact, angle, w, h);
    const f = 0.36 + rng() * 0.24;
    return { edge: e.p, t: e.t, mid: { x: impact.x + (e.p.x - impact.x) * f, y: impact.y + (e.p.y - impact.y) * f } };
  }).sort((a, b) => a.t - b.t);
  // The rect's corners by their place on the perimeter (and once more round,
  // for the piece that straddles the top-left corner).
  const corners = [{ x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { x: 0, y: 0 }];
  const shards: Shard[] = [];
  const cracks: string[] = [];
  const at = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  rays.forEach((a, i) => {
    const b = rays[(i + 1) % rays.length];
    const tb = b.t > a.t ? b.t : b.t + 4;
    const between: Pt[] = [];
    for (let k = 1; k <= 8; k++) if (k > a.t && k < tb) between.push(corners[(k - 1) % 4]);
    const inner = [impact, a.mid, b.mid];
    const outer = [a.mid, a.edge, ...between, b.edge, b.mid];
    shards.push({ poly: inner, centroid: centroidOf(inner), inner: true });
    shards.push({ poly: outer, centroid: centroidOf(outer), inner: false });
    cracks.push(`M ${at(impact)} L ${at(a.mid)} L ${at(a.edge)}`);
    cracks.push(`M ${at(a.mid)} L ${at(b.mid)}`);
  });
  return { impact, shards, cracks };
}
