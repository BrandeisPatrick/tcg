/**
 * The foil ramps are decorative everywhere except one place: the card name,
 * which is real body-sized type set in metal on cream paper. A prettier,
 * brighter gold there is a legibility regression that looks like an
 * improvement in a screenshot, so the bound is asserted rather than trusted.
 *
 * Reads the stops straight out of styles.css so the test fails if someone
 * edits the ramp, not merely if they edit a copy of it here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { poster } from '../../src/ui/poster';

const css = readFileSync(resolve(__dirname, '../../src/ui/styles.css'), 'utf8');

function stops(varName: string): string[] {
  const m = css.match(new RegExp(`${varName}:\\s*linear-gradient\\(([^;]*)\\);`, 's'));
  if (!m) throw new Error(`${varName} not found in styles.css`);
  return [...m[1].matchAll(/#([0-9a-f]{6})\b/gi)].map((x) => `#${x[1]}`);
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('foil ramps', () => {
  const TYPE_RAMPS = ['--foil-metal', '--foil-metal-deep'];
  // The keyline paints no type, so it is exempt from contrast — but not from
  // the two rules that make the treatment foil rather than holo.
  const ALL_RAMPS = [...TYPE_RAMPS, '--foil-metal-edge'];

  it('reads every ramp out of the stylesheet', () => {
    for (const r of ALL_RAMPS) expect(stops(r).length, r).toBeGreaterThan(5);
  });

  it('keeps every deep-ramp stop legible on the cream label band', () => {
    // The deep ramp paints the card NAME, which is body-sized — AA is 4.5:1.
    const failures = stops('--foil-metal-deep')
      .map((s) => ({ stop: s, ratio: +contrast(s, poster.paperBand).toFixed(2) }))
      .filter((x) => x.ratio < 4.5);
    expect(failures).toEqual([]);
  });

  it('keeps every full-ramp stop legible on the ink type band', () => {
    // The full ramp paints the type band, cream-on-ink — same bar.
    const failures = stops('--foil-metal')
      .map((s) => ({ stop: s, ratio: +contrast(s, poster.ink).toFixed(2) }))
      .filter((x) => x.ratio < 4.5);
    expect(failures).toEqual([]);
  });

  it('still reads as metal — the ramp reverses rather than sweeping once', () => {
    // A single dark→light sweep is a gloss, not metal. Metal needs the
    // luminance to turn around at least twice across the ramp.
    for (const name of ALL_RAMPS) {
      const ls = stops(name).map(luminance);
      let turns = 0;
      for (let i = 1; i < ls.length - 1; i++) {
        const a = ls[i] - ls[i - 1];
        const b = ls[i + 1] - ls[i];
        if (a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b)) turns++;
      }
      expect(turns, `${name} should reverse at least twice`).toBeGreaterThanOrEqual(2);
    }
  });

  it('never sweeps hue — one gold, or it is holofoil', () => {
    // The rule that separates this treatment from the thing it is not.
    for (const name of ALL_RAMPS) {
      const hues = stops(name).map((s) => {
        const n = parseInt(s.slice(1), 16);
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max === min) return 0;
        const d = max - min;
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return ((h * 60) + 360) % 360;
      });
      // Every stop must sit in the amber/gold wedge.
      for (const h of hues) expect(h, `${name} stop hue ${h}`).toBeGreaterThan(20);
      for (const h of hues) expect(h, `${name} stop hue ${h}`).toBeLessThan(60);
    }
  });
});
