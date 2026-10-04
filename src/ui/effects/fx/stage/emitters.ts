/**
 * What the stage throws. Each emitter turns a point on the table and a seed
 * into a handful of entities for the world — pure and seeded, so a burst
 * scatters the same way every time and its make-up can be pinned by tests.
 *
 * The first half is the vocabulary (sparks, paper chads, glass, embers, ink
 * drops, smoke, shockwaves, projectiles); the second half is the recipes the
 * FX components fire: a bullet striking, a spirit burst, a card going down.
 *
 * Speeds are px/s and heights px above the table. Timings an FX component
 * hands over (`dur`, `gap`, `delay`) are milliseconds, like the rest of the
 * FX layer. `density` thins a burst on small screens.
 */
import { poster } from '../../../poster';
import { FX_INK } from '../fxCatalog';
import { type Pt, dist, seeded } from '../geometry';
import { type Ent, type Particle, particle } from './sim';

type Range = [number, number];

const TAU = Math.PI * 2;
const MS = 1 / 1000;
const span = (rng: () => number, [lo, hi]: Range) => lo + rng() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const count = (n: number, density = 1) => Math.max(1, Math.round(n * density));
/** A throw angle: inside a cone when the burst has a direction, all round otherwise. */
const aim = (rng: () => number, dir: number | undefined, spread: number) =>
  (dir == null ? rng() * TAU : dir + (rng() - 0.5) * spread);

interface Burst {
  at: Pt;
  seed: number;
  count: number;
  /** Throw into a cone `spread` radians wide around this angle. */
  dir?: number;
  spread?: number;
  /** Speed across the table, and the upward kick. */
  speed?: Range;
  lift?: Range;
  size?: Range;
  density?: number;
  /** ms before the first one appears, and the window the rest trickle in over. */
  delay?: number;
  stagger?: number;
}

/** The shared launch: where each of a burst's particles starts and how fast. */
function launch(o: Burst, d: { speed: Range; lift: Range; size: Range; spread: number; stagger: number },
  make: (rng: () => number, base: Pick<Particle, 'x' | 'y' | 'vx' | 'vy' | 'vz' | 'size' | 'delay' | 'shape'>, i: number) => Particle): Ent[] {
  const rng = seeded(o.seed);
  return Array.from({ length: count(o.count, o.density) }, (_, i) => {
    const a = aim(rng, o.dir, o.spread ?? d.spread);
    const v = span(rng, o.speed ?? d.speed);
    return make(rng, {
      x: o.at.x, y: o.at.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: span(rng, o.lift ?? d.lift),
      size: span(rng, o.size ?? d.size),
      delay: ((o.delay ?? 0) + rng() * (o.stagger ?? d.stagger)) * MS,
      shape: rng(),
    }, i);
  });
}

// ---------------------------------------------------------------------------
// Vocabulary.
// ---------------------------------------------------------------------------

/** Hot streaks that arc up, fall and skip once off the table. */
export function sparks(o: Burst & { color: string; alt?: string }): Ent[] {
  return launch(o, { speed: [140, 420], lift: [220, 560], size: [2.4, 4], spread: 1.4, stagger: 30 }, (rng, base) => particle({
    kind: 'spark', ...base, z: 4,
    gravity: 1500, drag: 0.6, bounce: 0.35,
    color: o.color, alt: o.alt ?? FX_INK.cream,
    life: 0.45 + rng() * 0.35,
  }));
}

/** Chads of paper punched out of a print: they tumble, show their cream
 *  backs, flutter down and lie on the table a moment. */
export function chads(o: Burst & { colors: string[]; back?: string }): Ent[] {
  return launch(o, { speed: [50, 220], lift: [260, 560], size: [4.2, 7.5], spread: 2.2, stagger: 40 }, (rng, base, i) => particle({
    kind: 'scrap', ...base, z: 3,
    gravity: 1250, drag: 2.2, bounce: 0.18,
    rot: rng() * TAU, spin: (rng() - 0.5) * 14,
    flip: rng() * TAU, tumble: (rng() > 0.5 ? 1 : -1) * (9 + rng() * 14),
    color: o.colors[i % o.colors.length], alt: o.back ?? poster.paper,
    life: 0.95 + rng() * 0.4,
  }));
}

