/**
 * Per-card win rates: heuristic v heuristic, random drafts. Each spell or item
 * counts once per game for the side that played it; a starred row is outside
 * 50% at 95% confidence. A card played mostly while behind reads low.
 *
 *   npx vite-node scripts/eval/card-winrates.ts [N=400]
 */
import { runBatch, wilson } from './framework';
import { CARDS_BY_ID } from '@/cards';
const N = Number(process.argv[2] ?? 400);
const res = await runBatch({ games: N, masterSeed: 7007, agents: { '0': 'heuristic', '1': 'heuristic' }, turnCap: 40 });
const stat: Record<string, { g: number; w: number }> = {};
const lens: number[] = []; let stale = 0;
for (const r of res) {
  if (r.stalemate) stale++; else lens.push(r.length);
  for (const s of ['0', '1'] as const) {
    const won = !r.stalemate && r.winner === s;
    for (const id of new Set([...r.equips[s], ...r.spells[s]])) { (stat[id] ??= { g: 0, w: 0 }).g++; if (won) stat[id].w++; }
  }
}
lens.sort((a, b) => a - b);
console.log(`games ${N} stale ${stale} meanLen ${(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1)} median ${lens[lens.length >> 1]}`);
const rows = Object.entries(stat).map(([id, s]) => ({ id, ...s, ...wilson(s.w, s.g) })).sort((a, b) => a.p - b.p);
for (const r of rows) console.log(`${(CARDS_BY_ID[r.id]?.type ?? '?').padEnd(9)} ${r.id.padEnd(24)} used ${String(r.g).padStart(4)}  win ${(r.p * 100).toFixed(0).padStart(3)}% [${(r.lo * 100).toFixed(0)}–${(r.hi * 100).toFixed(0)}]${r.lo > 0.5 || r.hi < 0.5 ? ' *' : ''}`);
