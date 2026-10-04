import { describe, it, expect } from 'vitest';
import {
  CAMERA_HEIGHT, LIGHT, type Bolt, type Camera, type Particle, createWorld, particle, project, quadAt, shadowOf, step,
} from '@/ui/effects/fx/stage/sim';
import {
  bolt, castCharge, chads, drops, gunImpact, healRise, helix, koBlast, muzzleBlast, sparks, spiritBurst, tracers, waveFront,
} from '@/ui/effects/fx/stage/emitters';

/** The FX stage's world is pure — pin the camera, the physics and the
 *  make-up of the bursts the FX components fire on it. */

const cam: Camera = { cx: 500, cy: 400, f: CAMERA_HEIGHT };
const run = (world: ReturnType<typeof createWorld>, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) step(world, dt);
};

describe('stage camera', () => {
  it('leaves the table itself where it is', () => {
    expect(project(cam, 120, 640, 0)).toEqual({ x: 120, y: 640, k: 1 });
  });

  it('magnifies with height and pushes things out from under the camera', () => {
    const low = project(cam, 700, 400, 60);
    const high = project(cam, 700, 400, 200);
    expect(low.k).toBeGreaterThan(1);
    expect(high.k).toBeGreaterThan(low.k);
    expect(high.x).toBeGreaterThan(low.x);
    expect(low.x).toBeGreaterThan(700);
    // Straight under the camera nothing slides, it only grows.
    expect(project(cam, 500, 400, 200).x).toBe(500);
    // …and on the other side it slides the other way.
    expect(project(cam, 300, 400, 200).x).toBeLessThan(300);
  });

  it('never lets anything reach the lens', () => {
    const p = project(cam, 600, 400, CAMERA_HEIGHT * 5);
    expect(Number.isFinite(p.k)).toBe(true);
    expect(p.k).toBeLessThanOrEqual(4);
  });

  it('drops a shadow further away the higher the thing is', () => {
    expect(shadowOf(10, 20, 0)).toEqual({ x: 10, y: 20 });
    const s = shadowOf(10, 20, 100);
    expect(s.x).toBeCloseTo(10 + 100 * LIGHT.x);
    expect(s.y).toBeCloseTo(20 + 100 * LIGHT.y);
  });
});

