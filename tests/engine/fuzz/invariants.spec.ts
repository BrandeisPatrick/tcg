/**
 * Invariants over whole seeded games. Five policy mixes play (heuristic, random-legal and chaos seats, plus two spotlight rosters); every state
 * (accepted move or not) is checked by `checkInvariants`, every accepted move by
 * `checkTransition` — the shop's purchases, sales and moves and the cards played
 * from the hand among them (a random seat shops and plays at random, holds cards
 * into later turns and sells them from the hand; the AI's shop buys its build,
 * plays each card at once and closes). Violations the engine has TODAY are allowlisted in KNOWN —
 * each entry says why — so the suite is green now and an entry can be deleted the
 * day its bug is fixed. A violation with a signature not covered fails the test
 * with the seed / step / move that produced it (replay: `playGame({ seed, policies, prefer })`
 * with the mix's policies, see collect.ts).
 *
 * `#chaos` in a signature = the move was invented by the chaos generator (random
 * ids and slots), i.e. reachable only through malformed input, not through the AI
 * or the UI.
 */
import { describe, expect, it } from 'vitest';
import { MIXES, runInvariantMix } from './collect';
import { describeHit, splitKnown, summarise, type Known } from './hits';
import { formatList, fuzzGames } from './oracle';

const GAMES = fuzzGames(80);

/** Violations the engine has today, each with its reason. */
const KNOWN: Known[] = [
  {
    id: 'revive-spend@endTurn',
    why: 'An oracle gap, not an engine fault: the revive-spend count models a revive but not the Rejuvenator lapsing in the same move. '
      + 'An End step that both ends the match (no hand-over, so the check runs) and closes the credits\' last round revives a hero, '
      + 'then lapses the rest, as the rules say; the oracle reads the lapse as a second credit spent. '
      + 'Seen once the catalogue grew to the full shop (2026-11-05): seed 40155, spotlight-randomLegal.',
    when: (h) => /revive credits \d+ -> 0 after \d+ revive/.test(h.message),
  },
];

describe('invariants hold in every state of seeded games', () => {
  MIXES.forEach((mix, mixIndex) => {
    it(`${mix.label} (${GAMES} games)`, () => {
      const { hits, games, coverage } = runInvariantMix(mixIndex, GAMES);
      expect(games.length).toBe(GAMES);
      if (mix.prefer) {
        // The spotlight rosters exist to reach the intricate rules; make sure they do.
        expect(coverage.remMerges, 'Rem never merged').toBeGreaterThan(0);
        expect(coverage.ultsPlayed, 'no ultimate was ever played').toBeGreaterThan(0);
        expect(coverage.buys, 'nothing was ever bought').toBeGreaterThan(0);
        expect(coverage.activates, 'no active item was ever used').toBeGreaterThan(0);
      }
      // Every seat shops and plays what it buys, upgrades among them; a random seat sells (from
      // the hand too), moves items and plays a card held from an earlier turn (the AI never does).
      expect(coverage.buys, 'nothing was ever bought').toBeGreaterThan(0);
      expect(coverage.plays, 'no card was ever played').toBeGreaterThan(0);
      expect(coverage.discountBuys, 'no upgrade was ever bought for the difference').toBeGreaterThan(0);
      expect(coverage.upgrades, 'no play ever consumed a component').toBeGreaterThan(0);
      if (Object.values(mix.policies).some((p) => p !== 'heuristic')) {
        expect(coverage.sells, 'nothing was ever sold').toBeGreaterThan(0);
        expect(coverage.handSells, 'no card was ever sold from the hand').toBeGreaterThan(0);
        expect(coverage.moveItems, 'no item was ever moved').toBeGreaterThan(0);
        expect(coverage.heldPlays, 'no card held from an earlier turn was ever played').toBeGreaterThan(0);
      }
      // The harness has to actually play: a game that never leaves the draft checks nothing.
      expect(games.every((g) => g.steps > 20)).toBe(true);
      const { unexpected, expected } = splitKnown(hits, KNOWN);
      if (process.env.FUZZ_VERBOSE) {
        // eslint-disable-next-line no-console
        console.info(`[${mix.label}] known violations hit:\n` + summarise(expected).map((s) => `  ${s.signature} x${s.count}`).join('\n'));
      }
      expect(unexpected, formatList(`violations not in KNOWN (${mix.label}) — replay: playGame({ seed, policies: MIXES[${mixIndex}].policies, prefer: MIXES[${mixIndex}].prefer })`, unexpected.map(describeHit))).toEqual([]);
    });
  });
});
