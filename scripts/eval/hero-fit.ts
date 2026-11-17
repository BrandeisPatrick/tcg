// Reads hero-wr.ts output and prints each hero's raw win rate and team-fit rating.
//   npx vite-node scripts/eval/hero-fit.ts out*.jsonl
import { readFileSync } from 'node:fs';
import { fitTeams } from './stats';
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l))).filter((r) => !r.err);
const dec = rows.filter((r) => r.w === '0' || r.w === '1');
const tally: Record<string, { n: number; w: number }> = {};
for (const r of dec) for (const s of ['0', '1']) for (const h of r['s' + s]) { const t = (tally[h] ??= { n: 0, w: 0 }); t.n++; if (r.w === s) t.w++; }
const fit = fitTeams(dec.map((r) => ({ side0: r.s0, side1: r.s1, side0Won: r.w === '0' })));
const fm = dec.filter((r) => r.w === r.fm).length / dec.length;
const len = rows.reduce((a, r) => a + r.turns, 0) / rows.length;
console.log(`games ${rows.length}, decided ${dec.length}, first mover wins ${(100 * fm).toFixed(1)}%, mean engine turns ${len.toFixed(1)}`);
for (const m of fit.members) { const t = tally[m.id]; const p = 1 / (1 + Math.exp(-m.coef)); console.log(`${m.id.replace('hero_', '').padEnd(11)} fit ${(100 * p).toFixed(1)}% ±${(100 * m.se / 4).toFixed(1)}  raw ${(100 * t.w / t.n).toFixed(1)}% n${t.n}`); }
