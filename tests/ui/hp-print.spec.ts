import { describe, it, expect } from 'vitest';
import { hpPrint, poster } from '@/ui/poster';

// The HP number at a hero tile's foot (Patrick, 2026-11-15: "the health needs
// to be better displayed when damaged or buffed"): its state reads at rest.
describe('how a hero tile prints its HP', () => {
  it('whole at its printed base: plain ink, no max', () => {
    expect(hpPrint(6, 6, 6)).toEqual({ ink: poster.ink, max: null });
  });
  it('hurt: the damage red, with its max after it', () => {
    expect(hpPrint(1, 3, 3)).toEqual({ ink: poster.redDeep, max: { value: 3, ink: poster.inkDim } });
  });
  it('whole with its max raised above the base (a level, an item): the buff green', () => {
    expect(hpPrint(8, 8, 6)).toEqual({ ink: poster.stat.atkBright, max: null });
  });
  it('hurt with a raised max: red, and the max keeps its green', () => {
    expect(hpPrint(5, 8, 6)).toEqual({ ink: poster.redDeep, max: { value: 8, ink: poster.stat.atkBright } });
  });
});
