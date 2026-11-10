/**
 * The engine's idea of "legal" against the other places that have one:
 *   A  every move enumerateAIMoves offers is accepted by the move function;
 *   B  legality.skillBlocked === null  <=>  useSkill succeeds for some target the AI would try
 *      (each skill of each hero on its own; a skill still cooling down never succeeds);
 *   C  a rejected move leaves the state untouched (validate before mutate), and the engine
 *      never throws on garbage arguments;
 *   D  targets and item use: a skill is accepted exactly on the targets its TargetFilter allows,
 *      and an item worn on either side is used exactly when the item oracle says so — an
 *      active one, by a standing bearer that has not used its ability and no status locks,
 *      ready (off cooldown, or a hard crowd-control charge left), on a target its first
 *      ability's filter allows with the bearer as the source (rules oracles in oracle.ts,
 *      written from the TargetFilter doc and rules.md, not from the engine);
 *   E  moveHero: legal swaps accepted, junk slots / an emptied Active / a bench-only hero in
 *      the Active slot / any swap around a choice owed refused;
 *   F  an owed promotion (G.pendingPromotion) leaves the promotion as the only legal action,
 *      endTurn, the attack, an item, a card or a hero from the hand and a discard included;
 *      F2 the opening's first Active (G.pendingActive) and F3 a draw card's discard
 *      (G.pendingDiscard) likewise: legalActions lists exactly the choice (for either seat),
 *      sampled answers are accepted exactly when the oracle allows them, and every other move
 *      is refused (B, D, E and H are asked of ordinary positions);
 *   G  the attack: `attack(targetIid)` is accepted exactly for the heroes the rules oracle lists
 *      (the rival Active, or any living enemy hero for a hero with reach, never one under a
 *      Dome), a refusal changes nothing, and legalActions offers one attack per listed hero;
 *   H  the hand: legalActions lists exactly the plays the oracle allows (each item onto each
 *      hero of the side in a slot it may go on, one per upgrade when it could make several;
 *      each hero into an empty lane and onto the bench; none after the attack and none for the
 *      seat not on turn), and sampled plays (its cards or not, onto its heroes, a rival's, a
 *      merged Rem, junk; an upgrade named right, wrong or junk; souls short) and placements
 *      are accepted exactly when the oracle allows them; a discard or a first Active nobody
 *      owes is refused.
 *
 * Everything is checked on structuredClones at the decision points of seeded live games; a
 * probe move the engine accepts is also held to the transition rules and the state
 * invariants (`probe:<id>` signatures). KNOWN lists what the engine does today; see
 * regressions.spec.ts for a minimal reproduction of each.
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
