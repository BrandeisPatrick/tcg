/**
 * Fair-evaluation report runner.
 *
 *   npx vite-node scripts/eval/run.ts smoke      # quick API/speed check
 *   npx vite-node scripts/eval/run.ts full [N]   # full battery (default N=1000)
 *
 * Produces: a skill ladder (random→heuristic→MCTS) to gauge whether the game
 * rewards skill and whether the heuristic is trustworthy; seat-fairness with a
 * confidence interval; pacing; and per-hero win-rates with Wilson CIs (only
 * statistically-significant outliers are starred).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { runBatch, runGame, wilson, heroName, type GameResult, type AgentKind } from './framework';

const MODE = (process.argv[2] ?? 'full') as 'smoke' | 'full';
const N = Number(process.argv[3] ?? (MODE === 'smoke' ? 6 : 1000));
const TURN_CAP = 40;
const MCTS_ITER = 40;
const MCTS_GAMES = MODE === 'smoke' ? 4 : 60;
const LADDER_GAMES = MODE === 'smoke' ? 20 : 400;

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const ciStr = (w: number, n: number) => {
  const { p, lo, hi } = wilson(w, n);
  return `${pct(p)} [${pct(lo)}–${pct(hi)}]`;
};
const offFifty = (w: number, n: number) => {
  const { lo, hi } = wilson(w, n);
  return lo > 0.5 || hi < 0.5;
};

/** Seat-balanced duel: A and B each play P0 half the time. Returns A's record. */
async function duel(a: AgentKind, b: AgentKind, games: number, seed: number, mctsIter?: number) {
  let aWins = 0, bWins = 0, stale = 0;
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1;
    const agents = swap ? { '0': b, '1': a } : { '0': a, '1': b };
    const r = await runGame({ seed: (seed + i * 40503) >>> 0, agents, turnCap: TURN_CAP, mctsIterations: mctsIter });
    if (r.stalemate) { stale++; continue; }
    const aSeat = swap ? '1' : '0';
    if (r.winner === aSeat) aWins++; else bWins++;
  }
  return { aWins, bWins, stale, n: aWins + bWins };
}

