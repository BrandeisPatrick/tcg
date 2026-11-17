// Hero win-rate check: N heuristic-vs-heuristic games through the fuzz driver, one JSON line per game.
//   npx vite-node scripts/eval/hero-wr.ts <fromSeed> <toSeed> > out.jsonl
import { playGame } from '../../tests/engine/fuzz/driver';
const from = Number(process.argv[2] ?? 1), to = Number(process.argv[3] ?? 10);
for (let seed = from; seed <= to; seed++) {
  try {
    const g = playGame({ seed, policies: { '0': 'heuristic', '1': 'heuristic' }, chaosRate: 0 });
    const side: Record<string, string[]> = { '0': [], '1': [] };
    for (const m of g.moves) if (m.name === 'draftPick' && typeof m.args[0] === 'string') side[m.player].push(m.args[0] as string);
    const fm = (g.final.G as any).firstMover;
    console.log(JSON.stringify({ seed, s0: side['0'], s1: side['1'], w: g.winner ?? null, stale: g.stalemate, turns: g.turns, fm }));
  } catch (e) { console.log(JSON.stringify({ seed, err: String(e).slice(0, 120) })); }
}
