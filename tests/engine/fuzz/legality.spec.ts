/**
 * The engine's idea of "legal" against the other places that have one:
 *   A  every move enumerateAIMoves offers is accepted by the move function;
 *   B  legality.skillBlocked === null  <=>  useSkill succeeds for some target the AI would try;
 *   C  a rejected move leaves the state untouched (validate before mutate), and the engine
 *      never throws on garbage arguments;
 *   D  targets: the engine accepts exactly the targets the ability's TargetFilter allows
 *      (rules oracle in oracle.ts, written from the TargetFilter doc, not from the engine);
 *   E  moveHero: legal swaps accepted, junk slots / an emptied Active / a bench-only hero in
 *      the Active slot refused;
 *   F  an owed promotion (G.pendingPromotion) leaves the promotion as the only legal action,
 *      endTurn and attack included (B, D and E are asked of ordinary positions).
 *
 * Everything is checked on structuredClones at the decision points of seeded live games.
 * KNOWN lists what the engine does today; see regressions.spec.ts for a minimal
 * reproduction of each.
 */
import { describe, expect, it } from 'vitest';
import { MIXES, seedFor } from './collect';
import { playGame } from './driver';
import { DEFAULT_PROBE, probeLegality, type ProbeOpts } from './legality';
import { describeHit, splitKnown, summarise, type Hit, type Known } from './hits';
import { formatList, fuzzGames } from './oracle';

const GAMES = fuzzGames(12);
const PROBE: ProbeOpts = DEFAULT_PROBE;

/** Violations the engine has today, each with its reason (none: every finding is fixed). */
const KNOWN: Known[] = [];

describe('the engine agrees with the AI list, the UI gate and the rules oracle', () => {
  MIXES.forEach((mix, mixIndex) => {
    it(`${mix.label} (${GAMES} games)`, () => {
      const hits: Hit[] = [];
      let decisions = 0;
      for (let g = 0; g < GAMES; g++) {
        playGame({
          seed: seedFor(mixIndex, g),
          policies: mix.policies,
          prefer: mix.prefer,
          beforeMove: (snap, info, rnd) => {
            decisions++;
            probeLegality(snap, info, rnd, hits, mix.label, PROBE);
          },
        });
      }
      expect(decisions).toBeGreaterThan(GAMES * 20);
      const { unexpected, expected } = splitKnown(hits, KNOWN);
      if (process.env.FUZZ_VERBOSE) {
        // eslint-disable-next-line no-console
        console.info(`[${mix.label}] known:\n` + summarise(expected).map((s) => `  ${s.signature} x${s.count}`).join('\n'));
      }
      expect(unexpected, formatList(`legality violations not in KNOWN (${mix.label}) — replay: playGame({ seed, policies: MIXES[${mixIndex}].policies, prefer: MIXES[${mixIndex}].prefer, beforeMove: probeLegality… })`, unexpected.map(describeHit))).toEqual([]);
    });
  });
});
