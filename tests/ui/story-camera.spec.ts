/**
 * The story map's camera math. The screen moves an 840 kB sheet with one
 * transform and the stops and routes with another, both from the same
 * camera, and places the name tags from toScreen(), so these functions are
 * the whole contract between them: if they agree, a stop sits on its street
 * at every zoom. The gestures' own math is here too — the speed of a throw
 * and the glide that follows it.
 */
import { describe, it, expect } from 'vitest';
import {
  MAP_W, MAP_H, MAX_ZOOM, ABS_MAX_SCALE, LOD_MID, LOD_NEAR,
  coverScale, scaleLimits, clampCamera, toScreen, toMap, zoomAt, pinchTo,
  panBy, frameStops, revealPoint, lerpCamera, lerpCameraAbout, lodBand, zoomProgress,
  releaseVelocity, glideOffset, glideSpeed, glideDuration,
  FLING_WINDOW, FLING_STILL, FLING_MAX, GLIDE_TAU, GLIDE_STOP,
  type Camera, type Frame, type Sample,
} from '@/ui/story/mapCamera';

const DESK: Frame = { w: 1440, h: 900 };
const PHONE: Frame = { w: 390, h: 844 };
const NO_PAD = { top: 0, right: 0, bottom: 0, left: 0 };

/** The four viewport corners in map units — all must lie on the sheet. */
function corners(cam: Camera, f: Frame) {
  return [[0, 0], [f.w, 0], [0, f.h], [f.w, f.h]].map(([x, y]) => toMap(cam, f, x, y));
}
function onSheet(cam: Camera, f: Frame) {
  return corners(cam, f).every((p) => p.x >= -1e-6 && p.x <= MAP_W + 1e-6 && p.y >= -1e-6 && p.y <= MAP_H + 1e-6);
}

describe('coverScale', () => {
  it('fills the wider axis exactly', () => {
    expect(coverScale(DESK)).toBeCloseTo(1440 / 840);
    expect(coverScale(PHONE)).toBeCloseTo(844 / 1080);
    expect(MAP_W * coverScale(DESK)).toBeGreaterThanOrEqual(DESK.w - 1e-9);
    expect(MAP_H * coverScale(PHONE)).toBeGreaterThanOrEqual(PHONE.h - 1e-9);
  });
});

describe('scaleLimits', () => {
  it('runs from cover to 3.2× cover on a desktop', () => {
    const { min, max } = scaleLimits(DESK);
    expect(min).toBeCloseTo(coverScale(DESK));
    expect(max).toBeCloseTo(coverScale(DESK) * MAX_ZOOM);
  });
  it('lets a phone reach the absolute floor for the closest zoom', () => {
    const { max } = scaleLimits(PHONE);
    expect(coverScale(PHONE) * MAX_ZOOM).toBeLessThan(ABS_MAX_SCALE);
    expect(max).toBe(ABS_MAX_SCALE);
  });
});

describe('lodBand', () => {
  it('splits the zoom into far / mid / near at absolute scales', () => {
    expect(lodBand(0.78)).toBe('far');
    expect(lodBand(LOD_MID - 0.001)).toBe('far');
    expect(lodBand(LOD_MID)).toBe('mid');
    expect(lodBand(LOD_NEAR - 0.001)).toBe('mid');
    expect(lodBand(LOD_NEAR)).toBe('near');
    expect(lodBand(5.4)).toBe('near');
  });
  it('every band is reachable on both screens', () => {
    for (const f of [DESK, PHONE]) {
      const { min, max } = scaleLimits(f);
      expect(lodBand(min)).toBe('far');
      expect(lodBand(max)).toBe('near');
    }
  });
});

