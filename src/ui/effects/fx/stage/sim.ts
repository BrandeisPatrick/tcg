/**
 * The FX stage's world — the table seen from straight above, with height.
 *
 * Everything the stage draws lives in three dimensions: x / y are viewport
 * pixels on the table (the same space the slots' bounding boxes are in) and
 * z is height above it, toward the viewer. A camera hanging over the middle
 * of the viewport projects that to the screen, so a spark thrown upward
 * grows and slides outward as it climbs, falls back, bounces, and drags its
 * shadow across the paper below — the depth a flat print cannot show.
 *
 * Pure: no DOM, no canvas, no clock. `step` advances a world by `dt` seconds
 * and `project` is the camera, so both are pinned by tests; draw.ts paints a
 * world and FxStage.tsx owns the loop.
 */
import type { Pt } from '../geometry';

export interface Camera {
  /** The point on the table directly under the camera (viewport px). */
  cx: number;
  cy: number;
  /** Camera height above the table, px. Lower = stronger perspective. */
  f: number;
}

export const CAMERA_HEIGHT = 640;
/** Shadow offset per pixel of height — the light the tiles' own drop
 *  shadows imply: overhead, a little behind the top edge of the screen. */
export const LIGHT = { x: 0.08, y: 0.4 } as const;

export interface Projected { x: number; y: number; k: number }

/** Table space → screen. `k` is the magnification at that height. */
export function project(cam: Camera, x: number, y: number, z: number): Projected {
  const k = cam.f / (cam.f - Math.min(Math.max(z, 0), cam.f * 0.75));
  return { x: cam.cx + (x - cam.cx) * k, y: cam.cy + (y - cam.cy) * k, k };
}

/** Where something at height `z` drops its shadow on the table. */
export function shadowOf(x: number, y: number, z: number): Pt {
  return { x: x + z * LIGHT.x, y: y + z * LIGHT.y };
}

// ---------------------------------------------------------------------------
// Entities.
// ---------------------------------------------------------------------------

interface Timed {
  /** Seconds lived / to live, and seconds still to wait before appearing. */
  age: number;
  life: number;
  delay: number;
}

export type ParticleKind =
  | 'spark'    // a hot streak along its own velocity
  | 'ember'    // a glowing mote that floats
  | 'scrap'    // a chad of paper: two-sided, tumbling
  | 'shard'    // a splinter of glass or crystal
  | 'casing'   // a spent brass shell
  | 'drop'     // a bead of ink; leaves a splat where it lands
  | 'puff'     // smoke or dust
  | 'cross'    // the healing plus
  | 'star';    // a four-point glint

export interface Particle extends Timed {
  t: 'particle';
  kind: ParticleKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** px/s² toward the table; negative lifts. */
  gravity: number;
  /** Share of velocity the air takes per second. */
  drag: number;
  /** Energy kept bouncing off the table (0 sticks). */
  bounce: number;
  /** In-plane angle and its rate; flip is the tumble that shows the back. */
  rot: number; spin: number;
  flip: number; tumble: number;
  size: number;
  color: string;
  /** Back face of a scrap, core of a spark or an ember. */
  alt: string;
  /** 0..1 — picks a silhouette and a twinkle phase. */
  shape: number;
  landed: boolean;
  /** Circles a vertical axis through (x, y) at `w` rad/s, drawn in by
   *  `pull` of its radius per second. */
  orbit?: { x: number; y: number; w: number; pull: number };
}

/** A shockwave: a circle on the table (or rising off it) that widens. */
export interface Ring extends Timed {
  t: 'ring';
  x: number; y: number; z: number;
  /** px/s the ring climbs. */
  rise: number;
  r0: number; r1: number;
  width: number;
  color: string;
  dashed: boolean;
}

/** The comic-book star at an impact, over a soft bloom of light. */
export interface Flash extends Timed {
  t: 'flash';
  x: number; y: number; z: number;
  r: number;
  spikes: number;
  rot: number;
  /** How much further the spike along `rot` reaches — a muzzle flash
   *  stabbing down the line of the shot. */
  lance: number;
  color: string; alt: string;
}

/** A stain left on the table: an ink splat that dries away. */
export interface Decal extends Timed {
  t: 'decal';
  x: number; y: number;
  r: number;
  color: string;
  seed: number;
}

/** A projectile on a scripted arc: sideways bow (a quadratic through `c`)
 *  and a rise of `arc` px at mid-flight, with a comet tail behind it. */
export interface Bolt extends Timed {
  t: 'bolt';
  a: Pt; b: Pt; c: Pt;
  z0: number; z1: number; arc: number;
  size: number;
  color: string; alt: string;
  /** Flight time in seconds; `life` runs a little longer so the tail can
   *  collapse into the impact. */
  dur: number;
  /** u^ease — above 1 the bolt starts slow and arrives fast. */
  ease: number;
  /** Embers shed per second of flight. */
  embers: number;
  acc: number;
  x: number; y: number; z: number;
  /** x, y, z triples, oldest first. */
  tail: number[];
}

/** A bullet: a short bright streak flying level from `a` to `b`. */
export interface Tracer extends Timed {
  t: 'tracer';
  a: Pt; b: Pt;
  z: number;
  len: number;
  width: number;
  color: string; alt: string;
}

