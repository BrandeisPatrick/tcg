import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { hpPrint, hpState, poster } from '@/ui/poster';
import { HeartIcon } from '@/ui/card/Icons';

// The HP at a hero tile's foot (Patrick, 2026-11-15: "the health needs to be
// better displayed when damaged or buffed"; "I don't like 1/6"; "do different
// kind of heart icon"): its state reads at rest, in the heart's shape and the
// inks, with the number alone.
describe('how a hero tile prints its HP', () => {
  it('whole at its printed base: the plain red heart and a plain ink number', () => {
    expect(hpPrint(6, 6, 6)).toEqual({ state: 'whole', heart: poster.stat.hp, number: poster.ink });
  });
  it('hurt: the broken heart, red, and the number in the damage red', () => {
    expect(hpPrint(1, 3, 3)).toEqual({ state: 'hurt', heart: poster.stat.hp, number: poster.redDeep });
  });
  it('whole with its max raised above the base (a level, an item): the heart with a plus, and the number, in the green of a raised stat', () => {
    expect(hpPrint(8, 8, 6)).toEqual({ state: 'raised', heart: poster.stat.atkBright, number: poster.stat.atkBright });
  });
  it('hurt with a raised max: hurt wins', () => {
    expect(hpState(5, 8, 6)).toBe('hurt');
    expect(hpPrint(5, 8, 6).number).toBe(poster.redDeep);
  });
});

describe('the heart icon has a shape for each state', () => {
  const svg = (state?: 'whole' | 'hurt' | 'raised') => renderToStaticMarkup(createElement(HeartIcon, { size: 13, state }));
  it('whole: one path; hurt: two halves, parted; raised: a plus cut out', () => {
    expect(svg()).toContain('data-heart="whole"');
    expect((svg('whole').match(/<path/g) ?? []).length).toBe(1);
    expect(svg('hurt')).toContain('data-heart="hurt"');
    expect((svg('hurt').match(/<path/g) ?? []).length).toBe(2);
    expect(svg('hurt')).toContain('rotate(-6 8 14)');
    expect(svg('raised')).toContain('data-heart="raised"');
    expect(svg('raised')).toContain('fill-rule="evenodd"');
  });
  it('the three are different marks', () => {
    expect(new Set([svg('whole'), svg('hurt'), svg('raised')]).size).toBe(3);
  });
});
