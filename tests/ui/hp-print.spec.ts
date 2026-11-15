import { describe, it, expect } from 'vitest';
import { hpPrint, poster } from '@/ui/poster';

// The HP number at a hero tile's foot (Patrick, 2026-11-15: "the health needs
// to be better displayed when damaged or buffed"; "I don't like 1/6"): its
// state reads at rest, in the number's ink alone.
describe('the ink a hero tile prints its HP in', () => {
  it('whole at its printed base: plain ink', () => {
    expect(hpPrint(6, 6, 6)).toBe(poster.ink);
  });
  it('hurt: the damage red', () => {
    expect(hpPrint(1, 3, 3)).toBe(poster.redDeep);
  });
  it('whole with its max raised above the base (a level, an item): the green of a raised stat', () => {
    expect(hpPrint(8, 8, 6)).toBe(poster.stat.atkBright);
  });
  it('hurt with a raised max: red wins', () => {
    expect(hpPrint(5, 8, 6)).toBe(poster.redDeep);
  });
});