export type Ent = Particle | Ring | Flash | Decal | Bolt | Tracer;

export interface World {
  ents: Ent[];
  /** State of the world's own PRNG (trail embers, splat shapes). */
  seed: number;
}

export function createWorld(seed = 0x9e3779b9): World {
  return { ents: [], seed };
}

function rand(world: World): number {
  world.seed = (Math.imul(world.seed, 1664525) + 1013904223) >>> 0;
  return world.seed / 4294967296;
}

const PARTICLE_DEFAULTS = {
  t: 'particle' as const,
  z: 0, vx: 0, vy: 0, vz: 0,
  gravity: 1500, drag: 0, bounce: 0,
  rot: 0, spin: 0, flip: 0, tumble: 0,
  size: 4, color: '#ffffff', alt: '#ffffff', shape: 0,
  age: 0, life: 0.6, delay: 0, landed: false,
};

export function particle(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y'>): Particle {
  return { ...PARTICLE_DEFAULTS, ...p };
}

/** Below this fall speed a bounce is not worth drawing — the thing settles. */
const SETTLE_SPEED = 70;
const TAIL_POINTS = 14;

export function quadAt(a: Pt, c: Pt, b: Pt, u: number): Pt {
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
}

function stepParticle(p: Particle, dt: number, world: World, born: Ent[]): boolean {
  if (p.landed) {
    // At rest on the table: a last short slide, then it lies still.
    const f = Math.exp(-9 * dt);
    p.vx *= f; p.vy *= f;
    p.x += p.vx * dt; p.y += p.vy * dt;
    return true;
  }
  p.vz -= p.gravity * dt;
  if (p.drag > 0) {
    const d = Math.exp(-p.drag * dt);
    p.vx *= d; p.vy *= d; p.vz *= d;
  }
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  p.rot += p.spin * dt;
  p.flip += p.tumble * dt;
  if (p.orbit) {
    const o = p.orbit;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const a = o.w * dt;
    const s = Math.max(0, 1 - o.pull * dt);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    p.x = o.x + (dx * cos - dy * sin) * s;
    p.y = o.y + (dx * sin + dy * cos) * s;
  }
  if (p.z <= 0 && p.vz < 0) {
    p.z = 0;
    if (p.kind === 'drop') {
      born.push({
        t: 'decal', x: p.x, y: p.y, r: p.size * (1.7 + rand(world) * 1.3), color: p.color,
        seed: rand(world), age: 0, life: 1.5, delay: 0,
      });
      return false;
    }
    if (p.bounce > 0 && -p.vz > SETTLE_SPEED) {
      p.vz = -p.vz * p.bounce;
      p.vx *= 0.62; p.vy *= 0.62;
      p.spin *= 0.7; p.tumble *= 0.75;
    } else {
      p.landed = true;
      p.vz = 0;
      p.vx *= 0.35; p.vy *= 0.35;
      p.spin = 0; p.tumble = 0;
      // Lies flat, whichever face is up.
      p.flip = Math.round(p.flip / Math.PI) * Math.PI;
    }
  }
  return true;
}

function stepBolt(b: Bolt, dt: number, world: World, born: Ent[]): void {
  const u = Math.min(1, b.age / b.dur);
  if (u >= 1) {
    // Arrived: the head is gone and the tail runs into the impact.
    b.tail.splice(0, 6);
    return;
  }
  const e = Math.pow(u, b.ease);
  const p = quadAt(b.a, b.c, b.b, e);
  b.x = p.x; b.y = p.y;
  b.z = b.z0 + (b.z1 - b.z0) * e + b.arc * Math.sin(Math.PI * e);
  b.tail.push(b.x, b.y, b.z);
  if (b.tail.length > TAIL_POINTS * 3) b.tail.splice(0, 3);
  b.acc += b.embers * dt;
  while (b.acc >= 1) {
    b.acc -= 1;
    const a = rand(world) * Math.PI * 2;
    const s = 20 + rand(world) * 60;
    born.push(particle({
      kind: 'ember', x: b.x, y: b.y, z: b.z,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 30 + rand(world) * 90,
      gravity: 520, drag: 1.4,
      size: b.size * (0.2 + rand(world) * 0.2), color: b.color, alt: b.alt,
      shape: rand(world), life: 0.3 + rand(world) * 0.3,
    }));
  }
}

/** Advance the world by `dt` seconds: age, move, bounce, retire. */
export function step(world: World, dt: number): void {
  if (dt <= 0 || world.ents.length === 0) return;
  const kept: Ent[] = [];
  const born: Ent[] = [];
  for (const e of world.ents) {
    if (e.delay > 0) {
      e.delay -= dt;
      kept.push(e);
      continue;
    }
    e.age += dt;
    if (e.age >= e.life) continue;
    if (e.t === 'particle') {
      if (!stepParticle(e, dt, world, born)) continue;
    } else if (e.t === 'bolt') {
      stepBolt(e, dt, world, born);
    } else if (e.t === 'ring') {
      e.z += e.rise * dt;
    }
    kept.push(e);
  }
  world.ents = born.length ? kept.concat(born) : kept;
}
