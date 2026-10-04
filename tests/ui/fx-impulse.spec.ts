import { describe, it, expect } from 'vitest';
import { FxImpulseBus, LIFT_VAR, fromHere, hitStrength, kickFor, type FxImpulse } from '@/ui/effects/fx/FxImpulse';

/** The recoil channel between the FX players and the hero tiles, and the
 *  pure kick shapes HeroSlot animates — a card on a table, shoved, rocked
 *  out of the table plane and lifted off it. */

describe('fx impulse bus', () => {
  it('delivers an impulse to every listener on that card only', () => {
    const bus = new FxImpulseBus();
    const got: string[] = [];
    bus.subscribe('a', (i) => got.push(`a:${i.kind}`));
    bus.subscribe('a', (i) => got.push(`a2:${i.kind}`));
    bus.subscribe('b', (i) => got.push(`b:${i.kind}`));
    bus.emit('a', { kind: 'hit', strength: 1 });
    expect(got).toEqual(['a:hit', 'a2:hit']);
    expect(bus.size).toBe(2);
  });

  it('unsubscribing stops delivery and forgets an empty card', () => {
    const bus = new FxImpulseBus();
    let n = 0;
    const off = bus.subscribe('a', () => n++);
    bus.emit('a', { kind: 'heal', strength: 0.5 });
    off();
    bus.emit('a', { kind: 'heal', strength: 0.5 });
    expect(n).toBe(1);
    expect(bus.size).toBe(0);
  });

  it('emitAll reaches every card on the table', () => {
    const bus = new FxImpulseBus();
    const got: string[] = [];
    bus.subscribe('a', () => got.push('a'));
    bus.subscribe('b', () => got.push('b'));
    bus.emitAll({ kind: 'wave', strength: 0.8 });
    expect(got.sort()).toEqual(['a', 'b']);
  });

  it('emitting to a card nobody listens on is a no-op', () => {
    expect(() => new FxImpulseBus().emit('ghost', { kind: 'ko', strength: 1 })).not.toThrow();
  });
});