/** Splinters of glass or crystal. */
export function shards(o: Burst & { color: string; alt?: string }): Ent[] {
  return launch(o, { speed: [90, 300], lift: [300, 600], size: [6, 11], spread: 2.4, stagger: 30 }, (rng, base) => particle({
    kind: 'shard', ...base, z: 4,
    gravity: 1500, drag: 0.5, bounce: 0.3,
    rot: rng() * TAU, spin: (rng() - 0.5) * 12,
    flip: rng() * TAU, tumble: (rng() > 0.5 ? 1 : -1) * (10 + rng() * 10),
    color: o.color, alt: o.alt ?? FX_INK.cream,
    life: 0.7 + rng() * 0.35,
  }));
}

/** Glowing motes that drift up toward the viewer; `swirl` winds them round
 *  the burst's centre as they climb. */
export function embers(o: Burst & {
  color: string; alt?: string; radius?: Range; swirl?: number; pull?: number; gravity?: number; life?: Range;
}): Ent[] {
  return launch(o, { speed: [20, 110], lift: [120, 330], size: [2.8, 4.6], spread: TAU, stagger: 80 }, (rng, base) => {
    const a = Math.atan2(base.vy, base.vx);
    const r = span(rng, o.radius ?? [0, 8]);
    return particle({
      kind: 'ember', ...base,
      x: o.at.x + Math.cos(a) * r, y: o.at.y + Math.sin(a) * r, z: 6,
      gravity: o.gravity ?? -90, drag: 1.3,
      spin: (rng() - 0.5) * 6,
      color: o.color, alt: o.alt ?? FX_INK.cream,
      life: span(rng, o.life ?? [0.6, 1.05]),
      orbit: o.swirl ? { x: o.at.x, y: o.at.y, w: o.swirl * (0.7 + rng() * 0.6), pull: o.pull ?? 0 } : undefined,
    });
  });
}

/** Beads of ink: each one leaves a splat where it lands. */
export function drops(o: Burst & { color: string }): Ent[] {
  return launch(o, { speed: [40, 160], lift: [90, 260], size: [2.2, 3.8], spread: 1.2, stagger: 120 }, (_rng, base) => particle({
    kind: 'drop', ...base, z: 8,
    gravity: 1400,
    color: o.color, alt: FX_INK.cream,
    life: 1.2,
  }));
}

/** Smoke or dust: soft, slow, swelling as it thins. `ring` starts the puffs
 *  on a circle of that radius, each heading outward. */
export function puffs(o: Burst & { color?: string; ring?: number; life?: Range }): Ent[] {
  return launch(o, { speed: [20, 90], lift: [20, 70], size: [10, 20], spread: TAU, stagger: 40 }, (rng, base) => {
    const a = Math.atan2(base.vy, base.vx);
    return particle({
      kind: 'puff', ...base,
      x: o.at.x + Math.cos(a) * (o.ring ?? 0), y: o.at.y + Math.sin(a) * (o.ring ?? 0), z: 6,
      gravity: 0, drag: 2.6,
      color: o.color ?? FX_INK.smoke,
      life: span(rng, o.life ?? [0.5, 0.85]),
    });
  });
}

/** The comic-book star at an impact. */
export function flash(o: { at: Pt; r: number; color: string; alt?: string; spikes?: number; seed: number; z?: number; life?: number; delay?: number; rot?: number; lance?: number }): Ent[] {
  return [{
    t: 'flash', x: o.at.x, y: o.at.y, z: o.z ?? 10, r: o.r, spikes: o.spikes ?? 6,
    rot: o.rot ?? seeded(o.seed)() * TAU, lance: o.lance ?? 0, color: o.color, alt: o.alt ?? FX_INK.cream,
    age: 0, life: (o.life ?? 170) * MS, delay: (o.delay ?? 0) * MS,
  }];
}

