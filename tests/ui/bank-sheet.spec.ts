import { describe, it, expect } from 'vitest';
import { bankFootnote, bankRows } from '@/ui/board/SoulsCounter';
import { bankForecast } from '@/engine/bank';
import { LANE_INCOME, ROUND_CAP } from '@/engine/constants';
import { freshReadyGame } from '../engine/_helpers';

// The bank sheet over your souls: what the next turn pays, what you will hold
// then, and what a kill pays now (docs/balance-model.md §7).
describe('the bank sheet', () => {
  it('lists the next turn\'s income, what that makes with nothing spent, and the kill bounty now', () => {
    const G = freshReadyGame(); // round 1, P0's turn
    G.players['0'].souls = 6;
    const bank = bankForecast(G, '0');
    expect(bankRows(bank)).toEqual([
      { label: 'Next turn', value: `+${LANE_INCOME}` },
      { label: 'You will hold', value: String(6 + LANE_INCOME) },
      { label: 'A kill pays', value: '1' },
    ]);
    expect(bankFootnote(bank)).toBe('1 more every two rounds.');
  });

  it('says what a kill pays from next round when that is more', () => {
    const G = freshReadyGame();
    G.turnNumber = 8; // round 4: a kill pays 2 now, 3 from round 5
    const bank = bankForecast(G, '0');
    expect(bankRows(bank)[2]).toEqual({ label: 'A kill pays', value: '2' });
    expect(bankFootnote(bank)).toBe('3 from next round. 1 more every two rounds.');
  });

  it('on a side\'s last turn the lane pays nothing more, and the bounty is at its most', () => {
    const G = freshReadyGame();
    G.turnNumber = 2 * ROUND_CAP; // P0 moves second: its last turn
    G.players['0'].souls = 9;
    const bank = bankForecast(G, '0');
    expect(bankRows(bank)).toEqual([
      { label: 'Next turn', value: 'Last round' },
      { label: 'A kill pays', value: '10' }, // round 20's bounty (the cap since 2026-11-16)
    ]);
    expect(bankFootnote(bank)).toBe('The most a kill pays.');
  });
});
