/**
 * Runs seeded games under a policy mix and gathers every invariant violation
 * as a `Hit` (reported when it first appears, so a corrupted game does not
 * repeat itself on every later step).
 */
import { playGame, type GameRecord, type Policy, type Snapshot, type StepInfo } from './driver';
import { collectInvariantViolations, collectTransitionViolations } from './invariants';
import { moveTags, signatureOf, type Hit } from './hits';

export interface Mix { label: string; policies: Record<'0' | '1', Policy>; prefer?: Partial<Record<'0' | '1', string[]>> }

export const MIXES: Mix[] = [
  { label: 'heuristic-vs-heuristic', policies: { '0': 'heuristic', '1': 'heuristic' } },
  { label: 'randomLegal-vs-heuristic', policies: { '0': 'randomLegal', '1': 'heuristic' } },
  { label: 'chaos-vs-randomLegal', policies: { '0': 'chaos', '1': 'randomLegal' } },
  // Spotlight mixes: the rosters are loaded with the heroes whose rules are most intricate
  // (Rem merges, Sinclair copies an ultimate, Mirage swaps, Wraith / Mirage riders, Lady Geist swaps HP).
  {
    label: 'spotlight-heuristic',
    policies: { '0': 'heuristic', '1': 'heuristic' },
    prefer: { '0': ['hero_rem', 'hero_sinclair', 'hero_lady_geist', 'hero_mo_krill'], '1': ['hero_mirage', 'hero_wraith', 'hero_shiv', 'hero_seven'] },
  },
  {
    label: 'spotlight-randomLegal',
    policies: { '0': 'randomLegal', '1': 'randomLegal' },
    prefer: { '0': ['hero_rem', 'hero_sinclair', 'hero_viscous', 'hero_yamato'], '1': ['hero_rem', 'hero_mirage', 'hero_warden', 'hero_dynamo'] },
  },
];

/** Seeds are fixed per mix so a failure names a game that can be replayed. */
export const seedFor = (mixIndex: number, i: number) => 100 + mixIndex * 10_000 + i;

export function makeHit(mix: string, before: Snapshot, m: StepInfo, check: string, message: string): Hit {
  return {
    signature: signatureOf(check, m.name, m.chaos),
    mix,
    seed: m.seed,
    step: m.step,
    move: m.name,
    args: m.args,
    chaos: m.chaos,
    tags: moveTags(before, m.name, m.args),
    message,
  };
}

export interface Coverage { remMerges: number; ultsPlayed: number; freeCopiesPlayed: number; attacks: number; kos: number }
export interface MixRun { hits: Hit[]; games: GameRecord[]; coverage: Coverage }

export function runInvariantMix(mixIndex: number, games: number): MixRun {
  const mix = MIXES[mixIndex];
  const hits: Hit[] = [];
  const records: GameRecord[] = [];
  const coverage: Coverage = { remMerges: 0, ultsPlayed: 0, freeCopiesPlayed: 0, attacks: 0, kos: 0 };
  for (let i = 0; i < games; i++) {
    const seed = seedFor(mixIndex, i);
    let active = new Set<string>();
    const rec = playGame({
      seed,
      policies: mix.policies,
      prefer: mix.prefer,
      afterMove: (before, after, m, accepted) => {
        const vs = [
          ...collectInvariantViolations(after.G, after.ctx),
          ...collectTransitionViolations(before, after, m, accepted),
        ];
        const now = new Set<string>();
        for (const v of vs) {
          now.add(v.key);
          if (!active.has(v.key)) hits.push(makeHit(mix.label, before, m, v.id, v.message));
        }
        active = now;
        if (accepted) tally(coverage, before, m);
        // A move taken from the legal-move list that the live client refuses.
        if (!accepted && !m.chaos && m.policy !== 'fallback' && m.name !== 'endTurn') {
          hits.push(makeHit(mix.label, before, m, 'legal-move-rejected', `${m.policy} chose ${m.name} and the engine refused it`));
        }
      },
    });
    records.push(rec);
    for (const t of rec.threw) {
      hits.push({
        signature: signatureOf('engine-threw', t.move.name, t.move.chaos),
        mix: mix.label, seed, step: t.move.step, move: t.move.name, args: t.move.args, chaos: t.move.chaos, tags: [], message: t.error,
      });
    }
    for (const t of rec.policyThrew) {
      hits.push({ signature: signatureOf('policy-threw', 'enumerate', false), mix: mix.label, seed, step: t.step, move: 'enumerate', args: [], chaos: false, tags: [], message: t.error });
    }
  }
  return { hits, games: records, coverage };
}

/** What an accepted move exercised, so a spec can insist the rare paths are really played. */
function tally(c: Coverage, before: Snapshot, m: StepInfo) {
  const me = before.G.players[before.ctx.currentPlayer as '0' | '1'];
  if (m.name === 'attack') c.attacks++;
  if (m.name === 'useSkill') {
    const hero = [me.active, ...me.bench].find((h) => h && h.iid === m.args[0]);
    if (hero?.cardId === 'hero_rem') c.remMerges++;
  }
  if (m.name === 'playCard') {
    const card = me.hand.find((h) => h.iid === m.args[0]);
    if (card && card.cardId.startsWith('ult_')) {
      c.ultsPlayed++;
      if (card.costOverride !== undefined) c.freeCopiesPlayed++;
    }
  }
}