/** A shockwave widening from `r0` to `r1`, on the table unless it rises. */
export function ring(o: { at: Pt; r0: number; r1: number; color: string; width?: number; life?: number; z?: number; rise?: number; dashed?: boolean; delay?: number }): Ent[] {
  return [{
    t: 'ring', x: o.at.x, y: o.at.y, z: o.z ?? 0, rise: o.rise ?? 0, r0: o.r0, r1: o.r1,
    width: o.width ?? 3, color: o.color, dashed: !!o.dashed,
    age: 0, life: (o.life ?? 520) * MS, delay: (o.delay ?? 0) * MS,
  }];
}

/** A projectile thrown from `from` to `to`: it bows sideways by `bulge` of
 *  the distance and climbs `arc` px toward the viewer at mid-flight. */
export function bolt(o: {
  from: Pt; to: Pt; color: string; alt?: string; dur: number; size?: number; arc?: number; bulge?: number;
  embers?: number; ease?: number; delay?: number;
}): Ent[] {
  const d = dist(o.from, o.to) || 1;
  const bulge = o.bulge ?? 0.18;
  const c = {
    x: (o.from.x + o.to.x) / 2 - ((o.to.y - o.from.y) / d) * d * bulge,
    y: (o.from.y + o.to.y) / 2 + ((o.to.x - o.from.x) / d) * d * bulge,
  };
  return [{
    t: 'bolt', a: o.from, b: o.to, c,
    z0: 18, z1: 10, arc: o.arc ?? clamp(d * 0.3, 50, 150),
    size: o.size ?? 9, color: o.color, alt: o.alt ?? FX_INK.cream,
    dur: o.dur * MS, ease: o.ease ?? 1.7, embers: o.embers ?? 90, acc: 0,
    x: o.from.x, y: o.from.y, z: 18, tail: [],
    age: 0, life: o.dur * MS + 0.12, delay: (o.delay ?? 0) * MS,
  }];
}

/** Gunfire: `rounds` tracers leaving `from` one after another, each landing
 *  a little off the last. */
export function tracers(o: { from: Pt; to: Pt; color: string; seed: number; rounds: number; gap: number; dur: number; spread?: number }): Ent[] {
  const rng = seeded(o.seed);
  const d = dist(o.from, o.to) || 1;
  const nx = -(o.to.y - o.from.y) / d;
  const ny = (o.to.x - o.from.x) / d;
  const spread = o.spread ?? 7;
  return Array.from({ length: o.rounds }, (_, i) => {
    const off = (rng() - 0.5) * 2 * spread;
    return {
      t: 'tracer' as const, a: o.from, b: { x: o.to.x + nx * off, y: o.to.y + ny * off },
      z: 22, len: clamp(d * 0.45, 30, 90), width: 4, color: o.color, alt: FX_INK.cream,
      age: 0, life: o.dur * MS, delay: i * o.gap * MS,
    };
  });
}

// ---------------------------------------------------------------------------
// Recipes.
// ---------------------------------------------------------------------------

const off = (p: Pt, a: number, r: number): Pt => ({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });

/** A gun going off: per round a flash at the muzzle, smoke drifting along
 *  the shot, a spark or two, and a brass casing thrown clear to the side. */
