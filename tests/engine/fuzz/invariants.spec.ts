/**
 * Invariants over whole seeded games. Five policy mixes play (heuristic, random-legal and chaos seats, plus two spotlight rosters); every state
 * (accepted move or not) is checked by `checkInvariants`, every accepted move by
 * `checkTransition` — the shop's purchases, sales and moves among them (a random
 * seat shops at random; the AI's shop buys its build and closes). Violations the engine has TODAY are allowlisted in KNOWN —
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

/** Violations the engine has today, each with its reason (none: every finding is fixed). */
const KNOWN: Known[] = [];

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
      // Every seat shops; a random seat sells and moves items too (the AI's shop never does).
      expect(coverage.buys, 'nothing was ever bought').toBeGreaterThan(0);
      if (Object.values(mix.policies).some((p) => p !== 'heuristic')) {
        expect(coverage.sells, 'nothing was ever sold').toBeGreaterThan(0);
        expect(coverage.moveItems, 'no item was ever moved').toBeGreaterThan(0);
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
