/**
 * Per-item win rates: heuristic v heuristic, random drafts. An item counts
 * once per game for each side that bought it (an upgrade counts for the item
 * it became; its component, bought before, for itself); a starred row is
 * outside 50% at 95% confidence. Buying needs souls and souls come from kills,
 * so an item bought late, mostly by the side ahead, reads high. Actives also
 * show how often they were used.
 *
 *   npx vite-node scripts/eval/card-winrates.ts [N=400]
 */
import { runBatch, wilson } from './framework';
import { itemCard } from '@/cards';
const N = Number(process.argv[2] ?? 400);
const res = await runBatch({ games: N, masterSeed: 7007, agents: { '0': 'heuristic', '1': 'heuristic' }, turnCap: 40 });
const stat: Record<string, { g: number; w: number; uses: number }> = {};
const lens: number[] = []; let stale = 0;
for (const r of res) {
  if (r.stalemate) stale++; else lens.push(r.ownTurns);
  for (const s of ['0', '1'] as const) {
    const won = !r.stalemate && r.winner === s;
    for (const id of new Set(r.buys[s])) { (stat[id] ??= { g: 0, w: 0, uses: 0 }).g++; if (won) stat[id].w++; }
    for (const id of r.actives[s]) (stat[id] ??= { g: 0, w: 0, uses: 0 }).uses++;
  }
}
lens.sort((a, b) => a - b);
console.log(`games ${N} stale ${stale} meanLen ${(lens.reduce((a, b) => a + b, 0) / (lens.length || 1)).toFixed(1)} own turns, median ${lens[lens.length >> 1] ?? 0}`);
const rows = Object.entries(stat).map(([id, s]) => ({ id, ...s, ...wilson(s.w, s.g) })).sort((a, b) => a.p - b.p);
for (const r of rows) {
  const item = itemCard(r.id);
  const kind = item ? `${item.type === 'spell' ? 'active' : 'passive'} ${item.slot} T${item.tier}` : '?';
  const used = item?.type === 'spell' ? `  used ${String(r.uses).padStart(4)}` : '';
  console.log(`${kind.padEnd(19)} ${r.id.padEnd(24)} bought ${String(r.g).padStart(4)}  win ${(r.p * 100).toFixed(0).padStart(3)}% [${(r.lo * 100).toFixed(0)}–${(r.hi * 100).toFixed(0)}]${r.lo > 0.5 || r.hi < 0.5 ? ' *' : '  '}${used}`);
}