export function muzzleBlast(o: { at: Pt; dir: number; ink: string; seed: number; rounds: number; gap: number; density?: number }): Ent[] {
  const rng = seeded(o.seed);
  const out: Ent[] = [];
  const side = o.dir + Math.PI / 2;
  for (let i = 0; i < o.rounds; i++) {
    const delay = i * o.gap;
    out.push(...flash({ at: off(o.at, o.dir, 6), r: 17, color: o.ink, spikes: 5, seed: o.seed + i, z: 22, life: 140, delay, rot: o.dir, lance: 1.5 }));
    out.push(...sparks({ at: o.at, seed: o.seed + 31 * i + 3, count: 2, color: o.ink, dir: o.dir, spread: 0.7, speed: [220, 460], lift: [60, 200], density: o.density, delay }));
    out.push(...puffs({ at: off(o.at, o.dir, 8), seed: o.seed + 17 * i + 5, count: 2, dir: o.dir, spread: 1, speed: [40, 110], size: [8, 14], density: o.density, delay: delay + 20 }));
    // The casing spins out to the shooter's side and a little back.
    const v = 110 + rng() * 70;
    const back = 30 + rng() * 50;
    out.push(particle({
      kind: 'casing', x: o.at.x, y: o.at.y, z: 14,
      vx: Math.cos(side) * v - Math.cos(o.dir) * back, vy: Math.sin(side) * v - Math.sin(o.dir) * back, vz: 330 + rng() * 130,
      gravity: 1700, drag: 0.4, bounce: 0.46,
      rot: rng() * TAU, spin: (rng() - 0.5) * 26, tumble: 14 + rng() * 8,
      size: 4.4, color: FX_INK.gold, alt: FX_INK.cream,
      life: 1.15, delay: (delay + 15) * MS, shape: rng(),
    }));
  }
  return out;
}

/** A bullet striking a print: the star, sparks carrying on past the hole,
 *  chads of the card punched up and out, a breath of dust. */
export function gunImpact(o: { at: Pt; dir: number; seed: number; power?: number; density?: number }): Ent[] {
  const p = o.power ?? 0.5;
  return [
    ...flash({ at: o.at, r: 10 + 5 * p, color: FX_INK.bullet, spikes: 6, seed: o.seed, z: 8 }),
    ...sparks({ at: o.at, seed: o.seed + 1, count: 4 + 3 * p, color: FX_INK.bullet, alt: FX_INK.gold, dir: o.dir, spread: 2, speed: [120, 380], density: o.density }),
    ...chads({ at: o.at, seed: o.seed + 2, count: 3, colors: [poster.frame, FX_INK.bullet, poster.paperBand], dir: o.dir, density: o.density }),
    ...puffs({ at: o.at, seed: o.seed + 3, count: 1, size: [9, 14], density: o.density }),
  ];
}

/** Spirit damage: a bloom, a shockwave along the table and a halo lifting
 *  off the card, embers winding up toward the viewer, crystal splinters. */
export function spiritBurst(o: { at: Pt; r: number; ink: string; seed: number; big?: boolean; density?: number }): Ent[] {
  const big = !!o.big;
  return [
    ...flash({ at: o.at, r: o.r * (big ? 0.62 : 0.5), color: o.ink, spikes: 8, seed: o.seed, z: 12, life: 200 }),
    ...ring({ at: o.at, r0: o.r * 0.5, r1: o.r * (big ? 2.7 : 2.1), color: o.ink, width: 4, life: 560 }),
    ...ring({ at: o.at, r0: o.r * 0.35, r1: o.r * 1.4, color: FX_INK.cream, width: 2.5, life: 620, z: 10, rise: 260, delay: 60 }),
    ...embers({ at: o.at, seed: o.seed + 1, count: big ? 22 : 14, color: o.ink, radius: [o.r * 0.2, o.r * 0.8], speed: [10, 70], lift: [140, 360], swirl: 2.6, life: [0.7, 1.15], density: o.density }),
    ...shards({ at: o.at, seed: o.seed + 2, count: big ? 7 : 4, color: o.ink, speed: [90, 260], lift: [300, 560], density: o.density }),
  ];
}

/** Pure damage tears the print from `a` to `b`: glass thrown off either side
 *  of the rip, sparks racing along it. */