async function main() {
  const t0 = Date.now();
  let md = `# Fair Evaluation — Deadlock TCG\n\n`;
  md += `_${MODE} run · ${new Date().toISOString().slice(0, 16)} · turn cap ${TURN_CAP}._\n\n`;

  // ---- 1. Skill ladder -------------------------------------------------------
  console.log('Skill ladder…');
  const rr = await duel('random', 'random', LADDER_GAMES, 1001);       // pure seat (zero skill)
  const hr = await duel('heuristic', 'random', LADDER_GAMES, 2002);    // does heuristic beat random?
  console.log(`  MCTS vs heuristic (${MCTS_GAMES} games, iter ${MCTS_ITER}) — slow…`);
  const mh = await duel('mcts', 'heuristic', MCTS_GAMES, 3003, MCTS_ITER);

  md += `## 1. Skill ladder — does the game reward skill? is the heuristic trustworthy?\n`;
  md += `Seat-balanced (each agent plays P0 half the time). Win-rate of the first-named agent, 95% CI.\n\n`;
  md += `| Matchup | win-rate | reads as |\n|---|---|---|\n`;
  md += `| random vs random (P0) | ${ciStr(rr.aWins, rr.n)} | pure **seat** advantage at zero skill |\n`;
  md += `| heuristic vs random | ${ciStr(hr.aWins, hr.n)} | does the heuristic beat coin-flip play? |\n`;
  md += `| MCTS vs heuristic | ${ciStr(mh.aWins, mh.n)} | is there headroom above the heuristic? (N=${mh.n}) |\n\n`;
  const heurBeatsRandom = wilson(hr.aWins, hr.n).lo > 0.5;
  const mctsBeatsHeur = wilson(mh.aWins, mh.n).lo > 0.5;
  md += `**Interpretation:** ` +
    `${heurBeatsRandom ? 'heuristic clearly beats random (game rewards basic skill). ' : '⚠ heuristic does NOT clearly beat random — either the game is near-coinflip or the heuristic is poor. '}` +
    `${mctsBeatsHeur ? '⚠ MCTS beats the heuristic — the heuristic is leaving skill on the table, so **per-hero numbers from the heuristic are not yet trustworthy** for skill-dependent heroes.' : 'MCTS does not clearly beat the heuristic at this iteration budget — heuristic is a reasonable proxy (or MCTS needs more iterations).'}\n\n`;

  // ---- 2 + 3 + 4. heuristic v heuristic battery (seat / pacing / hero) -------
  console.log(`Main battery: heuristic v heuristic × ${N}…`);
  const res: GameResult[] = await runBatch({
    games: N, masterSeed: 7007, agents: { '0': 'heuristic', '1': 'heuristic' }, turnCap: TURN_CAP,
    onProgress: (i) => { if (i % 200 === 0) console.log(`  …${i}/${N}`); },
  });

  let p0 = 0, p1 = 0, stale = 0;
  const lengths: number[] = [];
  const hero: Record<string, { games: number; wins: number }> = {};
  const equip: Record<string, { games: number; wins: number }> = {};
  for (const r of res) {
    if (r.stalemate) { stale++; }
    else { r.winner === '0' ? p0++ : p1++; lengths.push(r.length); }
    for (const side of ['0', '1'] as const) {
      const won = !r.stalemate && r.winner === side;
      for (const id of r.heroes[side]) {
        (hero[id] ??= { games: 0, wins: 0 }).games++;
        if (won) hero[id].wins++;
      }
      // dedupe per side per game → "built at least once this game"
      for (const id of new Set(r.equips[side])) {
        (equip[id] ??= { games: 0, wins: 0 }).games++;
        if (won) equip[id].wins++;
      }
    }
  }
  const decisive = p0 + p1;

  md += `## 2. Seat fairness — heuristic v heuristic, random drafts, N=${N}\n`;
  md += `- First-player (P0) win-rate: **${ciStr(p0, decisive)}**${offFifty(p0, decisive) ? ' — ✗ significantly ≠ 50%' : ' — within noise of 50%'}\n`;
  md += `- (random-vs-random seat figure above is the zero-skill control)\n\n`;

  const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const sorted = [...lengths].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const buckets: [number, number][] = [[1, 3], [4, 6], [7, 9], [10, 12], [13, 99]];
  md += `## 3. Pacing\n`;
  md += `- mean **${mean.toFixed(1)}** · median **${median}** turns · min ${sorted[0] ?? 0} · max ${sorted[sorted.length - 1] ?? 0}\n`;
  md += `- length: ` + buckets.map(([lo, hi]) => `${lo}-${hi === 99 ? '+' : hi}: ${lengths.filter((x) => x >= lo && x <= hi).length}`).join(' · ') + `\n`;
  md += `- stalemate (hit turn cap): **${pct(stale / N)}**\n\n`;

  md += `## 4. Per-hero win-rate — N≈${Math.round(decisive * 4 / 19)}/hero, 95% CI (★ = significant outlier)\n`;
  md += `| Hero | games | win-rate [95% CI] | |\n|---|---:|---|---|\n`;
  const rows = Object.entries(hero)
    .map(([id, h]) => ({ name: heroName(id), ...h, w: wilson(h.wins, h.games) }))
    .sort((a, b) => b.w.p - a.w.p);
  for (const r of rows) {
    const sig = (r.w.lo > 0.5 || r.w.hi < 0.5) ? (r.w.p > 0.5 ? '★ strong' : '★ weak') : '';
    md += `| ${r.name} | ${r.games} | ${ciStr(r.wins, r.games)} | ${sig} |\n`;
  }
  md += `\n> Only **★** rows are statistically distinguishable from 50% at this N. ` +
    `If the skill ladder showed MCTS beating the heuristic, treat skill-dependent (caster) heroes' numbers as a lower bound — the bot underplays them.\n`;

  md += `\n## 5. Per-card — equipment build-rate & win-rate (95% CI)\n`;
  md += `How often each item gets built and the win-rate when it does — shows whether the build system (esp. Spirit gear) is being used and pays off.\n\n`;
  md += `| Item | built (games) | win-rate [95% CI] |\n|---|---:|---|\n`;
  const eqRows = Object.entries(equip)
    .map(([id, h]) => ({ name: heroName(id), ...h }))
    .sort((a, b) => b.games - a.games);
  for (const r of eqRows) md += `| ${r.name} | ${r.games} | ${ciStr(r.wins, r.games)} |\n`;
  if (eqRows.length === 0) md += `| _(no equipment built)_ | 0 | — |\n`;

  md += `\n_Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s._\n`;

  mkdirSync('sim-reports', { recursive: true });
  writeFileSync('sim-reports/evaluation.md', md);
  console.log('\n' + md);
  console.log('Wrote sim-reports/evaluation.md');
}

main().catch((e) => { console.error(e); process.exit(1); });
