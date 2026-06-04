/**
 * Headless AI-vs-AI balance simulator.
 *
 * Drives the real boardgame.io engine (so souls/draw/combat/endIf all run) with
 * the heuristic AI in BOTH seats, using RANDOM drafts so every hero is sampled
 * evenly. Aggregates the metrics that reveal imbalance (first-player win-rate,
 * per-hero win-rate, game-length distribution, stalemate rate) and writes a
 * report.
 *
 * Run:  npx vite-node scripts/balance-sim.ts [games] [turnCap]
 *   e.g. npx vite-node scripts/balance-sim.ts 300
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { CARDS_BY_ID } from '@/cards';
import type { GameState, PlayerState } from '@/engine/types';

const GAMES = Number(process.argv[2] ?? 300);
const TURN_CAP = Number(process.argv[3] ?? 40); // real match turns; over this = stalemate
const MOVES_PER_TURN_CAP = 40;                  // safety against a stuck turn

type GameResult = {
  winner: '0' | '1' | undefined;   // undefined = stalemate/draw
  stalemate: boolean;
  length: number;                  // real match turns (G.turnNumber)
  heroes: { '0': string[]; '1': string[] };
};

function boardHeroes(ps: PlayerState): string[] {
  return [ps.active, ...ps.bench]
    .filter((c): c is NonNullable<typeof c> => !!c && CARDS_BY_ID[c.cardId]?.type === 'hero')
    .map((c) => c.cardId);
}

function playOneGame(): GameResult {
  const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
  client.start();
  let st: any = client.getState();
  let guard = 0;
  let movesThisTurn = 0;
  let lastTurn = -1;

  while (st && !st.ctx.gameover) {
    const G: GameState = st.G;
    const ctx = st.ctx;
    if (++guard > 50_000) break;

    // ---- Draft phase: pick a random hero from the pool (even sampling) ----
    if (G.draft) {
      const pool = G.draft.pool;
      if (pool.length === 0) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const before = st._stateID;
      client.moves.draftPick(pick);
      st = client.getState();
      if (st._stateID === before) break; // stuck
      continue;
    }

    // ---- Match phase ----
    if ((G.turnNumber ?? 0) > TURN_CAP) break; // stalemate
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }

    const opts = enumerateAIMoves(G, ctx);
    const best = opts[0];
    const before = st._stateID;

    if (!best || best.move === 'endTurn' || movesThisTurn >= MOVES_PER_TURN_CAP) {
      client.moves.endTurn();
    } else {
      (client.moves as any)[best.move](...best.args);
    }
    st = client.getState();
    movesThisTurn++;

    // Move was rejected (no state change) and it wasn't an end-turn → force end-turn.
    if (st._stateID === before && !st.ctx.gameover) {
      client.moves.endTurn();
      st = client.getState();
    }
  }

  const G: GameState = st.G;
  const over = st.ctx.gameover;
  return {
    winner: over?.winner,
    stalemate: !over,
    length: G.turnNumber ?? 0,
    heroes: { '0': boardHeroes(G.players['0']), '1': boardHeroes(G.players['1']) },
  };
}

// ---------------------------------------------------------------- run + aggregate
console.log(`Simulating ${GAMES} AI-vs-AI games (turn cap ${TURN_CAP})…`);
const t0 = Date.now();

let p0 = 0, p1 = 0, stale = 0;
const lengths: number[] = [];
const hero: Record<string, { games: number; wins: number }> = {};

function bump(id: string, won: boolean) {
  (hero[id] ??= { games: 0, wins: 0 }).games++;
  if (won) hero[id].wins++;
}

for (let i = 0; i < GAMES; i++) {
  const r = playOneGame();
  if (r.stalemate) stale++;
  else if (r.winner === '0') p0++;
  else if (r.winner === '1') p1++;
  if (!r.stalemate) lengths.push(r.length);
  for (const side of ['0', '1'] as const) {
    const won = !r.stalemate && r.winner === side;
    for (const id of r.heroes[side]) bump(id, won);
  }
  if ((i + 1) % 50 === 0) process.stdout.write(`  …${i + 1}/${GAMES}\n`);
}

const decisive = p0 + p1;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const histo = (a: number[], buckets: [number, number][]) =>
  buckets.map(([lo, hi]) => [lo, hi, a.filter((x) => x >= lo && x <= hi).length] as const);

const heroRows = Object.entries(hero)
  .map(([id, h]) => ({
    name: CARDS_BY_ID[id]?.name ?? id,
    games: h.games,
    wr: h.games ? h.wins / h.games : 0,
  }))
  .sort((a, b) => b.wr - a.wr);

const fpWR = decisive ? p0 / decisive : 0;
const flag = (wr: number) => (wr >= 0.55 ? ' ⚠ strong' : wr <= 0.45 ? ' ⚠ weak' : '');

let md = '';
md += `# Balance sim — ${GAMES} games\n\n`;
md += `_Random drafts, heuristic AI both seats, turn cap ${TURN_CAP}. ${((Date.now() - t0) / 1000).toFixed(1)}s._\n\n`;
md += `## Outcomes\n`;
md += `- First-player (P0) win-rate: **${(fpWR * 100).toFixed(1)}%** (of ${decisive} decisive games) — fair ≈ 50%\n`;
md += `- P0 ${p0} · P1 ${p1} · stalemate ${stale} (**${((stale / GAMES) * 100).toFixed(1)}%** hit turn cap)\n\n`;
md += `## Game length (real turns, decisive games)\n`;
md += `- mean **${mean(lengths).toFixed(1)}** · median **${median(lengths)}** · min ${lengths.length ? Math.min(...lengths) : 0} · max ${lengths.length ? Math.max(...lengths) : 0}\n`;
md += `- distribution: ` + histo(lengths, [[1, 3], [4, 6], [7, 9], [10, 12], [13, 99]])
  .map(([lo, hi, n]) => `${lo}-${hi === 99 ? '+' : hi}: ${n}`).join(' · ') + `\n\n`;
md += `## Per-hero win-rate (random-draft appearances)\n`;
md += `| Hero | games | win-rate | |\n|---|---:|---:|---|\n`;
for (const r of heroRows) {
  md += `| ${r.name} | ${r.games} | ${(r.wr * 100).toFixed(1)}% |${flag(r.wr)} |\n`;
}
md += `\n_Phase-curve target (docs/balance-model.md): early survive, snowball ~turn 8+. Watch mean length + stalemate rate._\n`;

mkdirSync('sim-reports', { recursive: true });
writeFileSync('sim-reports/latest.md', md);

console.log('\n' + md);
console.log(`\nWrote sim-reports/latest.md`);
