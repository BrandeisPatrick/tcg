/**
 * Seeded replay trace — the proof that a change to the engine changed what it
 * meant to and nothing else.
 *
 * `record` plays N AI-vs-AI games through the real boardgame.io Client, with
 * Math.random pinned to a seeded mulberry32 per game (the draft, the deck
 * shuffles and the AI's draft jitter all draw from it), and writes one JSON line
 * per move: the move made and a hash of the state after it. Two engines that
 * play the same games move for move write identical files, so a refactor that
 * claims to change nothing must reproduce the previous trace byte for byte, and
 * a rule change must diverge only in the games it explains. `compare` says
 * which games diverge and at which move.
 *
 *   npx vite-node scripts/replay-trace.ts record [games=300] [out=sim-reports/trace.jsonl]
 *   npx vite-node scripts/replay-trace.ts compare before.jsonl after.jsonl [shown=8]
 *
 * Env: SEED (default 1). IGNORE — comma list of keys dropped from the hashed
 * state wherever they occur (default `seq`); name a new bookkeeping field there
 * when you add one, and say so. Instance ids are relabelled by order of first
 * appearance, so two engines that number their cards differently hash alike
 * when they hold the same cards in the same places; G.action's id is dropped.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [mode = 'record', ...rest] = process.argv.slice(2);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Line = { g: number; step?: number; move?: string; args?: unknown[]; forced?: boolean; end?: boolean; winner?: string | null; turns?: number; h: string };

async function record(games: number, out: string) {
  const SEED = Number(process.env.SEED ?? 1);
  const IGNORE = new Set((process.env.IGNORE ?? 'seq').split(',').filter(Boolean));
  const TURN_CAP = 40;
  const MOVES_PER_TURN_CAP = 40;

  // Pin before the engine modules load: setup and the decks read Math.random.
  let rand = mulberry32(SEED);
  Math.random = () => rand();
  const { Client } = await import('boardgame.io/client');
  const { DeadlockGame } = await import('@/engine/game');
  const { enumerateAIMoves } = await import('@/ai/heuristic');

  const IID_KEYS = new Set(['iid', 'attachedTo', 'sourceIid', 'targetIid']);
  let iidMap = new Map<string, string>();
  const canon = (v: string) => { let c = iidMap.get(v); if (!c) { c = `#${iidMap.size}`; iidMap.set(v, c); } return c; };
  const hashState = (G: any) => {
    const json = JSON.stringify({ ...G, action: G.action ? { ...G.action, id: undefined } : null }, (k, v) => {
      if (IGNORE.has(k)) return undefined;
      if (IID_KEYS.has(k) && typeof v === 'string') return canon(v);
      return v;
    });
    return createHash('sha1').update(json).digest('hex').slice(0, 16);
  };
  const canonArgs = (args: unknown[]) => args.map((a) => (typeof a === 'string' && iidMap.has(a) ? iidMap.get(a) : a));

  const lines: Line[] = [];
  let p0 = 0, p1 = 0, stale = 0, turns = 0;
  for (let g = 0; g < games; g++) {
    rand = mulberry32(SEED * 100_003 + g);
    iidMap = new Map();
    const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
    client.start();
    let st: any = client.getState();
    let guard = 0, movesThisTurn = 0, lastTurn = -1, step = 0;
    while (st && !st.ctx.gameover) {
      const G = st.G, ctx = st.ctx;
      if (++guard > 50_000) break;
      let move: string, args: any[];
      if (G.draft) {
        const pool = G.draft.pool;
        move = 'draftPick'; args = [pool[Math.floor(Math.random() * pool.length)]];
      } else {
        if ((G.turnNumber ?? 0) > TURN_CAP) break;
        if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }
        const best = enumerateAIMoves(G, ctx)[0];
        if (!best || best.move === 'endTurn' || movesThisTurn >= MOVES_PER_TURN_CAP) { move = 'endTurn'; args = []; }
        else { move = best.move; args = best.args; }
      }
      const before = st._stateID;
      (client.moves as any)[move](...args);
      st = client.getState();
      movesThisTurn++;
      // A move the engine refused changes nothing: end the turn so the game goes on.
      let forced = false;
      if (st._stateID === before && !st.ctx.gameover && move !== 'draftPick') {
        client.moves.endTurn();
        st = client.getState();
        forced = true;
      }
      const h = hashState(st.G);
      lines.push({ g, step: step++, move, args: canonArgs(args), forced, h });
    }
    const w = st.ctx.gameover?.winner;
    if (w === '0') p0++; else if (w === '1') p1++; else stale++;
    turns += st.G.turnNumber ?? 0;
    lines.push({ g, end: true, winner: w ?? null, turns: st.G.turnNumber, h: hashState(st.G) });
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  console.log(`${games} games: P0 ${p0}, P1 ${p1}, stalemate ${stale}, mean length ${(turns / games).toFixed(2)} turns; ${lines.length} lines → ${out}`);
}

function compare(a: string, b: string, shown: number) {
  const games = (path: string) => {
    const out = new Map<number, Line[]>();
    for (const l of readFileSync(path, 'utf8').split('\n')) {
      if (!l) continue;
      const x: Line = JSON.parse(l);
      (out.get(x.g) ?? out.set(x.g, []).get(x.g)!).push(x);
    }
    return out;
  };
  const before = games(a), after = games(b);
  const diverged: { g: number; at: number; was?: Line }[] = [];
  for (const [g, la] of before) {
    const lb = after.get(g) ?? [];
    let at = la.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(lb[i]));
    if (at < 0 && la.length !== lb.length) at = Math.min(la.length, lb.length);
    if (at >= 0) diverged.push({ g, at, was: la[at] });
  }
  console.log(`games diverging: ${diverged.length} of ${before.size}`);
  for (const d of diverged.slice(0, shown)) {
    console.log(`  game ${d.g}: first at line ${d.at}${d.was?.move ? ` — ${d.was.move}(${JSON.stringify(d.was.args)})` : ''}`);
  }
  process.exitCode = diverged.length ? 1 : 0;
}

if (mode === 'record') await record(Number(rest[0] ?? 300), rest[1] ?? 'sim-reports/trace.jsonl');
else if (mode === 'compare') compare(rest[0], rest[1], Number(rest[2] ?? 8));
else { console.error(`unknown mode ${mode}: record | compare`); process.exitCode = 2; }
