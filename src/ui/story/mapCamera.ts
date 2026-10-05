/**
 * The story map's camera, as pure math. The map is a fixed sheet in its own
 * space (MAP_W × MAP_H units, the space nycGeo.ts was baked into; stop x/y
 * are that space normalised to 0..1). A camera says which map point sits at
 * the centre of the viewport and how many screen px one map unit covers.
 *
 * The sheet is full-bleed: it always covers the viewport, so the least zoom
 * is "cover" and the camera may never show past an edge of the paper.
 * Everything here is unit-tested (tests/ui/story-camera.spec.ts); the hook
 * in useMapCamera.ts owns the gestures and the timing.
 */

export const MAP_W = 840;
export const MAP_H = 1080;

/** Map point at the viewport centre (map units) and px per map unit. */
export interface Camera { cx: number; cy: number; s: number }
/** The viewport, in CSS px. */
export interface Frame { w: number; h: number }
/** Insets from each viewport edge (CSS px) that a framing must keep clear. */
export interface Pad { top: number; right: number; bottom: number; left: number }

/** Closest zoom, relative to cover — and never less than ABS_MAX_SCALE. */
export const MAX_ZOOM = 3.2;
/** Absolute floor for the closest zoom (px per map unit). A phone's cover is
 *  ~0.78, so 3.2× cover would stop it short of the map's street-level
 *  detail; this lets every screen reach the same reading distance. */
export const ABS_MAX_SCALE = 4.6;

/** Zoom bands for the map's detail layer, in absolute px per map unit (not ×
 *  cover, which differs between a desktop and a phone). The screen sets the
 *  band from the zoom the sheet is laid out at, so it changes when the camera
 *  comes to rest, never during a gesture. */
export const LOD_MID = 2.4;
export const LOD_NEAR = 3.6;
export type LodBand = 'far' | 'mid' | 'near';
export function lodBand(s: number): LodBand {
  return s >= LOD_NEAR ? 'near' : s >= LOD_MID ? 'mid' : 'far';
}

/** px per map unit at which the sheet exactly covers the viewport. */
export function coverScale(frame: Frame): number {
  return Math.max(frame.w / MAP_W, frame.h / MAP_H);
}

export function scaleLimits(frame: Frame): { min: number; max: number } {
  const min = coverScale(frame);
  return { min, max: Math.max(min * MAX_ZOOM, ABS_MAX_SCALE) };
}

/** 0 at the widest view, 1 at the closest — log-spaced, so each zoom step
 *  moves it by the same amount. Drives the stop markers' gentle growth. */
export function zoomProgress(cam: Camera, frame: Frame): number {
  const { min, max } = scaleLimits(frame);
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, Math.log(cam.s / min) / Math.log(max / min)));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Bring a camera inside the limits: zoom between cover and the max, and the
 *  centre held so no viewport edge passes the edge of the sheet. */
export function clampCamera(cam: Camera, frame: Frame): Camera {
  const { min, max } = scaleLimits(frame);
  const s = clamp(cam.s, min, max);
  const hw = frame.w / (2 * s), hh = frame.h / (2 * s);
  // At exactly cover one axis has no play at all; centre it.
  const cx = hw * 2 >= MAP_W ? MAP_W / 2 : clamp(cam.cx, hw, MAP_W - hw);
  const cy = hh * 2 >= MAP_H ? MAP_H / 2 : clamp(cam.cy, hh, MAP_H - hh);
  return { cx, cy, s };
}

/** Screen position (CSS px, viewport-relative) of a normalised map point. */
export function toScreen(cam: Camera, frame: Frame, nx: number, ny: number): { x: number; y: number } {
  return {
    x: (nx * MAP_W - cam.cx) * cam.s + frame.w / 2,
    y: (ny * MAP_H - cam.cy) * cam.s + frame.h / 2,
  };
}

/** Map point (map units) under a screen position. */
export function toMap(cam: Camera, frame: Frame, sx: number, sy: number): { x: number; y: number } {
  return {
    x: cam.cx + (sx - frame.w / 2) / cam.s,
    y: cam.cy + (sy - frame.h / 2) / cam.s,
  };
}

/** Slide the sheet by a screen delta (a drag). */
export function panBy(cam: Camera, frame: Frame, dx: number, dy: number): Camera {
  return clampCamera({ cx: cam.cx - dx / cam.s, cy: cam.cy - dy / cam.s, s: cam.s }, frame);
}

/** A two-finger step: the map point under `from` lands under `to`, scaled by
 *  `factor`. With from = to it is a zoom about that anchor. Clamping at the
 *  sheet's edges and zoom limits wins over the anchor. */
export function pinchTo(
  cam: Camera, frame: Frame, factor: number,
  from: { x: number; y: number }, to: { x: number; y: number },
): Camera {
  const { min, max } = scaleLimits(frame);
  const p = toMap(cam, frame, from.x, from.y);
  const s = clamp(cam.s * factor, min, max);
  return clampCamera({
    cx: p.x - (to.x - frame.w / 2) / s,
    cy: p.y - (to.y - frame.h / 2) / s,
    s,
  }, frame);
}

/** Zoom by `factor` keeping the map point under (sx, sy) where it is. */
export function zoomAt(cam: Camera, frame: Frame, factor: number, sx: number, sy: number): Camera {
  return pinchTo(cam, frame, factor, { x: sx, y: sy }, { x: sx, y: sy });
}

/** The camera that fits normalised points inside the viewport minus `pad`,
 *  centred in that free area, no closer than `maxScale` (and no wider than
 *  cover — the sheet stays full-bleed). */
