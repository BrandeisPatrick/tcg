/**
 * forecastAttack (what the board shows, what the choreographer walks, what the AI scores)
 * against the `attack` move (what happens). At every decision point of seeded games where
 * the attack is open, the forecast is compared with the move made on a clone:
 *   damageToActive   vs the target's HP before - after
 *   defenderActiveKO vs the target becoming a corpse
 *   patronDamage     vs the defender's patron HP before - after
 *   last step's predictedHpAfter vs the target's final HP
 *   the steps' finalDamage vs the hits the attack's own events carry
 *   the forecast's events vs the events the real attack appends to G.fx (seqs included)
 * plus the AI's lethal verdict (an attack that wins on a clone leads the legal-move list).
 *
 * The forecast is the attack run on a copy, so there is nothing to allow-list: any mismatch
 * fails with the attacker's and target's cards, gear and statuses. Hand-built boards the old
 * hand-written planner got wrong: tests/engine/forecast.spec.ts and regressions.spec.ts (M2).
 */
import { describe, expect, it } from 'vitest';
import { MIXES, seedFor } from './collect';
import { playGame } from './driver';
import { probeForecast } from './forecast';
import { describeHit, splitKnown, summarise, type Hit } from './hits';
import { formatList, fuzzGames } from './oracle';

const GAMES = fuzzGames(40);
/** heuristic, randomLegal-vs-heuristic and the heuristic spotlight (Wraith, Mirage, Shiv, Seven on one side). */
const MIX_IDS = [0, 1, 3];

describe('forecastAttack equals what the attack move does', () => {
  // Two mixes: both seats play real attacks; the heuristic seat attacks whenever it pays.
  MIX_IDS.forEach((mixIndex) => {
    const mix = MIXES[mixIndex];
    it(`${mix.label} (${GAMES} games)`, () => {
      const hits: Hit[] = [];
      let forecasts = 0;
      for (let g = 0; g < GAMES; g++) {
        playGame({
          seed: seedFor(mixIndex, g),
          policies: mix.policies,
          prefer: mix.prefer,
          beforeMove: (snap, info) => { forecasts += probeForecast(snap, info, hits, mix.label); },
        });
      }
      expect(forecasts).toBeGreaterThan(GAMES);
      const { unexpected, expected } = splitKnown(hits, []);
      if (process.env.FUZZ_VERBOSE) {
        // eslint-disable-next-line no-console
        console.info(`[${mix.label}] ${forecasts} forecasts, mismatches:\n` + summarise(expected).map((s) => `  ${s.signature} x${s.count}`).join('\n'));
      }
      expect(unexpected, formatList(`forecast mismatches not in KNOWN (${mix.label}) — replay: playGame({ seed, policies: MIXES[${mixIndex}].policies, prefer: MIXES[${mixIndex}].prefer })`, unexpected.map(describeHit))).toEqual([]);
    });
  });
});