export function pureTear(o: { a: Pt; b: Pt; seed: number; density?: number }): Ent[] {
  const rng = seeded(o.seed);
  const along = Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x);
  const mid = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 };
  const out: Ent[] = [...flash({ at: mid, r: 14, color: FX_INK.pure, spikes: 4, seed: o.seed, z: 10, rot: along })];
  for (let i = 0; i < count(9, o.density); i++) {
    const t = rng();
    const at = { x: o.a.x + (o.b.x - o.a.x) * t, y: o.a.y + (o.b.y - o.a.y) * t };
    out.push(...shards({ at, seed: o.seed + 7 * i + 1, count: 1, color: FX_INK.pure, dir: along + (rng() > 0.5 ? 1 : -1) * Math.PI / 2, spread: 0.9, speed: [60, 220], size: [4.5, 8], delay: t * 90 }));
  }
  out.push(...sparks({ at: mid, seed: o.seed + 91, count: 3, color: FX_INK.cream, alt: FX_INK.pure, dir: along, spread: 0.3, speed: [240, 520], lift: [60, 200], density: o.density }));
  out.push(...sparks({ at: mid, seed: o.seed + 92, count: 3, color: FX_INK.cream, alt: FX_INK.pure, dir: along + Math.PI, spread: 0.3, speed: [240, 520], lift: [60, 200], density: o.density }));
  return out;
}

/** Bleed: beads of red shaken off the card's lower edge onto the paper. */
export function bleedSpill(o: { at: Pt; width: number; seed: number; count: number; density?: number }): Ent[] {
  const rng = seeded(o.seed);
  const out: Ent[] = [];
  for (let i = 0; i < count(o.count, o.density); i++) {
    const at = { x: o.at.x + (rng() - 0.5) * o.width, y: o.at.y };
    out.push(...drops({ at, seed: o.seed + 13 * i + 1, count: 1, color: poster.red, dir: Math.PI / 2, delay: i * 70, stagger: 60 }));
  }
  return out;
}

/** A card going down: the big star, shockwaves, torn print thrown high,
 *  sparks, and dust rolling out along the table. */
export function koBlast(o: { at: Pt; r: number; seed: number; dir?: number; density?: number }): Ent[] {
  return [
    ...flash({ at: o.at, r: 36, color: poster.red, spikes: 9, seed: o.seed, z: 26, life: 260 }),
    ...ring({ at: o.at, r0: 20, r1: o.r * 1.9, color: poster.ink, width: 5, life: 600 }),
    ...ring({ at: o.at, r0: o.r * 0.3, r1: o.r * 1.4, color: FX_INK.ko, width: 3, life: 560, delay: 50 }),
    ...chads({ at: o.at, seed: o.seed + 1, count: 16, colors: [poster.frame, FX_INK.ko, poster.paperBand, FX_INK.bullet], dir: o.dir, spread: o.dir == null ? TAU : 3.4, speed: [80, 340], lift: [300, 680], size: [5, 9], density: o.density }),
    ...sparks({ at: o.at, seed: o.seed + 2, count: 10, color: FX_INK.gold, speed: [160, 460], density: o.density }),
    ...puffs({ at: o.at, seed: o.seed + 3, count: 12, ring: o.r * 0.5, speed: [160, 300], size: [14, 24], density: o.density }),
  ];
}

/** Healing: green crosses lifting off the card toward the viewer, a halo
 *  rising with them, a few sparkles. */
export function healRise(o: { at: Pt; width: number; height: number; seed: number; count: number; quiet?: boolean; density?: number }): Ent[] {
  const rng = seeded(o.seed);
  const out: Ent[] = [];
  for (let i = 0; i < count(o.count, o.density); i++) {
    out.push(particle({
      kind: 'cross',
      x: o.at.x + (rng() - 0.5) * o.width * 0.7, y: o.at.y + (rng() - 0.2) * o.height * 0.5, z: 4,
      vx: (rng() - 0.5) * 30, vy: -20 - rng() * 40, vz: (o.quiet ? 110 : 150) + rng() * 140,
      gravity: -50, drag: 1.1,
      rot: (rng() - 0.5) * 0.5, spin: (rng() - 0.5) * 3, tumble: 3 + rng() * 2.5,
      size: 4.5 + rng() * 3, color: FX_INK.heal, alt: FX_INK.cream,
      life: 0.8 + rng() * 0.35, delay: rng() * 0.25, shape: rng(),
    }));
  }
  if (!o.quiet) {
    out.push(...ring({ at: o.at, r0: o.width * 0.3, r1: o.width * 0.62, color: FX_INK.heal, width: 3, life: 700, z: 4, rise: 220 }));
    out.push(...embers({ at: o.at, seed: o.seed + 5, count: 6, color: FX_INK.heal, radius: [0, o.width * 0.4], lift: [160, 300], size: [1.6, 2.6], density: o.density }));
  }
  return out;
}

