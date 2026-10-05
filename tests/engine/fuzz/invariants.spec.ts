/**
 * Invariants over whole seeded games. Five policy mixes play (heuristic, random-legal and chaos seats, plus two spotlight rosters); every state
 * (accepted move or not) is checked by `checkInvariants`, every accepted move by
 * `checkTransition`. Violations the engine has TODAY are allowlisted in KNOWN —
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
import { describeHit, splitKnown, summarise, type Hit, type Known } from './hits';
import { formatList, fuzzGames } from './oracle';

const GAMES = fuzzGames(80);

const KNOWN: Known[] = [
  // ---- reachable in normal play (AI or UI moves) ----
  {
    id: 'corpse-state@playCard',
    why: 'E2b: Lady Geist\'s Soul Exchange writes hp onto a corpse Active.',
    when: (h) => h.tags.includes('type:ultimate'),
  },
  {
    id: 'hero-hp-range@playCard',
    why: 'E2a: Soul Exchange (eff_ult_lady_geist) swaps raw hp values with no clamp to the receiver\'s hpMax.',
    when: (h) => h.tags.includes('card:ult_lady_geist'),
  },
  {
    id: 'card-vanished@playCard',
    why: 'E3: a merged Rem counts as an equipment slot and can be named as the discard (game.ts:471-484; the AI does it, heuristic.ts:305-324). She goes to the discard pile and her own gear is lost with her.',
    when: (h) => h.tags.includes('discard:merged-rem'),
  },
  {
    id: 'equipment-cap@playCard',
    why: 'E3c: discarding the merged Rem frees one "slot" but the hero still wears 3 pieces of gear, so the new item makes 4.',
    when: (h) => h.tags.includes('discard:merged-rem'),
  },
  // ---- reachable only through a made-up move (chaos) ----
  {
    id: 'corpse-state@playCard#chaos',
    why: 'E2b: Soul Exchange against / from a corpse Active gives the corpse hp.',
  },
  {
    id: 'hero-hp-range@playCard#chaos',
    why: 'E2a: Soul Exchange again (the chaos seat plays it with a bad target argument).',
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
