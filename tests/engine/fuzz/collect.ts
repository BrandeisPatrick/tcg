/**
 * Runs seeded games under a policy mix and gathers every invariant violation
 * as a `Hit` (reported when it first appears, so a corrupted game does not
 * repeat itself on every later step).
 */
import { playGame, type GameRecord, type Policy, type Snapshot, type StepInfo } from './driver';
import { collectInvariantViolations, collectTransitionViolations } from './invariants';
import { moveTags, signatureOf, type Hit } from './hits';
import { resolveSkill, isRespawning } from '@/engine/query';
import { PIDS, heroesOfSide, slottedHeroOf, upgradeComponentOracle } from './oracle';

interface Mix { label: string; policies: Record<'0' | '1', Policy>; prefer?: Partial<Record<'0' | '1', string[]>> }

export const MIXES: Mix[] = [
  { label: 'heuristic-vs-heuristic', policies: { '0': 'heuristic', '1': 'heuristic' } },
  { label: 'randomLegal-vs-heuristic', policies: { '0': 'randomLegal', '1': 'heuristic' } },
  { label: 'chaos-vs-randomLegal', policies: { '0': 'chaos', '1': 'randomLegal' } },
  // Spotlight mixes: the rosters are loaded with the heroes whose rules are most intricate
  // (Rem merges, Sinclair copies an ultimate, Mirage swaps, Wraith / Mirage riders, Lady Geist swaps HP)
  // and whose builds hold active items (Sinclair's hexes, Mo & Krill's wards, Rem's Healing Nova).
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

function makeHit(mix: string, before: Snapshot, m: StepInfo, check: string, message: string): Hit {
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

/** What the accepted moves of a mix exercised, so a spec can insist the rare paths are really played. */
export interface Coverage {
  remMerges: number;
  ultsPlayed: number;
  freeCopiesPlayed: number;
  attacks: number;
  kos: number;
  buys: number;
  upgrades: number;
  sells: number;
  moveItems: number;
  activates: number;
}
interface MixRun { hits: Hit[]; games: GameRecord[]; coverage: Coverage }

export function runInvariantMix(mixIndex: number, games: number): MixRun {
  const mix = MIXES[mixIndex];
  const hits: Hit[] = [];
  const records: GameRecord[] = [];
  const coverage: Coverage = { remMerges: 0, ultsPlayed: 0, freeCopiesPlayed: 0, attacks: 0, kos: 0, buys: 0, upgrades: 0, sells: 0, moveItems: 0, activates: 0 };
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
        if (accepted) tally(coverage, before, after, m);
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

/** What an accepted move exercised. */
function tally(c: Coverage, before: Snapshot, after: Snapshot, m: StepInfo) {
  const pid = before.ctx.currentPlayer as '0' | '1';
  const me = before.G.players[pid];
  if (m.name === 'attack') c.attacks++;
  if (m.name === 'useSkill') {
    const hero = [me.active, ...me.bench].find((h) => h && h.iid === m.args[0]);
    const kind = hero && resolveSkill(hero, typeof m.args[2] === 'string' ? m.args[2] : undefined)?.kind;
    if (hero?.cardId === 'hero_rem' && kind === 'skill') c.remMerges++;
    // An ultimate is a kit ability now: its own, or one borrowed from the rival (Sinclair's copy).
    if (kind === 'ult' || kind === 'borrowed') c.ultsPlayed++;
    if (kind === 'borrowed') c.freeCopiesPlayed++;
  }
  if (m.name === 'buy') {
    c.buys++;
    const hero = slottedHeroOf(before.G, pid, m.args[1]);
    if (hero && upgradeComponentOracle(hero, m.args[0])) c.upgrades++;
  }
  if (m.name === 'sell') c.sells++;
  if (m.name === 'moveItem') c.moveItems++;
  if (m.name === 'activate') c.activates++;
  // Heroes that fell during the move, on either side.
  for (const p of PIDS) {
    const alive = new Set(heroesOfSide(before.G.players[p]).filter((h) => !isRespawning(h)).map((h) => h.iid));
    c.kos += heroesOfSide(after.G.players[p]).filter((h) => alive.has(h.iid) && isRespawning(h)).length;
  }
}