describe('kick shapes', () => {
  const kinds: FxImpulse['kind'][] = ['hit', 'ko', 'heal', 'shield', 'fire', 'cast', 'wave', 'slam'];

  it('every track starts and ends at rest, with matching lengths', () => {
    for (const kind of kinds) {
      for (const angle of [undefined, 0, Math.PI / 2, Math.PI, -2.1]) {
        const { keyframes, duration, times } = kickFor({ kind, angle, strength: 0.8 });
        const { x, y, rotate, scale, rotateX, rotateY } = keyframes;
        const lift = keyframes[LIFT_VAR];
        expect(duration).toBeGreaterThan(0);
        expect(new Set([x, y, rotate, scale, rotateX, rotateY, lift].map((t) => t.length)).size).toBe(1);
        for (const track of [x, y, rotate, rotateX, rotateY, lift]) {
          expect(track[0]).toBe(0);
          expect(track.at(-1)).toBe(0);
        }
        expect(scale[0]).toBe(1);
        expect(scale.at(-1)).toBe(1);
        for (const v of [...x, ...y, ...rotate, ...scale, ...rotateX, ...rotateY, ...lift]) expect(Number.isFinite(v)).toBe(true);
        for (const v of lift) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
        if (times) {
          expect(times).toHaveLength(x.length);
          expect(times[0]).toBe(0);
          expect(times.at(-1)).toBe(1);
          for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
        }
      }
    }
  });

  it('a hit shoves the card along the blow, away from the source', () => {
    // A blow travelling straight down (from the row above) pushes the card down.
    const down = kickFor({ kind: 'hit', angle: Math.PI / 2, strength: 1 }).keyframes;
    expect(down.y[1]).toBeGreaterThan(0);
    expect(Math.abs(down.x[1])).toBeLessThan(0.01);
    // …and one from the right pushes it left.
    const left = kickFor({ kind: 'hit', angle: Math.PI, strength: 1 }).keyframes;
    expect(left.x[1]).toBeLessThan(0);
    // It springs back past rest before settling.
    expect(Math.sign(down.y[2])).toBe(-Math.sign(down.y[1]));
  });

  it('a kill shoves harder than a hit and twists; a heal only lifts', () => {
    const hit = kickFor({ kind: 'hit', angle: 0, strength: 1 }).keyframes;
    const ko = kickFor({ kind: 'ko', angle: 0, strength: 1 }).keyframes;
    expect(Math.max(...ko.x)).toBeGreaterThan(Math.max(...hit.x));
    expect(ko.rotate.some((r) => r !== 0)).toBe(true);
    expect(hit.rotate.every((r) => r === 0)).toBe(true);
    const heal = kickFor({ kind: 'heal', strength: 0.6 }).keyframes;
    expect(heal.x.every((v) => v === 0)).toBe(true);
    expect(Math.min(...heal.y)).toBeLessThan(0);
    expect(Math.max(...heal.scale)).toBeGreaterThan(1);
  });

  it('with no angle the blow comes straight on and the card shudders sideways', () => {
    const k = kickFor({ kind: 'hit', strength: 0.5 }).keyframes;
    expect(k.y.every((v) => v === 0)).toBe(true);
    expect(k.x.some((v) => v !== 0)).toBe(true);
  });

  it('a blow rocks the card: the edge it is heading for comes up off the table', () => {
    // From the left → the right edge lifts (CSS: a negative rotateY).
    const right = kickFor({ kind: 'hit', angle: 0, strength: 1 }).keyframes;
    expect(right.rotateY[1]).toBeLessThan(0);
    expect(right.rotateX.every((v) => v === 0)).toBe(true);
    // From above → the bottom edge lifts (a positive rotateX).
    const down = kickFor({ kind: 'hit', angle: Math.PI / 2, strength: 1 }).keyframes;
    expect(down.rotateX[1]).toBeGreaterThan(0);
    expect(Math.abs(down.rotateY[1])).toBeLessThan(0.01);
    // A kill rocks further than a hit, and both come up off the paper.
    const ko = kickFor({ kind: 'ko', angle: 0, strength: 1 }).keyframes;
    expect(Math.abs(ko.rotateY[1])).toBeGreaterThan(Math.abs(right.rotateY[1]));
    expect(Math.max(...right[LIFT_VAR])).toBeGreaterThan(0);
    // With no direction the blow comes straight down: pressed flat, no rock.
    const flat = kickFor({ kind: 'hit', strength: 1 }).keyframes;
    expect([...flat.rotateX, ...flat.rotateY].every((v) => v === 0)).toBe(true);
    expect(Math.min(...flat.scale)).toBeLessThan(1);
  });

  it('a shooter kicks back against its own shot, once per round', () => {
    const { keyframes, duration, times } = kickFor({ kind: 'fire', angle: 0, strength: 1, lead: 0.36, gap: 0.06 });
    // Shooting right → recoiling left, three times.
    expect(keyframes.x.filter((v) => v <= Math.min(...keyframes.x) + 0.01)).toHaveLength(3);
    expect(Math.max(...keyframes.x.slice(0, -2))).toBeLessThanOrEqual(0);
    // The first round leaves once the wind-up is over.
    expect(times![2] * duration).toBeGreaterThan(0.36);
    expect(times![1] * duration).toBeLessThan(0.36);
    expect(duration).toBeCloseTo(0.36 + 0.12 + 0.3);
  });

  it('a caster lifts off the table and comes back down; a shockwave bobs harder up close', () => {
    const cast = kickFor({ kind: 'cast', strength: 1, duration: 0.42 });
    expect(cast.duration).toBe(0.42);
    expect(Math.max(...cast.keyframes.scale)).toBeGreaterThan(1.05);
    expect(Math.max(...cast.keyframes[LIFT_VAR])).toBe(1);
    expect(Math.min(...cast.keyframes.scale)).toBeLessThan(1);   // the slap back down
    const near = kickFor({ kind: 'wave', angle: 0, strength: 0.9 }).keyframes;
    const far = kickFor({ kind: 'wave', angle: 0, strength: 0.3 }).keyframes;
    expect(Math.max(...near.scale)).toBeGreaterThan(Math.max(...far.scale));
    expect(Math.min(...kickFor({ kind: 'slam', strength: 1 }).keyframes.scale)).toBeLessThan(1);
  });

  it('a kick can start from wherever the tile already is', () => {
    const { keyframes } = kickFor({ kind: 'hit', angle: 1, strength: 0.7 });
    const live = fromHere(keyframes);
    expect(Object.keys(live).sort()).toEqual(Object.keys(keyframes).sort());
    for (const [track, values] of Object.entries(live)) {
      expect(values[0]).toBeNull();
      expect(values.slice(1)).toEqual(keyframes[track as keyof typeof keyframes].slice(1));
    }
  });

  it('strength grows with the damage and is clamped', () => {
    expect(hitStrength(1)).toBeLessThan(hitStrength(4));
    expect(hitStrength(0)).toBeGreaterThan(0);
    expect(hitStrength(99)).toBe(1);
  });
});