/** A Shield taking the blow: a green shockwave and sparks skidding off low
 *  across the table; when it breaks, the shield itself comes apart. */
export function shieldSkid(o: { at: Pt; r: number; seed: number; broken?: boolean; density?: number }): Ent[] {
  return [
    ...flash({ at: o.at, r: o.r * 0.42, color: poster.green, spikes: 6, seed: o.seed, z: 14 }),
    ...ring({ at: o.at, r0: o.r * 0.5, r1: o.r * 1.5, color: poster.green, width: 4, life: 450 }),
    ...sparks({ at: o.at, seed: o.seed + 1, count: 8, color: poster.green, speed: [260, 520], lift: [40, 170], density: o.density }),
    ...(o.broken ? shards({ at: o.at, seed: o.seed + 2, count: 8, color: poster.green, density: o.density }) : []),
  ];
}

/** Gold going off round a card — Unstoppable shrugging, a level gained. */
export function goldBurst(o: { at: Pt; r: number; seed: number; density?: number }): Ent[] {
  return [
    ...ring({ at: o.at, r0: o.r * 0.5, r1: o.r * 1.7, color: FX_INK.gold, width: 4, life: 560 }),
    ...ring({ at: o.at, r0: o.r * 0.4, r1: o.r * 1.2, color: FX_INK.cream, width: 2.5, life: 600, z: 8, rise: 240, delay: 80 }),
    ...sparks({ at: o.at, seed: o.seed + 1, count: 9, color: FX_INK.gold, speed: [180, 420], lift: [120, 380], density: o.density }),
  ];
}

/** A column of glints winding up off a card — a revive, a level-up. */
export function helix(o: { at: Pt; r: number; seed: number; count: number; color: string; alt?: string; density?: number }): Ent[] {
  const rng = seeded(o.seed);
  const n = count(o.count, o.density);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU * 2;
    return particle({
      kind: 'star', x: o.at.x + Math.cos(a) * o.r, y: o.at.y + Math.sin(a) * o.r, z: 2,
      vz: 220 + rng() * 110, gravity: -20, drag: 0.6,
      rot: rng() * TAU, spin: (rng() - 0.5) * 5, tumble: 5 + rng() * 4,
      size: 4 + rng() * 2.5, color: o.color, alt: o.alt ?? FX_INK.cream,
      life: 0.8 + rng() * 0.4, delay: i * 0.03, shape: rng(),
      orbit: { x: o.at.x, y: o.at.y, w: 5.5, pull: 0.35 },
    });
  });
}

/** A caster gathering power: motes drawn down out of the air, winding in to
 *  the card over `dur` ms. */
export function castCharge(o: { at: Pt; r: number; ink: string; seed: number; dur: number; heavy?: boolean; density?: number }): Ent[] {
  const rng = seeded(o.seed);
  const T = o.dur * MS;
  return Array.from({ length: count(o.heavy ? 18 : 12, o.density) }, () => {
    const a = rng() * TAU;
    const r = o.r * (1.1 + rng() * 0.45);
    const z = 90 + rng() * 80;
    return particle({
      kind: 'ember', x: o.at.x + Math.cos(a) * r, y: o.at.y + Math.sin(a) * r, z,
      vz: -z / T, gravity: 0,
      spin: (rng() - 0.5) * 8,
      size: 2.4 + rng() * 1.4, color: o.ink, alt: FX_INK.cream,
      life: T, delay: rng() * T * 0.2, shape: rng(),
      // Wound in to a tenth of the starting radius by the time it lands.
      orbit: { x: o.at.x, y: o.at.y, w: 7, pull: 2.3 / T },
    });
  });
}