describe('clampCamera', () => {
  it('never shows past the sheet, at any zoom or centre', () => {
    for (const f of [DESK, PHONE]) {
      for (const s of [0.1, coverScale(f), 2, 4, 50]) {
        for (const [cx, cy] of [[-500, -500], [0, 0], [420, 540], [MAP_W + 900, MAP_H + 900], [MAP_W, 0]]) {
          const c = clampCamera({ cx, cy, s }, f);
          expect(onSheet(c, f)).toBe(true);
          const { min, max } = scaleLimits(f);
          expect(c.s).toBeGreaterThanOrEqual(min - 1e-12);
          expect(c.s).toBeLessThanOrEqual(max + 1e-12);
        }
      }
    }
  });
  it('leaves a legal camera alone', () => {
    const c = { cx: 400, cy: 500, s: 3 };
    expect(clampCamera(c, DESK)).toEqual(c);
  });
});

describe('toScreen / toMap', () => {
  it('puts the centre point at the viewport centre and round-trips', () => {
    const cam = { cx: 300, cy: 600, s: 2.5 };
    const c = toScreen(cam, DESK, 300 / MAP_W, 600 / MAP_H);
    expect(c.x).toBeCloseTo(720);
    expect(c.y).toBeCloseTo(450);
    const p = toScreen(cam, DESK, 0.4, 0.7);
    const back = toMap(cam, DESK, p.x, p.y);
    expect(back.x).toBeCloseTo(0.4 * MAP_W);
    expect(back.y).toBeCloseTo(0.7 * MAP_H);
  });
  it('scales distances by s', () => {
    const cam = { cx: 420, cy: 540, s: 3 };
    const a = toScreen(cam, DESK, 0.5, 0.5), b = toScreen(cam, DESK, 0.5 + 10 / MAP_W, 0.5);
    expect(b.x - a.x).toBeCloseTo(30);
  });
});

describe('zoomAt', () => {
  it('keeps the map point under the anchor where it is', () => {
    const cam = { cx: 420, cy: 540, s: 2.5 };
    const anchor = { x: 900, y: 300 };
    const before = toMap(cam, DESK, anchor.x, anchor.y);
    const z = zoomAt(cam, DESK, 1.4, anchor.x, anchor.y);
    expect(z.s).toBeCloseTo(3.5);
    const after = toScreen(z, DESK, before.x / MAP_W, before.y / MAP_H);
    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
  });
  it('stops at the zoom limits and stays on the sheet', () => {
    const { min, max } = scaleLimits(PHONE);
    const cam = { cx: 420, cy: 540, s: 2 };
    expect(zoomAt(cam, PHONE, 100, 50, 50).s).toBeCloseTo(max);
    const out = zoomAt(cam, PHONE, 0.01, 50, 50);
    expect(out.s).toBeCloseTo(min);
    expect(onSheet(out, PHONE)).toBe(true);
  });
});

describe('pinchTo / panBy', () => {
  it('carries the point under the first midpoint to the second', () => {
    const cam = { cx: 420, cy: 540, s: 2 };
    const from = { x: 200, y: 400 }, to = { x: 230, y: 380 };
    const p = toMap(cam, PHONE, from.x, from.y);
    const n = pinchTo(cam, PHONE, 1.25, from, to);
    const q = toScreen(n, PHONE, p.x / MAP_W, p.y / MAP_H);
    expect(q.x).toBeCloseTo(to.x);
    expect(q.y).toBeCloseTo(to.y);
  });
  it('a drag moves the sheet with the finger', () => {
    const cam = { cx: 420, cy: 540, s: 3 };
    const n = panBy(cam, DESK, 30, -60);
    expect(n.cx).toBeCloseTo(410);
    expect(n.cy).toBeCloseTo(560);
  });
});

