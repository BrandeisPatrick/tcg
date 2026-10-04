/**
 * The holo is four layers on blend modes — dodge, screen, overlay — and a
 * blend mode only reaches as far as the nearest stacking context. If the
 * wrapper they sit in becomes one (a z-index, a mask, an opacity, a filter…),
 * every layer is cut off from the art and the whole stack is laid over the
 * picture as flat translucent paint: a bright fog that lifts the blacks. It
 * looks plausible in a screenshot, which is how it shipped once, so the rule
 * is asserted rather than trusted.
 *
 * Reads the rule straight out of styles.css, like foil-contrast.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../../src/ui/styles.css'), 'utf8');

/** Property names declared by the rule whose selector is exactly `selector`. */
function properties(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const m = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm'));
  if (!m) throw new Error(`${selector} not found in styles.css`);
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((d) => d.split(':')[0].trim())
    .filter(Boolean);
}

/** Everything that makes an element a stacking context, and so isolates the
 *  blend modes of whatever is inside it. */
const ISOLATING = /^(z-index|opacity|filter|backdrop-filter|transform|perspective|isolation|mix-blend-mode|clip-path|will-change|contain|(-webkit-)?mask(-.+)?)$/;

describe('holo layers', () => {
  it('sit in a wrapper that is not a stacking context, so they blend with the art', () => {
    expect(properties('.holo').filter((p) => ISOLATING.test(p))).toEqual([]);
  });

  it('carry the paint order themselves', () => {
    expect(properties('.holo > i')).toContain('z-index');
  });

  it('wear the point light themselves: the bands and the glare are masked', () => {
    expect(properties('.holo__shine')).toContain('mask-image');
    expect(properties('.holo__glare')).toContain('mask-image');
  });
});
