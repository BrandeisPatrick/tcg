/**
 * Fair-evaluation report runner.
 *
 *   npx vite-node scripts/eval/run.ts smoke      # quick API/speed check
 *   npx vite-node scripts/eval/run.ts full [N]   # full battery (default N=1000)
 *
 * Produces: a skill ladder (random→heuristic→MCTS) to gauge whether the game
 * rewards skill and whether the heuristic is trustworthy; seat-fairness with a
 * confidence interval; pacing in own turns; per-hero win-rates with Wilson CIs
 * (only statistically-significant outliers are starred); and the shop: items
 * by purchase, actives by use, purchases, sells and souls banked per player.
 * Every agent shops by the heuristic's rule (the hero's build), so the ladder
 * measures play, not shopping.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { itemCard } from '@/cards';
import { MATCH_TURNS } from '@/engine/rounds';
import { runBatch, runGame, wilson, heroName, type GameResult, type AgentKind } from './framework';

const MODE = (process.argv[2] ?? 'full') as 'smoke' | 'full';
const N = Number(process.argv[3] ?? (MODE === 'smoke' ? 6 : 1000));
const TURN_CAP = MATCH_TURNS; // engine turns: the round cap ends every match by then
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
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const itemLabel = (id: string) => {
  const it = itemCard(id);
  return it ? `${it.slot} T${it.tier}` : '?';
};

/** Seat-balanced duel: A and B each play P0 half the time. Returns A's record,
 *  and how often the first mover won (whoever played it). */
async function duel(a: AgentKind, b: AgentKind, games: number, seed: number, mctsIter?: number) {
  let aWins = 0, bWins = 0, stale = 0, firstMoverWins = 0;
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1;
    const agents = swap ? { '0': b, '1': a } : { '0': a, '1': b };
    const r = await runGame({ seed: (seed + i * 40503) >>> 0, agents, turnCap: TURN_CAP, mctsIterations: mctsIter });
    if (r.stalemate) { stale++; continue; }
    if (r.winner === r.firstMover) firstMoverWins++;
    const aSeat = swap ? '1' : '0';
    if (r.winner === aSeat) aWins++; else bWins++;
  }
  return { aWins, bWins, stale, n: aWins + bWins, firstMoverWins };
}

type Tally = { games: number; wins: number };
const bump = (t: Record<string, Tally>, id: string, won: boolean) => {
  (t[id] ??= { games: 0, wins: 0 }).games++;
  if (won) t[id].wins++;
};
const star = (w: { p: number; lo: number; hi: number }) => (w.lo > 0.5 || w.hi < 0.5) ? (w.p > 0.5 ? '★ strong' : '★ weak') : '';