describe('frameStops', () => {
  const pts = [{ x: 0.45, y: 0.4 }, { x: 0.52, y: 0.6 }, { x: 0.38, y: 0.52 }];
  it('fits every point inside the padded viewport', () => {
    const pad = { top: 64, right: 372, bottom: 24, left: 320 };
    const cam = frameStops(pts, DESK, pad, 20);
    for (const p of pts) {
      const q = toScreen(cam, DESK, p.x, p.y);
      expect(q.x).toBeGreaterThanOrEqual(pad.left - 1e-6);
      expect(q.x).toBeLessThanOrEqual(DESK.w - pad.right + 1e-6);
      expect(q.y).toBeGreaterThanOrEqual(pad.top - 1e-6);
      expect(q.y).toBeLessThanOrEqual(DESK.h - pad.bottom + 1e-6);
    }
    expect(onSheet(cam, DESK)).toBe(true);
  });
  it('centres the points in the free area', () => {
    const pad = { top: 0, right: 0, bottom: 100, left: 300 };
    const cam = frameStops(pts, DESK, pad, 20);
    const xs = pts.map((p) => toScreen(cam, DESK, p.x, p.y).x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(300 + (1440 - 300) / 2);
  });
  it('comes no closer than maxScale, and a single stop sits at that zoom', () => {
    const maxScale = coverScale(DESK) * 2.2;
    const one = frameStops([{ x: 0.45, y: 0.54 }], DESK, NO_PAD, maxScale);
    expect(one.s).toBeCloseTo(maxScale);
    const q = toScreen(one, DESK, 0.45, 0.54);
    expect(q.x).toBeCloseTo(720);
    expect(q.y).toBeCloseTo(450);
  });
  it('never goes wider than cover', () => {
    const cam = frameStops([{ x: 0, y: 0 }, { x: 1, y: 1 }], PHONE, NO_PAD, 10);
    expect(cam.s).toBeCloseTo(coverScale(PHONE));
    expect(onSheet(cam, PHONE)).toBe(true);
  });
});

describe('revealPoint', () => {
  it('pans a point out from under a dock by the least amount', () => {
    const cam = { cx: 420, cy: 540, s: 3 };
    const pad = { top: 64, right: 372, bottom: 24, left: 320 };
    // A point 100px from the right edge — under the right dock.
    const p = toMap(cam, DESK, DESK.w - 100, 450);
    const n = revealPoint(cam, DESK, p.x / MAP_W, p.y / MAP_H, pad)!;
    expect(n).not.toBeNull();
    expect(toScreen(n, DESK, p.x / MAP_W, p.y / MAP_H).x).toBeCloseTo(DESK.w - pad.right);
    expect(revealPoint(cam, DESK, 0.5, 0.5, pad)).toBeNull();
  });
});

describe('lerpCamera / zoomProgress', () => {
  it('blends zoom in log space', () => {
    const m = lerpCamera({ cx: 0, cy: 0, s: 1 }, { cx: 100, cy: 50, s: 4 }, 0.5);
    expect(m.s).toBeCloseTo(2);
    expect(m.cx).toBeCloseTo(50);
    expect(m.cy).toBeCloseTo(25);
  });
  it('runs 0 → 1 across the zoom range', () => {
    const { min, max } = scaleLimits(DESK);
    expect(zoomProgress({ cx: 420, cy: 540, s: min }, DESK)).toBeCloseTo(0);
    expect(zoomProgress({ cx: 420, cy: 540, s: max }, DESK)).toBeCloseTo(1);
  });
});

describe('lerpCameraAbout', () => {
  it('holds the anchor under the same screen point all the way through a zoom about it', () => {
    const cam = { cx: 420, cy: 540, s: 2 };
    const anchor = { x: 260, y: 610 };
    const p = toMap(cam, PHONE, anchor.x, anchor.y);
    const to = zoomAt(cam, PHONE, 1.4, anchor.x, anchor.y);
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const c = lerpCameraAbout(cam, to, t, p);
      const q = toScreen(c, PHONE, p.x / MAP_W, p.y / MAP_H);
      expect(q.x).toBeCloseTo(anchor.x);
      expect(q.y).toBeCloseTo(anchor.y);
    }
    // A plain lerp of the centre lets it wander mid-flight.
    const mid = toScreen(lerpCamera(cam, to, 0.5), PHONE, p.x / MAP_W, p.y / MAP_H);
    expect(Math.abs(mid.x - anchor.x) + Math.abs(mid.y - anchor.y)).toBeGreaterThan(0.5);
  });
  it('lands exactly on both ends, and blends zoom in log space', () => {
    const a = { cx: 300, cy: 400, s: 1.5 }, b = { cx: 520, cy: 610, s: 4 };
    const p = { x: 410, y: 500 };
    expect(lerpCameraAbout(a, b, 0, p).cx).toBeCloseTo(a.cx);
    expect(lerpCameraAbout(a, b, 0, p).cy).toBeCloseTo(a.cy);
    const end = lerpCameraAbout(a, b, 1, p);
    expect(end.cx).toBeCloseTo(b.cx);
    expect(end.cy).toBeCloseTo(b.cy);
    expect(end.s).toBeCloseTo(b.s);
    expect(lerpCameraAbout(a, b, 0.5, p).s).toBeCloseTo(Math.sqrt(1.5 * 4));
  });
});

