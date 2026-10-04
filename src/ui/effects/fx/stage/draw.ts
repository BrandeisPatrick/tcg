/**
 * Paints a stage world onto a 2D canvas: stains and shockwaves on the table
 * first, then the shadow of everything in the air, then the things
 * themselves from the lowest up — what is nearest the viewer is drawn last.
 *
 * The look stays in the poster's idiom — flat inks under a dark keyline — so
 * the same spark reads on the cream sheet and on a dark portrait. Depth comes
 * from scale, parallax and the shadows; the soft blooms are only seasoning.
 */
import { poster } from '../../../poster';
import { seeded } from '../geometry';
import {
  type Bolt, type Camera, type Decal, type Ent, type Flash, type Particle, type Ring, type Tracer, type World,
  project, shadowOf,
} from './sim';

type Ctx = CanvasRenderingContext2D;

const INK = poster.ink;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Colour and sprites.
// ---------------------------------------------------------------------------

const rgbCache = new Map<string, [number, number, number, number]>();

function rgb(color: string): [number, number, number, number] {
  let c = rgbCache.get(color);
  if (c) return c;
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  } else {
    const m = /^rgba?\(([^)]+)\)$/i.exec(color);
    const p = m ? m[1].split(',').map((s) => parseFloat(s)) : [255, 255, 255, 1];
    c = [p[0], p[1], p[2], p[3] ?? 1];
  }
  rgbCache.set(color, c);
  return c;
}