describe('stage physics', () => {
  it('a thrown spark rises, falls, skips off the table and comes to rest', () => {
    const world = createWorld();
    const p = particle({ kind: 'spark', x: 0, y: 0, vx: 100, vz: 400, bounce: 0.4, life: 5 });
    world.ents.push(p);
    let peak = 0;
    let bounces = 0;
    let wasFalling = false;
    for (let i = 0; i < 240; i++) {
      step(world, 1 / 60);
      peak = Math.max(peak, p.z);
      if (wasFalling && p.vz > 0) bounces++;
      wasFalling = p.vz < 0;
      expect(p.z).toBeGreaterThanOrEqual(0);
    }
    expect(peak).toBeGreaterThan(30);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(p.landed).toBe(true);
    expect(p.z).toBe(0);
    expect(p.x).toBeGreaterThan(0);
  });

  it('a tumbling scrap ends up lying flat', () => {
    const world = createWorld();
    const p = particle({ kind: 'scrap', x: 0, y: 0, vz: 300, tumble: 17, flip: 1, life: 5 });
    world.ents.push(p);
    run(world, 3);
    expect(p.landed).toBe(true);
    expect(Math.abs(Math.sin(p.flip))).toBeLessThan(1e-9);
  });

  it('retires things when their life runs out, and holds them through a delay', () => {
    const world = createWorld();
    world.ents.push(particle({ kind: 'ember', x: 0, y: 0, gravity: 0, life: 0.2 }));
    const late = particle({ kind: 'ember', x: 0, y: 0, gravity: 0, vx: 60, life: 0.2, delay: 0.5 });
    world.ents.push(late);
    run(world, 0.3);
    expect(world.ents).toEqual([late]);
    expect(late.x).toBe(0);         // not moving yet
    run(world, 0.3);
    expect(late.x).toBeGreaterThan(0);
    run(world, 0.3);
    expect(world.ents).toHaveLength(0);
  });

  it('a drop of ink leaves a splat where it lands', () => {
    const world = createWorld();
    world.ents.push(...drops({ at: { x: 50, y: 50 }, seed: 3, count: 1, color: '#d4392c', stagger: 0 }));
    run(world, 1);
    expect(world.ents).toHaveLength(1);
    expect(world.ents[0].t).toBe('decal');
    run(world, 2);
    expect(world.ents).toHaveLength(0);
  });

  it('an orbiting mote is wound in toward its axis', () => {
    const world = createWorld();
    const p = particle({ kind: 'ember', x: 100, y: 0, gravity: 0, life: 5, orbit: { x: 0, y: 0, w: 6, pull: 2 } }) as Particle;
    world.ents.push(p);
    run(world, 0.5);
    const r = Math.hypot(p.x, p.y);
    expect(r).toBeLessThan(50);
    expect(r).toBeGreaterThan(5);
    expect(Math.abs(p.y)).toBeGreaterThan(1);   // it went round, not straight in
  });

  it('a bolt flies from its caster to its target, highest in the middle, shedding embers', () => {
    const world = createWorld();
    const [b] = bolt({ from: { x: 0, y: 0 }, to: { x: 300, y: 0 }, color: '#7a4a8a', dur: 300, bulge: 0, ease: 1 }) as Bolt[];
    world.ents.push(b);
    const heights: number[] = [];
    for (let i = 0; i < 17; i++) { step(world, 1 / 60); heights.push(b.z); }
    expect(b.x).toBeGreaterThan(250);
    expect(Math.max(...heights)).toBeGreaterThan(heights[0] + 30);
    expect(heights.indexOf(Math.max(...heights))).toBeGreaterThan(4);
    expect(heights.indexOf(Math.max(...heights))).toBeLessThan(13);
    expect(b.tail.length % 3).toBe(0);
    expect(b.tail.length).toBeLessThanOrEqual(14 * 3);
    expect(world.ents.some((e) => e.t === 'particle' && e.kind === 'ember')).toBe(true);
    // After it lands the bolt itself is retired; only spent embers may remain.
    run(world, 0.3);
    expect(world.ents.some((e) => e.t === 'bolt')).toBe(false);
  });

  it('a quadratic arc starts and ends on its endpoints', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 9, y: 4 };
    expect(quadAt(a, { x: 5, y: 20 }, b, 0)).toEqual(a);
    expect(quadAt(a, { x: 5, y: 20 }, b, 1)).toEqual(b);
  });

  it('stepping an empty world, or by nothing, changes nothing', () => {
    const world = createWorld();
    step(world, 1 / 60);
    const p = particle({ kind: 'spark', x: 0, y: 0, vx: 100 });
    world.ents.push(p);
    step(world, 0);
    expect(p.x).toBe(0);
    expect(p.age).toBe(0);
  });
});