describe('releaseVelocity', () => {
  /** A finger moving at (vx, vy) px/ms, sampled every `dt` ms until `t1`. */
  const path = (vx: number, vy: number, t1: number, dt = 8): Sample[] =>
    Array.from({ length: Math.floor(t1 / dt) + 1 }, (_, i) => ({ t: i * dt, x: 100 + vx * i * dt, y: 200 + vy * i * dt }));

  it('reads a steady drag at its speed', () => {
    const v = releaseVelocity(path(1.2, -0.5, 400), 404);
    expect(v.vx).toBeCloseTo(1.2);
    expect(v.vy).toBeCloseTo(-0.5);
  });
  it('looks only at the last FLING_WINDOW ms: a drag that slowed is read slow', () => {
    const fast = path(3, 0, 300);
    const end = fast[fast.length - 1];
    const slowTail = Array.from({ length: 20 }, (_, i) => ({ t: end.t + (i + 1) * 8, x: end.x + 0.1 * (i + 1) * 8, y: end.y }));
    const v = releaseVelocity([...fast, ...slowTail], slowTail[slowTail.length - 1].t + 4);
    expect(FLING_WINDOW).toBeLessThan(20 * 8);
    expect(v.vx).toBeCloseTo(0.1);
  });
  it('is zero when the finger held still before lifting', () => {
    const p = path(2, 0, 300), last = p[p.length - 1].t;
    expect(releaseVelocity(p, last + FLING_STILL + 1)).toEqual({ vx: 0, vy: 0 });
    expect(releaseVelocity(p, last + FLING_STILL - 5).vx).toBeCloseTo(2);
  });
  it('is zero without a path, and capped at FLING_MAX for a wild last sample', () => {
    expect(releaseVelocity([], 0)).toEqual({ vx: 0, vy: 0 });
    expect(releaseVelocity([{ t: 0, x: 0, y: 0 }], 2)).toEqual({ vx: 0, vy: 0 });
    const v = releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 10, x: 300, y: 400 }], 12);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(FLING_MAX);
    expect(v.vx / v.vy).toBeCloseTo(300 / 400);
  });
});

describe('glide', () => {
  it('leaves at the throw speed and decays by e every GLIDE_TAU', () => {
    expect(glideSpeed(2, 0)).toBeCloseTo(2);
    expect(glideSpeed(2, GLIDE_TAU)).toBeCloseTo(2 / Math.E);
    // The offset's slope at the lift is the throw's speed: no jump.
    expect(glideOffset(2, 1) / 1).toBeCloseTo(2, 2);
  });
  it('travels speed × GLIDE_TAU in all, and never further', () => {
    expect(glideOffset(1.5, 0)).toBe(0);
    expect(glideOffset(1.5, 1e6)).toBeCloseTo(1.5 * GLIDE_TAU);
    expect(glideOffset(-1.5, 1e6)).toBeCloseTo(-1.5 * GLIDE_TAU);
    let prev = 0;
    for (let t = 50; t <= 3000; t += 50) {
      const o = glideOffset(1.5, t);
      expect(o).toBeGreaterThan(prev);
      prev = o;
    }
  });
  it('a brisk throw is over in about 1.5 s, the hardest within ~1.6 s, a slow one at once', () => {
    expect(glideDuration(2)).toBeGreaterThan(1000);
    expect(glideDuration(2)).toBeLessThan(1500);
    expect(glideDuration(FLING_MAX)).toBeLessThan(1650);
    expect(glideDuration(GLIDE_STOP)).toBe(0);
    expect(glideSpeed(2, glideDuration(2))).toBeCloseTo(GLIDE_STOP);
  });
});
