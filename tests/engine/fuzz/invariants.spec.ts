/**
 * Invariants over whole seeded games. Five policy mixes play (heuristic, random-legal and chaos seats, plus two spotlight rosters); every state
 * (accepted move or not) is checked by `checkInvariants`, every accepted move by
 * `checkTransition` — the draw, the cards played from the hand (heroes onto the board,
 * items onto heroes, upgrades evolving and made), the draw cards and their discards among
 * them (a random seat plays at random, holds cards into later turns and discards at random;
 * the AI plays its builds). Violations the engine has TODAY are allowlisted in KNOWN —
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
    id: 'revive-spend@endTurn*',
    why: 'An oracle gap, not an engine fault: the revive-spend count models a revive but not the Rejuvenator lapsing in the same move. '
      + 'An End step that both ends the match (no hand-over, so the check runs) and closes the credits\' last round revives a hero, '
      + 'then lapses the rest, as the rules say; the oracle reads the lapse as a second credit spent. '
      + 'Seen once the catalogue grew to the full shop (2026-11-05): seed 40155, spotlight-randomLegal; '
      + 'and once the draft pool grew to 21 heroes (2026-11-09), by a chaos seat\'s endTurn: seed 20126, chaos-vs-randomLegal.',
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
        expect(coverage.activates, 'no active item was ever used').toBeGreaterThan(0);
        expect(coverage.drawCards, 'no draw card was ever cast').toBeGreaterThan(0);
        expect(coverage.discards, 'no discard was ever made').toBeGreaterThan(0);
      }
      // Every seat opens on a first Active, places the heroes it draws and plays items onto
      // them, making upgrades and evolving them; fallen heroes come back to the hand. A random
      // seat plays a card held from an earlier turn.
      expect(coverage.firstActives, 'no first Active was ever chosen').toBeGreaterThan(0);
      expect(coverage.heroesPlaced, 'no hero was ever put on the board from the hand').toBeGreaterThan(0);
      expect(coverage.plays, 'no card was ever played').toBeGreaterThan(0);
      expect(coverage.upgradesMade, 'no play ever made an upgrade').toBeGreaterThan(0);
      expect(coverage.evolves, 'no upgrade ever evolved').toBeGreaterThan(0);
      expect(coverage.backToHand, 'no fallen hero ever came back to the hand').toBeGreaterThan(0);
      if (Object.values(mix.policies).some((p) => p !== 'heuristic')) {
        expect(coverage.heldPlays, 'no card held from an earlier turn was ever played').toBeGreaterThan(0);
        // A random seat plays onto full heroes, each time in place of a worn item it names.
        expect(coverage.replaces, 'no card ever replaced a worn item on a full hero').toBeGreaterThan(0);
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