describe('stage emitters', () => {
  const at = { x: 200, y: 300 };

  it('are seeded: the same seed scatters the same way, another seed differently', () => {
    const a = sparks({ at, seed: 7, count: 6, color: '#fff' });
    expect(sparks({ at, seed: 7, count: 6, color: '#fff' })).toEqual(a);
    expect(sparks({ at, seed: 8, count: 6, color: '#fff' })).not.toEqual(a);
  });

  it('thin out on a small screen but never to nothing', () => {
    expect(chads({ at, seed: 1, count: 10, colors: ['#000'] })).toHaveLength(10);
    expect(chads({ at, seed: 1, count: 10, colors: ['#000'], density: 0.6 })).toHaveLength(6);
    expect(chads({ at, seed: 1, count: 1, colors: ['#000'], density: 0.1 })).toHaveLength(1);
  });

  it('throw a directed burst into its cone, upward', () => {
    for (const e of sparks({ at, seed: 4, count: 20, color: '#fff', dir: 0, spread: 1 }) as Particle[]) {
      expect(e.vx).toBeGreaterThan(0);
      expect(Math.abs(Math.atan2(e.vy, e.vx))).toBeLessThanOrEqual(0.5);
      expect(e.vz).toBeGreaterThan(0);
    }
  });

  const kinds = (ents: { t: string; kind?: string }[]) => new Set(ents.map((e) => (e.t === 'particle' ? e.kind : e.t)));

  it('a bullet striking throws the star, sparks, chads and dust', () => {
    expect(kinds(gunImpact({ at, dir: 1, seed: 2 }))).toEqual(new Set(['flash', 'spark', 'scrap', 'puff']));
  });

  it('a gun going off throws a flash, a tracer-side spark, smoke and one casing per round', () => {
    const ents = muzzleBlast({ at, dir: 0, ink: '#d9b64a', seed: 5, rounds: 3, gap: 50 });
    expect(ents.filter((e) => e.t === 'flash')).toHaveLength(3);
    expect(ents.filter((e) => e.t === 'particle' && e.kind === 'casing')).toHaveLength(3);
    // Each round's flash waits for its turn.
    expect(ents.filter((e) => e.t === 'flash').map((e) => Math.round(e.delay * 1000))).toEqual([0, 50, 100]);
    expect(tracers({ from: at, to: { x: 500, y: 300 }, color: '#d9b64a', seed: 1, rounds: 3, gap: 50, dur: 200 })).toHaveLength(3);
  });

  it('a spirit burst blooms, rings the table and lifts embers that wind upward', () => {
    const ents = spiritBurst({ at, r: 70, ink: '#7a4a8a', seed: 9 });
    expect(kinds(ents)).toEqual(new Set(['flash', 'ring', 'ember', 'shard']));
    const motes = ents.filter((e): e is Particle => e.t === 'particle' && e.kind === 'ember');
    expect(motes.every((m) => m.gravity < 0 && !!m.orbit)).toBe(true);
    expect(spiritBurst({ at, r: 70, ink: '#7a4a8a', seed: 9, big: true }).length).toBeGreaterThan(ents.length);
  });

  it('a card going down throws more than any hit', () => {
    const ko = koBlast({ at, r: 110, seed: 3 });
    expect(ko.length).toBeGreaterThan(gunImpact({ at, dir: 0, seed: 3 }).length * 2);
    expect(kinds(ko)).toEqual(new Set(['flash', 'ring', 'scrap', 'spark', 'puff']));
  });

  it('healing rises: every cross is lifted, none falls', () => {
    const crosses = healRise({ at, width: 140, height: 190, seed: 6, count: 6 }).filter((e): e is Particle => e.t === 'particle' && e.kind === 'cross');
    expect(crosses).toHaveLength(6);
    expect(crosses.every((c) => c.vz > 0 && c.gravity < 0)).toBe(true);
  });

  it('a charge winds its motes down into the card by the time it lets go', () => {
    const world = createWorld();
    const motes = castCharge({ at, r: 100, ink: '#5ab8d8', seed: 11, dur: 240 }) as Particle[];
    const start = motes.map((m) => Math.hypot(m.x - at.x, m.y - at.y));
    expect(Math.min(...start)).toBeGreaterThan(100);
    world.ents.push(...motes);
    run(world, 0.2);
    for (const m of world.ents as Particle[]) {
      if (m.age < 0.15) continue;   // the stragglers started late
      expect(Math.hypot(m.x - at.x, m.y - at.y)).toBeLessThan(60);
      expect(m.z).toBeLessThan(90);
    }
  });

  it('a helix and a shockwave are made of what they say', () => {
    expect(helix({ at, r: 60, seed: 2, count: 12, color: '#d9b64a' }).every((e) => e.t === 'particle' && e.kind === 'star' && !!e.orbit)).toBe(true);
    const wave = waveFront({ at, radius: 400, color: '#5ab8d8', dur: 400, seed: 1 });
    expect(wave.filter((e) => e.t === 'ring')).toHaveLength(2);
    expect(kinds(wave)).toEqual(new Set(['ring', 'puff', 'spark']));
  });
});