async function main() {
  const t0 = Date.now();
  let md = `# Fair Evaluation — Deadlock TCG\n\n`;
  md += `_${MODE} run · ${new Date().toISOString().slice(0, 16)} · turn cap ${TURN_CAP} engine turns (${TURN_CAP / 2} own turns each)._\n\n`;

  // ---- 1. Skill ladder -------------------------------------------------------
  console.log('Skill ladder…');
  const rr = await duel('random', 'random', LADDER_GAMES, 1001);       // pure seat (zero skill)
  const hr = await duel('heuristic', 'random', LADDER_GAMES, 2002);    // does heuristic beat random?
  console.log(`  MCTS vs heuristic (${MCTS_GAMES} games, iter ${MCTS_ITER}) — slow…`);
  const mh = await duel('mcts', 'heuristic', MCTS_GAMES, 3003, MCTS_ITER);

  md += `## 1. Skill ladder — does the game reward skill? is the heuristic trustworthy?\n`;
  md += `Seat-balanced (each agent plays P0 half the time). Win-rate of the first-named agent, 95% CI; for random vs random, the first mover's (both seats play alike). Every agent shops by the heuristic's rule.\n\n`;
  md += `| Matchup | win-rate | reads as |\n|---|---|---|\n`;
  md += `| random vs random (the first mover) | ${ciStr(rr.firstMoverWins, rr.n)} | pure **seat** advantage at zero skill |\n`;
  md += `| heuristic vs random | ${ciStr(hr.aWins, hr.n)} | does the heuristic beat coin-flip play? |\n`;
  md += `| MCTS vs heuristic | ${ciStr(mh.aWins, mh.n)} | is there headroom above the heuristic? (N=${mh.n}) |\n\n`;
  const heurBeatsRandom = wilson(hr.aWins, hr.n).lo > 0.5;
  const mctsBeatsHeur = wilson(mh.aWins, mh.n).lo > 0.5;
  md += `**Interpretation:** ` +
    `${heurBeatsRandom ? 'heuristic clearly beats random (game rewards basic skill). ' : '⚠ heuristic does NOT clearly beat random — either the game is near-coinflip or the heuristic is poor. '}` +
    `${mctsBeatsHeur ? '⚠ MCTS beats the heuristic — the heuristic is leaving skill on the table, so **per-hero numbers from the heuristic are not yet trustworthy** for skill-dependent heroes.' : 'MCTS does not clearly beat the heuristic at this iteration budget — heuristic is a reasonable proxy (or MCTS needs more iterations).'}\n\n`;

  // ---- 2 … 7. heuristic v heuristic battery --------------------------------
  console.log(`Main battery: heuristic v heuristic × ${N}…`);
  const res: GameResult[] = await runBatch({
    games: N, masterSeed: 7007, agents: { '0': 'heuristic', '1': 'heuristic' }, turnCap: TURN_CAP,
    onProgress: (i) => { if (i % 200 === 0) console.log(`  …${i}/${N}`); },
  });

  let moverWins = 0, stale = 0;
  const movers = new Set(res.map((r) => r.firstMover));
  const lengths: number[] = [];
  const hero: Record<string, Tally> = {};
  const item: Record<string, Tally> = {};
  const active: Record<string, Tally> = {};
  const uses: Record<string, number> = {};
  for (const r of res) {
    if (r.stalemate) { stale++; }
    else { if (r.winner === r.firstMover) moverWins++; lengths.push(r.ownTurns); }
    for (const side of ['0', '1'] as const) {
      const won = !r.stalemate && r.winner === side;
      for (const id of r.heroes[side]) bump(hero, id, won);
      // dedupe per side per game → "bought at least once this game"
      for (const id of new Set(r.buys[side])) bump(item, id, won);
      for (const id of new Set(r.actives[side])) bump(active, id, won);
      for (const id of r.actives[side]) uses[id] = (uses[id] ?? 0) + 1;
    }
  }
  const decisive = N - stale;

  md += `## 2. Seat fairness — heuristic v heuristic, random drafts, N=${N}\n`;
  md += `- The first mover's (${[...movers].sort().map((s) => `seat ${s}`).join(' or ')}) win-rate: **${ciStr(moverWins, decisive)}**${offFifty(moverWins, decisive) ? ' — ✗ significantly ≠ 50%' : ' — within noise of 50%'}\n`;
  md += `- (random-vs-random seat figure above is the zero-skill control)\n\n`;

  const sorted = [...lengths].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const buckets: [number, number][] = [[1, 4], [5, 6], [7, 8], [9, 10], [11, 99]];
  md += `## 3. Pacing (own turns: one player's turns; a game's length is the rounds the first mover began)\n`;
  md += `- mean **${mean(lengths).toFixed(1)}** · median **${median}** own turns · min ${sorted[0] ?? 0} · max ${sorted[sorted.length - 1] ?? 0}\n`;
  md += `- length: ` + buckets.map(([lo, hi]) => `${lo}-${hi === 99 ? '+' : hi}: ${lengths.filter((x) => x >= lo && x <= hi).length}`).join(' · ') + `\n`;
  md += `- stalemate (hit turn cap): **${pct(stale / N)}**\n\n`;

  md += `## 4. Per-hero win-rate — N≈${Math.round(decisive * 8 / 19)}/hero (eight of the 19 heroes play each game), 95% CI (★ = significant outlier)\n`;
  md += `| Hero | games | win-rate [95% CI] | |\n|---|---:|---|---|\n`;
  const rows = Object.entries(hero)
    .map(([id, h]) => ({ name: heroName(id), ...h, w: wilson(h.wins, h.games) }))
    .sort((a, b) => b.w.p - a.w.p);
  for (const r of rows) md += `| ${r.name} | ${r.games} | ${ciStr(r.wins, r.games)} | ${star(r.w)} |\n`;
  md += `\n> Only **★** rows are statistically distinguishable from 50% at this N. ` +
    `If the skill ladder showed MCTS beating the heuristic, treat skill-dependent (caster) heroes' numbers as a lower bound — the bot underplays them.\n`;

  md += `\n## 5. Per-item — purchase rate & win-rate (95% CI)\n`;
  md += `How often each item is bought (games in which a side bought it at least once; an upgrade counts for the item it became) and the win-rate when it is. Buying needs souls and souls come from kills, so an item bought late reads high.\n\n`;
  md += `| Item | tab, tier | bought (side-games) | win-rate [95% CI] |\n|---|---|---:|---|\n`;
  const itemRows = Object.entries(item)
    .map(([id, h]) => ({ id, name: heroName(id), ...h }))
    .sort((a, b) => b.games - a.games);
  for (const r of itemRows) md += `| ${r.name} | ${itemLabel(r.id)} | ${r.games} | ${ciStr(r.wins, r.games)} |\n`;
  if (itemRows.length === 0) md += `| _(nothing bought)_ | | 0 | — |\n`;

  md += `\n## 6. Active items — use rate & win-rate (95% CI)\n`;
  md += `How often each active item is used (side-games with at least one use, and uses in all) and the win-rate when it is.\n\n`;
  md += `| Active | tab, tier | used (side-games) | uses | win-rate [95% CI] |\n|---|---|---:|---:|---|\n`;
  const activeRows = Object.entries(active)
    .map(([id, h]) => ({ id, name: heroName(id), ...h, uses: uses[id] ?? 0 }))
    .sort((a, b) => b.games - a.games);
  for (const r of activeRows) md += `| ${r.name} | ${itemLabel(r.id)} | ${r.games} | ${r.uses} | ${ciStr(r.wins, r.games)} |\n`;
  if (activeRows.length === 0) md += `| _(no active used)_ | | 0 | 0 | — |\n`;

  const players = res.flatMap((r) => (['0', '1'] as const).map((s) => ({ r, s })));
  md += `\n## 7. The shop — per player per game\n`;
  md += `- Purchases: **${mean(players.map(({ r, s }) => r.buys[s].length)).toFixed(2)}**; items worn at the end: ${mean(players.map(({ r, s }) => r.worn[s].length)).toFixed(2)}.\n`;
  md += `- Souls banked at the end: **${mean(players.map(({ r, s }) => r.souls[s])).toFixed(1)}**.\n`;
  md += `- Actives used: **${mean(players.map(({ r, s }) => r.actives[s].length)).toFixed(2)}**; sells: ${players.reduce((n, { r, s }) => n + r.sells[s], 0)} in all.\n`;

  md += `\n_Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s._\n`;

  mkdirSync('sim-reports', { recursive: true });
  writeFileSync('sim-reports/evaluation.md', md);
  console.log('\n' + md);
  console.log('Wrote sim-reports/evaluation.md');
}

main().catch((e) => { console.error(e); process.exit(1); });