export function withAlpha(color: string, a: number): string {
  const [r, g, b, base] = rgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(base * a * 1000) / 1000})`;
}

const SPRITE = 64;
const sprites = new Map<string, HTMLCanvasElement>();

/** A soft round dab of `color` — blooms, smoke, and (in black) shadows. */
function softDot(color: string): HTMLCanvasElement {
  let s = sprites.get(color);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = SPRITE;
    const g = s.getContext('2d')!;
    const h = SPRITE / 2;
    const grad = g.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, withAlpha(color, 1));
    grad.addColorStop(0.4, withAlpha(color, 0.5));
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    sprites.set(color, s);
  }
  return s;
}

function dab(ctx: Ctx, color: string, x: number, y: number, rx: number, ry = rx): void {
  ctx.drawImage(softDot(color), x - rx, y - ry, rx * 2, ry * 2);
}

// ---------------------------------------------------------------------------
// Silhouettes, in unit coordinates.
// ---------------------------------------------------------------------------

const SCRAPS = [
  [-1, -0.7, 0.8, -0.9, 1, 0.6, -0.7, 0.8],
  [-0.9, -0.5, 0.4, -1, 1, 0.1, 0.2, 0.9, -1, 0.5],
  [-1, -0.8, 1, -0.5, 0.6, 0.8, -0.8, 0.6],
  [-0.6, -1, 0.9, -0.6, 0.8, 0.7, -1, 0.9],
];
const SHARDS = [
  [0, -1.3, 0.55, 0.7, -0.5, 0.9],
  [-0.2, -1.4, 0.7, -0.1, 0.1, 1.1, -0.6, 0.3],
  [0.1, -1.2, 0.8, 0.9, -0.7, 0.6],
];
const CROSS = [-0.33, -1, 0.33, -1, 0.33, -0.33, 1, -0.33, 1, 0.33, 0.33, 0.33, 0.33, 1, -0.33, 1, -0.33, 0.33, -1, 0.33, -1, -0.33, -0.33, -0.33];
const STAR = [0, -1, 0.24, -0.24, 1, 0, 0.24, 0.24, 0, 1, -0.24, 0.24, -1, 0, -0.24, -0.24];
const CASING = [-1.3, -0.5, 0.9, -0.5, 1.3, -0.26, 1.3, 0.26, 0.9, 0.5, -1.3, 0.5];

const pick = <T,>(set: T[], shape: number): T => set[Math.min(set.length - 1, Math.floor(shape * set.length))];

/** Trace a unit silhouette at (x, y): scaled by `s`, turned by `rot`, and
 *  foreshortened across its own v axis by `c` (the cosine of its tumble). */
function trace(ctx: Ctx, v: number[], x: number, y: number, s: number, rot: number, c: number): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  ctx.beginPath();
  for (let i = 0; i < v.length; i += 2) {
    const u = v[i] * s;
    const w = v[i + 1] * s * c;
    const px = x + u * cos - w * sin;
    const py = y + u * sin + w * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** 1 for most of a life, ramping to 0 over its last `tail` share. */
function fade(e: { age: number; life: number }, tail = 0.3): number {
  return Math.max(0, Math.min(1, (e.life - e.age) / (e.life * tail)));
}

// ---------------------------------------------------------------------------
// Shadows.
// ---------------------------------------------------------------------------

function shadowParticle(ctx: Ctx, p: Particle): void {
  if (p.kind === 'puff' || p.kind === 'ember') return;   // smoke and light cast none
  const a = fade(p) * 0.34 / (1 + p.z / 80);
  if (a < 0.02) return;
  const sh = shadowOf(p.x, p.y, p.z);
  const r = p.size * (p.kind === 'spark' ? 0.9 : 1.25) * (1 + p.z / 110);
  ctx.globalAlpha = a;
  dab(ctx, '#000000', sh.x, sh.y + (p.landed ? p.size * 0.35 : 0), r * 1.25, r * 0.9);
}

function shadowBolt(ctx: Ctx, b: Bolt): void {
  if (b.age >= b.dur) return;
  const sh = shadowOf(b.x, b.y, b.z);
  const r = b.size * (1.2 + b.z / 90);
  ctx.globalAlpha = 0.36 / (1 + b.z / 150);
  dab(ctx, '#000000', sh.x, sh.y, r * 1.3, r * 0.95);
}

function tracerEnds(e: Tracer): { hx: number; hy: number; tx: number; ty: number; a: number } {
  const u = e.age / e.life;
  const eo = 1 - Math.pow(1 - u, 1.5);
  const dx = e.b.x - e.a.x;
  const dy = e.b.y - e.a.y;
  const L = Math.hypot(dx, dy) || 1;
  const head = L * eo;
  const tail = Math.max(0, head - e.len);
  return {
    hx: e.a.x + (dx / L) * head, hy: e.a.y + (dy / L) * head,
    tx: e.a.x + (dx / L) * tail, ty: e.a.y + (dy / L) * tail,
    a: u < 0.08 ? u / 0.08 : u > 0.88 ? (1 - u) / 0.12 : 1,
  };
}

function shadowTracer(ctx: Ctx, e: Tracer): void {
  const t = tracerEnds(e);
  const s0 = shadowOf(t.tx, t.ty, e.z);
  const s1 = shadowOf(t.hx, t.hy, e.z);
  ctx.globalAlpha = 0.2 * t.a;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = e.width + 1.5;
  ctx.lineCap = 'round';
  line(ctx, s0.x, s0.y, s1.x, s1.y);
}

// ---------------------------------------------------------------------------
// Bodies.
// ---------------------------------------------------------------------------

function drawParticle(ctx: Ctx, cam: Camera, p: Particle): void {
  const a = fade(p);
  if (a <= 0) return;
  const pr = project(cam, p.x, p.y, p.z);
  const s = p.size * pr.k;
  switch (p.kind) {
    case 'spark': {
      // A streak along its own motion; a spent spark is a dot of ash.
      const T = 0.034;
      const t = p.landed ? pr : project(cam, p.x - p.vx * T, p.y - p.vy * T, p.z - p.vz * T);
      let tx = t.x;
      let ty = t.y;
      const len = Math.hypot(pr.x - tx, pr.y - ty);
      if (len < s) { tx = pr.x - s * 0.5; ty = pr.y; }
      ctx.lineCap = 'round';
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = INK;
      ctx.lineWidth = s + 1.6;
      line(ctx, tx, ty, pr.x, pr.y);
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = s;
      line(ctx, tx, ty, pr.x, pr.y);
      ctx.strokeStyle = p.alt;
      ctx.lineWidth = s * 0.45;
      line(ctx, (tx + pr.x) / 2, (ty + pr.y) / 2, pr.x, pr.y);
      return;
    }
    case 'ember': {
      const r = s * (0.75 + 0.25 * Math.sin(p.age * 22 + p.shape * TAU));
      ctx.globalAlpha = a * 0.55;
      dab(ctx, p.color, pr.x, pr.y, r * 3.2);
      ctx.globalAlpha = a;
      trace(ctx, STAR, pr.x, pr.y, r * 1.55, p.rot, 1);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = withAlpha(INK, 0.55);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = p.alt;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, r * 0.42, 0, TAU);
      ctx.fill();
      return;
    }
    case 'puff': {
      const u = p.age / p.life;
      const r = s * (1 + u * 1.7);
      ctx.globalAlpha = Math.pow(1 - u, 1.3) * Math.min(1, u / 0.08);
      dab(ctx, p.color, pr.x, pr.y, r);
      return;
    }
    case 'drop': {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, s, 0, TAU);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = withAlpha(INK, 0.6);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.alt, 0.7);
      ctx.beginPath();
      ctx.arc(pr.x - s * 0.3, pr.y - s * 0.3, s * 0.28, 0, TAU);
      ctx.fill();
      return;
    }
    default: {
      // The flat, two-sided things: they tumble, so they foreshorten and
      // show their other face.
      const c0 = Math.cos(p.flip);
      const c = Math.abs(c0) < 0.16 ? (c0 < 0 ? -0.16 : 0.16) : c0;
      const verts = p.kind === 'scrap' ? pick(SCRAPS, p.shape)
        : p.kind === 'shard' ? pick(SHARDS, p.shape)
        : p.kind === 'cross' ? CROSS
        : p.kind === 'casing' ? CASING
        : STAR;
      trace(ctx, verts, pr.x, pr.y, s, p.rot, c);
      ctx.globalAlpha = a;
      // Paper, crosses and glints have a second face; glass and brass do not.
      ctx.fillStyle = c >= 0 || p.kind === 'shard' || p.kind === 'casing' ? p.color : p.alt;
      ctx.fill();
      // Turned away from the light, a face darkens.
      ctx.fillStyle = `rgba(0, 0, 0, ${(1 - Math.abs(c0)) * 0.3})`;
      ctx.fill();
      ctx.strokeStyle = withAlpha(INK, 0.62);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (p.kind === 'shard') {
        // One lit facet.
        const cos = Math.cos(p.rot);
        const sin = Math.sin(p.rot);
        const at = (u: number, w: number): [number, number] => [pr.x + (u * cos - w * c * sin) * s, pr.y + (u * sin + w * c * cos) * s];
        ctx.beginPath();
        ctx.moveTo(...at(verts[0], verts[1]));
        ctx.lineTo(...at(verts[2] * 0.5, verts[3] * 0.5));
        ctx.lineTo(...at(0, 0.1));
        ctx.closePath();
        ctx.fillStyle = withAlpha(p.alt, 0.6);
        ctx.fill();
      } else if (p.kind === 'casing') {
        // The rim at the open end, and a streak of light down the brass.
        const cos = Math.cos(p.rot);
        const sin = Math.sin(p.rot);
        const at = (u: number, w: number): [number, number] => [pr.x + (u * cos - w * c * sin) * s, pr.y + (u * sin + w * c * cos) * s];
        ctx.strokeStyle = withAlpha(INK, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(...at(-0.85, -0.5));
        ctx.lineTo(...at(-0.85, 0.5));
        ctx.stroke();
        ctx.strokeStyle = withAlpha(p.alt, 0.85);
        ctx.beginPath();
        ctx.moveTo(...at(-0.6, -0.18));
        ctx.lineTo(...at(0.8, -0.18));
        ctx.stroke();
      }
    }
  }
}

function drawRing(ctx: Ctx, cam: Camera, e: Ring): void {
  const u = e.age / e.life;
  const eo = 1 - Math.pow(1 - u, 3);
  const pr = project(cam, e.x, e.y, e.z);
  const r = (e.r0 + (e.r1 - e.r0) * eo) * pr.k;
  const a = Math.min(1, u / 0.1) * Math.pow(1 - u, 1.4);
  const w = Math.max(0.8, e.width * (1 - u * 0.7)) * pr.k;
  if (e.dashed) ctx.setLineDash([w * 3.2, w * 2.4]);
  ctx.beginPath();
  ctx.arc(pr.x, pr.y, r, 0, TAU);
  // The body of the wave: a wide soft band of the colour behind its front.
  ctx.globalAlpha = a * 0.16;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = w * 5;
  ctx.stroke();
  ctx.globalAlpha = a * 0.45;
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 2;
  ctx.stroke();
  ctx.globalAlpha = a;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = w;
  ctx.stroke();
  if (e.dashed) ctx.setLineDash([]);
}

function starPath(ctx: Ctx, x: number, y: number, r: number, inner: number, spikes: number, rot: number, lance = 0): void {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (i / (spikes * 2)) * TAU;
    // Every other long spike is shorter — a hand-cut star, not a gear.
    const rr = i === 0 ? r * (1 + lance) : i % 2 ? r * inner : r * (i % 4 ? 0.78 : 1);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawFlash(ctx: Ctx, cam: Camera, e: Flash): void {
  const u = e.age / e.life;
  const grow = u < 0.22 ? 0.35 + (u / 0.22) * 0.8 : 1.15 - (u - 0.22) * 0.3;
  const a = u < 0.45 ? 1 : 1 - (u - 0.45) / 0.55;
  const pr = project(cam, e.x, e.y, e.z);
  const r = e.r * grow * pr.k;
  ctx.globalAlpha = a * 0.75;
  dab(ctx, e.color, pr.x, pr.y, r * 2.3);
  ctx.globalAlpha = a;
  starPath(ctx, pr.x, pr.y, r, 0.4, e.spikes, e.rot, e.lance);
  ctx.fillStyle = e.alt;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  starPath(ctx, pr.x, pr.y, r * 0.56, 0.45, e.spikes, e.lance ? e.rot : e.rot + 0.3, e.lance);
  ctx.fillStyle = e.color;
  ctx.fill();
}

function drawDecal(ctx: Ctx, e: Decal): void {
  const grow = Math.min(1, e.age / 0.07);
  const half = e.life * 0.5;
  const a = e.age > half ? 1 - (e.age - half) / half : 1;
  const r = e.r * (0.5 + 0.5 * grow);
  const rng = seeded(Math.floor(e.seed * 1e9) + 1);
  ctx.globalAlpha = a * 0.85;
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r * 0.58, 0, TAU);
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * TAU + rng() * 0.6;
    const d = r * (0.45 + rng() * 0.55);
    const rr = r * (0.14 + rng() * 0.2);
    const x = e.x + Math.cos(ang) * d;
    const y = e.y + Math.sin(ang) * d;
    ctx.moveTo(x + rr, y);
    ctx.arc(x, y, rr, 0, TAU);
  }
  ctx.fill();
}

function drawBolt(ctx: Ctx, cam: Camera, b: Bolt): void {
  const n = b.tail.length / 3;
  if (n < 1) return;
  const pts: { x: number; y: number; k: number }[] = [];
  for (let i = 0; i < n; i++) pts.push(project(cam, b.tail[i * 3], b.tail[i * 3 + 1], b.tail[i * 3 + 2]));
  ctx.lineCap = 'round';
  // The comet tail: an ink keyline, the colour, a hot core near the head.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) {
      const f = i / n;
      if (pass === 2 && f < 0.6) continue;
      const w = b.size * pts[i].k * f * 1.15;
      ctx.globalAlpha = pass === 0 ? f * 0.38 : f * 0.92;
      ctx.strokeStyle = pass === 0 ? INK : pass === 1 ? b.color : b.alt;
      ctx.lineWidth = pass === 0 ? w + 2.6 : pass === 1 ? w : w * 0.4;
      line(ctx, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
  }
  if (b.age >= b.dur) return;
  const head = pts[n - 1];
  const r = b.size * head.k;
  ctx.globalAlpha = 0.75;
  dab(ctx, b.color, head.x, head.y, r * 3.6);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r * 0.95, 0, TAU);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(head.x - r * 0.12, head.y - r * 0.15, r * 0.5, 0, TAU);
  ctx.fillStyle = b.alt;
  ctx.fill();
}

function drawTracer(ctx: Ctx, cam: Camera, e: Tracer): void {
  const t = tracerEnds(e);
  const h = project(cam, t.hx, t.hy, e.z);
  const tl = project(cam, t.tx, t.ty, e.z);
  const w = e.width * h.k;
  ctx.lineCap = 'round';
  ctx.globalAlpha = t.a * 0.42;
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 2;
  line(ctx, tl.x, tl.y, h.x, h.y);
  ctx.globalAlpha = t.a;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = w;
  line(ctx, tl.x, tl.y, h.x, h.y);
  ctx.strokeStyle = e.alt;
  ctx.lineWidth = w * 0.42;
  line(ctx, tl.x + (h.x - tl.x) * 0.45, tl.y + (h.y - tl.y) * 0.45, h.x, h.y);
  ctx.globalAlpha = t.a * 0.8;
  dab(ctx, e.color, h.x, h.y, w * 2.6);
}

// ---------------------------------------------------------------------------
// The frame.
// ---------------------------------------------------------------------------

/** Height for the back-to-front sort; −1 is "painted on the table". */
function heightOf(e: Ent): number {
  if (e.t === 'decal') return -1;
  if (e.t === 'ring' && e.z < 6) return -1;
  return e.z;
}

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

/** A box that takes in everything `paint` will draw for this world — bodies,
 *  blooms and shadows — so the loop can clear just that much next frame.
 *  Generous rather than exact; null when there is nothing to draw. */
export function boundsOf(world: World, cam: Camera): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x: number, y: number, r: number) => {
    if (x - r < x0) x0 = x - r;
    if (y - r < y0) y0 = y - r;
    if (x + r > x1) x1 = x + r;
    if (y + r > y1) y1 = y + r;
  };
  const body = (x: number, y: number, z: number, r: number) => {
    const p = project(cam, x, y, z);
    take(p.x, p.y, r * p.k);
    const sh = shadowOf(x, y, z);
    take(sh.x, sh.y, r * (1 + z / 90));
  };
  for (const e of world.ents) {
    if (e.delay > 0) continue;
    switch (e.t) {
      case 'particle': body(e.x, e.y, e.z, e.size * 5 + 30); break;
      case 'flash': body(e.x, e.y, e.z, e.r * (1 + e.lance) * 2.6 + 8); break;
      case 'decal': take(e.x, e.y, e.r * 1.6 + 4); break;
      case 'ring': body(e.x, e.y, e.z, Math.max(e.r0, e.r1) + e.width * 4 + 6); break;
      case 'tracer': body(e.a.x, e.a.y, e.z, e.width * 4 + 8); body(e.b.x, e.b.y, e.z, e.width * 4 + 8); break;
      case 'bolt': {
        body(e.x, e.y, e.z, e.size * 4 + 8);
        for (let i = 0; i < e.tail.length; i += 3) body(e.tail[i], e.tail[i + 1], e.tail[i + 2], e.size * 2 + 6);
        break;
      }
    }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 };
}

/** Paint every live entity. The context is in CSS pixels; the caller clears. */
export function paint(ctx: Ctx, world: World, cam: Camera): void {
  const live = world.ents.filter((e) => e.delay <= 0);
  if (live.length === 0) return;
  // On the table: stains, then the shockwaves that hug it.
  for (const e of live) if (e.t === 'decal') drawDecal(ctx, e);
  for (const e of live) if (e.t === 'ring' && e.z < 6) drawRing(ctx, cam, e);
  for (const e of live) {
    if (e.t === 'particle') shadowParticle(ctx, e);
    else if (e.t === 'bolt') shadowBolt(ctx, e);
    else if (e.t === 'tracer') shadowTracer(ctx, e);
  }
  const air = live.filter((e) => heightOf(e) >= 0).sort((p, q) => heightOf(p) - heightOf(q));
  for (const e of air) {
    switch (e.t) {
      case 'particle': drawParticle(ctx, cam, e); break;
      case 'ring': drawRing(ctx, cam, e); break;
      case 'flash': drawFlash(ctx, cam, e); break;
      case 'bolt': drawBolt(ctx, cam, e); break;
      case 'tracer': drawTracer(ctx, cam, e); break;
    }
  }
  ctx.globalAlpha = 1;
}
