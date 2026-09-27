import { describe, it, expect } from 'vitest';
import { FxImpulseBus, hitStrength, kickFor, type FxImpulse } from '@/ui/effects/fx/FxImpulse';

/** The recoil channel between the FX players and the hero tiles, and the
 *  pure kick shapes HeroSlot animates. */

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

  it('emitting to a card nobody listens on is a no-op', () => {
    expect(() => new FxImpulseBus().emit('ghost', { kind: 'ko', strength: 1 })).not.toThrow();
  });
});

describe('kick shapes', () => {
  const kinds: FxImpulse['kind'][] = ['hit', 'ko', 'heal', 'shield'];

  it('every track starts and ends at rest, with matching lengths', () => {
    for (const kind of kinds) {
      for (const angle of [undefined, 0, Math.PI / 2, Math.PI, -2.1]) {
        const { keyframes, duration } = kickFor({ kind, angle, strength: 0.8 });
        const { x, y, rotate, scale } = keyframes;
        expect(duration).toBeGreaterThan(0);
        expect(new Set([x.length, y.length, rotate.length, scale.length]).size).toBe(1);
        expect([x[0], y[0], rotate[0]]).toEqual([0, 0, 0]);
        expect(scale[0]).toBe(1);
        expect([x.at(-1), y.at(-1), rotate.at(-1)]).toEqual([0, 0, 0]);
        expect(scale.at(-1)).toBe(1);
        for (const v of [...x, ...y, ...rotate, ...scale]) expect(Number.isFinite(v)).toBe(true);
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

  it('strength grows with the damage and is clamped', () => {
    expect(hitStrength(1)).toBeLessThan(hitStrength(4));
    expect(hitStrength(0)).toBeGreaterThan(0);
    expect(hitStrength(99)).toBe(1);
  });
});