/** …and letting it go: a shockwave off the card and a ring of sparks. */
export function castRelease(o: { at: Pt; r: number; ink: string; seed: number; heavy?: boolean; density?: number }): Ent[] {
  return [
    ...ring({ at: o.at, r0: o.r * 0.6, r1: o.r * (o.heavy ? 2.1 : 1.7), color: o.ink, width: o.heavy ? 5 : 3.5, life: 500 }),
    ...sparks({ at: o.at, seed: o.seed + 1, count: o.heavy ? 10 : 6, color: o.ink, speed: [200, 440], lift: [80, 260], density: o.density }),
    ...(o.heavy ? [
      ...ring({ at: o.at, r0: o.r * 0.5, r1: o.r * 1.6, color: FX_INK.cream, width: 2.5, life: 560, z: 8, rise: 200, delay: 70 }),
      ...puffs({ at: o.at, seed: o.seed + 2, count: 8, ring: o.r * 0.7, speed: [120, 220], density: o.density }),
    ] : []),
  ];
}

/** An area effect leaving its caster: the wave along the table, dust and
 *  sparks riding its front. `dur` is how long it takes to reach `radius`. */
export function waveFront(o: { at: Pt; radius: number; color: string; dur: number; seed: number; density?: number }): Ent[] {
  const v = o.radius / (o.dur * MS);
  return [
    ...ring({ at: o.at, r0: 10, r1: o.radius, color: o.color, width: 6, life: o.dur + 180 }),
    ...ring({ at: o.at, r0: 6, r1: o.radius * 0.86, color: FX_INK.cream, width: 2.5, life: o.dur + 160, delay: 60 }),
    ...puffs({ at: o.at, seed: o.seed + 1, count: 14, ring: 24, speed: [v * 0.5, v * 0.8], size: [14, 22], life: [0.55, 0.9], density: o.density }),
    ...sparks({ at: o.at, seed: o.seed + 2, count: 12, color: o.color, speed: [v * 0.6, v], lift: [70, 240], density: o.density }),
  ];
}

/** Lightning grounding at a point: the flash, sparks, a scorch on the table. */
export function lightningStrike(o: { at: Pt; seed: number; color?: string; density?: number }): Ent[] {
  const color = o.color ?? FX_INK.lightning;
  return [
    ...flash({ at: o.at, r: 20, color, alt: '#ffffff', spikes: 7, seed: o.seed, z: 10, life: 160 }),
    ...sparks({ at: o.at, seed: o.seed + 1, count: 9, color, alt: '#ffffff', speed: [200, 520], lift: [100, 400], density: o.density }),
    { t: 'decal', x: o.at.x, y: o.at.y, r: 13, color: 'rgba(23, 20, 16, 0.5)', seed: seeded(o.seed + 2)(), age: 0, life: 1.1, delay: 0.04 },
  ];
}

/** Lifesteal on its way home: small orbs strung along one arc. */
export function drainOrbs(o: { from: Pt; to: Pt; color: string; dur: number; seed: number; count?: number; gap?: number }): Ent[] {
  const rng = seeded(o.seed);
  const out: Ent[] = [];
  for (let i = 0; i < (o.count ?? 6); i++) {
    out.push(...bolt({
      from: o.from, to: o.to, color: i % 3 === 1 ? FX_INK.cream : o.color, alt: FX_INK.cream,
      dur: o.dur + 80, size: 3 + rng() * 1.8, arc: 40 + rng() * 26, bulge: 0.16 + rng() * 0.12,
      embers: 16, ease: 1.25, delay: i * (o.gap ?? 42),
    }));
  }
  return out;
}

/** A sticker slapped down on a card: dust squeezed out from under it. */
export function stampDust(o: { at: Pt; width: number; seed: number; density?: number }): Ent[] {
  return puffs({ at: o.at, seed: o.seed, count: 5, ring: o.width * 0.4, speed: [60, 140], size: [6, 10], life: [0.3, 0.5], density: o.density });
}
