import { describe, it, expect } from 'vitest';
import { planShatter } from '@/ui/effects/fx/shatterPlan';
import type { Pt } from '@/ui/effects/fx/geometry';

/** A kill swaps the live tile for its shards unseen — which only works if
 *  the shards tile the card exactly. Pin the cut. */

const area = (poly: Pt[]) => Math.abs(poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return s + (p.x * q.y - q.x * p.y);
}, 0)) / 2;

describe('shatter plan', () => {
  const sizes: [number, number][] = [[180, 280], [135, 180], [96, 128], [320, 90]];

  it('the shards tile the card: their areas add up to the whole', () => {
    for (const [w, h] of sizes) {
      for (const seed of [1, 2, 13, 7919, 123456]) {
        const plan = planShatter(w, h, seed);
        const total = plan.shards.reduce((s, sh) => s + area(sh.poly), 0);
        expect(total).toBeCloseTo(w * h, 4);
      }
    }
  });

  it('no shard strays outside the card, and none is degenerate', () => {
    for (const [w, h] of sizes) {
      const plan = planShatter(w, h, 42);
      for (const sh of plan.shards) {
        expect(sh.poly.length).toBeGreaterThanOrEqual(3);
        expect(area(sh.poly)).toBeGreaterThan(1);
        for (const p of sh.poly) {
          expect(p.x).toBeGreaterThanOrEqual(-1e-6);
          expect(p.x).toBeLessThanOrEqual(w + 1e-6);
          expect(p.y).toBeGreaterThanOrEqual(-1e-6);
          expect(p.y).toBeLessThanOrEqual(h + 1e-6);
        }
      }
    }
  });

  it('cuts a fan at the impact and a ring out to the edge', () => {
    const plan = planShatter(180, 280, 5);
    const inner = plan.shards.filter((s) => s.inner);
    const outer = plan.shards.filter((s) => !s.inner);
    expect(inner).toHaveLength(8);
    expect(outer).toHaveLength(8);
    // Every inner shard touches the impact point; together the outer ones
    // carry all four corners of the card.
    expect(inner.every((s) => s.poly.some((p) => p.x === plan.impact.x && p.y === plan.impact.y))).toBe(true);
    const corners = outer.flatMap((s) => s.poly).filter((p) => (p.x === 0 || p.x === 180) && (p.y === 0 || p.y === 280));
    expect(new Set(corners.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    expect(plan.cracks).toHaveLength(16);
  });

  it('the impact sits inside the card, and the cut is the same for the same seed', () => {
    const plan = planShatter(180, 280, 99);
    expect(plan.impact.x).toBeGreaterThan(180 * 0.3);
    expect(plan.impact.x).toBeLessThan(180 * 0.7);
    expect(plan.impact.y).toBeGreaterThan(280 * 0.25);
    expect(plan.impact.y).toBeLessThan(280 * 0.65);
    expect(planShatter(180, 280, 99)).toEqual(plan);
    expect(planShatter(180, 280, 100)).not.toEqual(plan);
  });
});
