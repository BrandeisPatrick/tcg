/**
 * New AI against the previous AI: the proof that a change to how the AI values
 * a position plays better, not merely differently.
 *
 * Plays N seeded games through the real boardgame.io Client with random drafts.
 * One seat is driven by the current `enumerateAIMoves` (src/ai/heuristic.ts),
 * the other by a frozen copy of the heuristic from before the change. Seats
 * alternate every game, and in pairs: games 2k and 2k+1 share a seed (so the
 * same drafts and the same market) with the two AIs swapped, so the luck of the
 * draft and the first-player edge cancel inside every pair. Math.random is
 * pinned to a seeded mulberry32 per game, as in scripts/replay-trace.ts (the
 * match seed, which draws the market, and the draft both come from it), so a
 * run is reproducible: the same SEED and the same two heuristics play the same
 * games. No human seat: the engine promotes a fallen Active on both sides by
 * one rule.
 *
 * The frozen copy is scratch, never committed. Recreate it from the commit
 * before your change, and delete it again before you commit:
 *
 *   git show HEAD:src/ai/heuristic.ts > scripts/eval/_old-heuristic.ts
 *
 * It runs against the working tree's engine, not its own commit's, so the
 * baseline must come from a commit whose AI plays this engine's moves (the
 * shop, from step 2 of the redesign on). A copy that is missing, does not load,
 * throws, or names a move this engine lacks stops the run with a message
 * saying so (exit code 2).
 *
 *   npx vite-node scripts/eval/ai-vs-ai.ts [games=1000] [turnCap=40]
 *
 * Env: SEED (default 1) picks another set of games. Reports the new AI's
 * win-rate over the decisive games with a 95% Wilson interval; a stalemate (the
 * turn cap, in engine turns) counts for neither side and is reported on its own.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mulberry32, wilson } from './stats';

const GAMES = Number(process.argv[2] ?? 1000);
const TURN_CAP = Number(process.argv[3] ?? 40);
const SEED = Number(process.env.SEED ?? 1);
const MOVES_PER_TURN_CAP = 40;
/** The frozen baseline, imported by path so the script type-checks without it. */
const OLD_AI = fileURLToPath(new URL('./_old-heuristic.ts', import.meta.url));

/** Stop the run: the baseline cannot play this engine. */
function fail(why: string): never {
  console.error(`${why}\nRecreate scripts/eval/_old-heuristic.ts from a commit whose AI plays this engine's moves (the shop arrived with step 2 of the redesign):\n  git show <commit>:src/ai/heuristic.ts > scripts/eval/_old-heuristic.ts`);
  process.exit(2);
}

// Pin before the engine modules load, as every driver does.
let rand = mulberry32(SEED);
Math.random = () => rand();
const { Client } = await import('boardgame.io/client');
const { DeadlockGame } = await import('@/engine/game');
const { enumerateAIMoves: newAI } = await import('@/ai/heuristic');
const { setMatchConfig } = await import('@/storage/matchConfig');
if (!existsSync(OLD_AI)) fail('scripts/eval/_old-heuristic.ts is missing.');
let oldAI: typeof newAI;
try {
  ({ enumerateAIMoves: oldAI } = await import(/* @vite-ignore */ OLD_AI));
} catch (e) {
  fail(`scripts/eval/_old-heuristic.ts does not load: ${(e as Error).message}`);
}
if (typeof oldAI !== 'function') fail('scripts/eval/_old-heuristic.ts exports no enumerateAIMoves.');
setMatchConfig({ heroPreferences: [null, null, null, null], humanSeat: null });

type Seat = '0' | '1';
interface Result { winner?: Seat; length: number }

/** One game. `newSeat` is the seat the current AI plays; the other seat plays the old one. */
function playOne(newSeat: Seat): Result {
  const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
  client.start();
  let st: any = client.getState();
  let guard = 0, movesThisTurn = 0, lastTurn = -1;
  while (st && !st.ctx.gameover) {
    const G = st.G, ctx = st.ctx;
    if (++guard > 50_000) break;
    let move: string, args: any[];
    if (G.draft) {
      // Random drafts for both seats: the heroes are the luck, the play is the skill.
      const pool = G.draft.pool;
      move = 'draftPick'; args = [pool[Math.floor(Math.random() * pool.length)]];
    } else {
      if ((G.turnNumber ?? 0) > TURN_CAP) break;
      if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }
      const isNew = ctx.currentPlayer === newSeat;
      let best;
      try {
        best = (isNew ? newAI : oldAI)(G, ctx)[0];
      } catch (e) {
        if (isNew) throw e;
        fail(`The old AI threw against this engine: ${(e as Error).message}`);
      }
      if (!best || best.move === 'endTurn' || movesThisTurn >= MOVES_PER_TURN_CAP) { move = 'endTurn'; args = []; }
      else { move = best.move; args = best.args; }
      if (typeof (client.moves as any)[move] !== 'function') {
        const what = typeof move === 'string' ? `a move this engine does not have: ${move}` : `no move for one of this engine's actions (step ${G.step})`;
        fail(`The ${isNew ? 'current' : 'old'} AI chose ${what}.`);
      }
    }
    const before = st._stateID;
    (client.moves as any)[move](...args);
    st = client.getState();
    movesThisTurn++;
    // A move the engine refused changes nothing: end the turn so the game goes on.
    if (st._stateID === before && !st.ctx.gameover && move !== 'draftPick') {
      client.moves.endTurn();
      st = client.getState();
    }
  }
  client.stop();
  const w = st.ctx.gameover?.winner;
  return { winner: w === '0' || w === '1' ? w : undefined, length: st.G.turnNumber ?? 0 };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const t0 = Date.now();
let newWins = 0, oldWins = 0, stale = 0, turns = 0;
const bySeat = { '0': { games: 0, wins: 0 }, '1': { games: 0, wins: 0 } };

for (let i = 0; i < GAMES; i++) {
  if (i % 2 === 0) rand = mulberry32(SEED * 100_003 + i / 2);
  else rand = mulberry32(SEED * 100_003 + (i - 1) / 2); // the same seed, the seats swapped
  const newSeat: Seat = i % 2 === 0 ? '0' : '1';
  const r = playOne(newSeat);
  bySeat[newSeat].games++;
  turns += r.length;
  if (!r.winner) stale++;
  else if (r.winner === newSeat) { newWins++; bySeat[newSeat].wins++; }
  else oldWins++;
  if ((i + 1) % 100 === 0) process.stderr.write(`  …${i + 1}/${GAMES}\n`);
}

const decisive = newWins + oldWins;
const { p, lo, hi } = wilson(newWins, decisive);
console.log(`# AI vs AI: current heuristic against the previous one, ${GAMES} games (${Math.ceil(GAMES / 2)} seeds x both seats), turn cap ${TURN_CAP}, SEED ${SEED}`);
console.log(`new AI ${newWins} wins · old AI ${oldWins} wins · stalemate ${stale} · mean length ${(turns / GAMES).toFixed(1)} engine turns · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`new AI as seat 0 (drafts first, moves second): ${bySeat['0'].wins}/${bySeat['0'].games} · as seat 1 (moves first): ${bySeat['1'].wins}/${bySeat['1'].games}`);
console.log(`new AI win-rate: ${pct(p)} [${pct(lo)} to ${pct(hi)}] (95% Wilson, n = ${decisive} decisive games)`);
const better = p >= 0.52 && lo > 0.5;
console.log(better
  ? 'verdict: the new AI is better (win-rate at least 52% and the interval above 50%)'
  : 'verdict: NOT shown to be better (needs a win-rate of at least 52% with the interval above 50%)');