export function frameStops(
  points: { x: number; y: number }[], frame: Frame, pad: Pad, maxScale: number,
): Camera {
  const { min } = scaleLimits(frame);
  if (points.length === 0) return clampCamera({ cx: MAP_W / 2, cy: MAP_H / 2, s: min }, frame);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x * MAP_W); x1 = Math.max(x1, p.x * MAP_W);
    y0 = Math.min(y0, p.y * MAP_H); y1 = Math.max(y1, p.y * MAP_H);
  }
  const availW = Math.max(1, frame.w - pad.left - pad.right);
  const availH = Math.max(1, frame.h - pad.top - pad.bottom);
  const fit = Math.min(
    x1 > x0 ? availW / (x1 - x0) : Infinity,
    y1 > y0 ? availH / (y1 - y0) : Infinity,
  );
  const s = Math.max(min, Math.min(fit, maxScale));
  // Put the points' centre at the centre of the free area, not the viewport.
  const ax = pad.left + availW / 2, ay = pad.top + availH / 2;
  return clampCamera({
    cx: (x0 + x1) / 2 - (ax - frame.w / 2) / s,
    cy: (y0 + y1) / 2 - (ay - frame.h / 2) / s,
    s,
  }, frame);
}

/** Smallest pan that brings a normalised point inside the viewport minus
 *  `pad` (null when it already is). For nudging a stop out from under a dock. */
export function revealPoint(
  cam: Camera, frame: Frame, nx: number, ny: number, pad: Pad,
): Camera | null {
  const p = toScreen(cam, frame, nx, ny);
  const lo = { x: pad.left, y: pad.top }, hi = { x: frame.w - pad.right, y: frame.h - pad.bottom };
  const fix = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 - v : v < a ? a - v : v > b ? b - v : 0);
  const dx = fix(p.x, lo.x, hi.x), dy = fix(p.y, lo.y, hi.y);
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
  return panBy(cam, frame, dx, dy);
}

/** Blend two cameras: the zoom in log space (so a fly-in feels even), the
 *  centre linearly. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t),
  };
}

/** Blend two cameras about a map point `p` (map units): the zoom in log
 *  space, p's screen position in a straight line. A zoom about a point (a
 *  double tap) then holds that point under the finger the whole way, where a
 *  plain lerp of the centre lets it wander mid-flight. */
export function lerpCameraAbout(a: Camera, b: Camera, t: number, p: { x: number; y: number }): Camera {
  const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t);
  // p's offset from the viewport centre, in screen px, at each end.
  const ox = (p.x - a.cx) * a.s + ((p.x - b.cx) * b.s - (p.x - a.cx) * a.s) * t;
  const oy = (p.y - a.cy) * a.s + ((p.y - b.cy) * b.s - (p.y - a.cy) * a.s) * t;
  return { cx: p.x - ox / s, cy: p.y - oy / s, s };
}

// ---- momentum ---------------------------------------------------------------

/** One point of a drag: a time stamp (ms) and a screen position (px). */
export interface Sample { t: number; x: number; y: number }

/** How far back a release looks to judge the finger's speed (ms). */
export const FLING_WINDOW = 100;
/** A finger that held still this long before lifting was placing the map,
 *  not throwing it (ms). */
export const FLING_STILL = 60;
/** Slower than this (px/ms) at release is a placed map: no glide. */
export const FLING_MIN = 0.15;
/** A cap on the throw (px/ms), against a noisy last sample. */
export const FLING_MAX = 4;
/** The glide's time constant (ms): its speed falls by e every this long, as
 *  a native map's does. It travels speed × GLIDE_TAU px in all. */
export const GLIDE_TAU = 325;
/** The glide stops once it is this slow (px/ms, ≈ ½ px a frame): a 2 px/ms
 *  throw is over in ~1.35 s, the hardest one in ~1.6 s. */
export const GLIDE_STOP = 0.03;

/** The finger's velocity (px/ms) as it lifted: its average over the last
 *  FLING_WINDOW ms of travel, or zero if it had held still before lifting. */
export function releaseVelocity(samples: readonly Sample[], tUp: number): { vx: number; vy: number } {
  const zero = { vx: 0, vy: 0 };
  const n = samples.length;
  if (n < 2) return zero;
  const last = samples[n - 1];
  if (tUp - last.t > FLING_STILL) return zero;
  let i = n - 2;
  while (i > 0 && last.t - samples[i - 1].t <= FLING_WINDOW) i--;
  const first = samples[i];
  const dt = last.t - first.t;
  if (dt <= 0 || dt > FLING_WINDOW * 2) return zero;
  let vx = (last.x - first.x) / dt, vy = (last.y - first.y) / dt;
  const v = Math.hypot(vx, vy);
  if (v > FLING_MAX) { vx *= FLING_MAX / v; vy *= FLING_MAX / v; }
  return { vx, vy };
}

/** How far a glide thrown at v (px/ms) has carried the map after t ms:
 *  exponential decay, so it leaves the finger at the finger's own speed. */
export function glideOffset(v: number, t: number): number {
  return v * GLIDE_TAU * (1 - Math.exp(-t / GLIDE_TAU));
}

/** The glide's speed (px/ms) t ms after a throw at v. */
export function glideSpeed(v: number, t: number): number {
  return v * Math.exp(-t / GLIDE_TAU);
}

/** How long a glide thrown at `speed` (px/ms) runs before it stops. */
export function glideDuration(speed: number): number {
  return speed <= GLIDE_STOP ? 0 : GLIDE_TAU * Math.log(speed / GLIDE_STOP);
}
