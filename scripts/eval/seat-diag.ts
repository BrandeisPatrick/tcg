/**
 * Seat-advantage diagnostic. Runs heuristic-vs-heuristic games and tracks the
 * KO race to find WHY the first mover wins: who scores the first KO, KO counts
 * per seat, first-KO→win correlation, and the round the first KO lands. A KO
 * is read off the board: a hero whose respawn timer appears, or restarts
 * higher than it was (structures also fall to pushes into an empty lane, so
 * their drops are no KO count; a kill the Rejuvenator undoes leaves no timer
 * and is not counted here — the balance sim reads the engine's record). The pie rule: seat 1 moves first (read off
 * `G.firstMover`). No human seat: both seats are promoted on the spot, as in
 * the balance sim.
 *
 * Run:  npx vite-node scripts/eval/seat-diag.ts [games]
 */
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { setMatchConfig } from '@/storage/matchConfig';
import { heroesOf } from '@/engine/query';
import { MATCH_TURNS, firstMover, round } from '@/engine/rounds';
import type { GameState, PlayerID } from '@/engine/types';

const GAMES = Number(process.argv[2] ?? 300);
const TURN_CAP = MATCH_TURNS; // engine turns: the round cap ends every match by then
setMatchConfig({ heroPreferences: [null, null, null, null], humanSeat: null });

type Seat = PlayerID;
type R = {
  winner?: Seat;
  firstMover: Seat;
  firstScorer?: Seat;        // seat that landed the first KO
  firstKoRound?: number;
  kills: Record<Seat, number>; // KOs scored BY each seat
};

function playOne(): R {
  const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
  client.start();
  let st: any = client.getState();
  let guard = 0, movesThisTurn = 0, lastTurn = -1;
  const r: R = { firstMover: '1', kills: { '0': 0, '1': 0 } };
  const timers = new Map<string, number>();

  while (st && !st.ctx.gameover) {
    const G: GameState = st.G;
    const ctx = st.ctx;
    if (++guard > 50_000) break;

    if (G.draft) {
      const pool = G.draft.pool;
      if (!pool.length) break;
      const before = st._stateID;
      client.moves.draftPick(pool[Math.floor(Math.random() * pool.length)]);
      st = client.getState();
      if (st._stateID === before) break;
      r.firstMover = firstMover(st.G);
      continue;
    }
    if ((G.turnNumber ?? 0) > TURN_CAP) break;
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }

    const best = enumerateAIMoves(G, ctx)[0];
    const before = st._stateID;
    if (!best || best.move === 'endTurn' || movesThisTurn >= 40) client.moves.endTurn();
    else (client.moves as any)[best.move](...best.args);
    st = client.getState();
    movesThisTurn++;
    if (st._stateID === before && !st.ctx.gameover) client.moves.endTurn();

    // A fallen hero is a KO for the other seat.
    const G2: GameState = st.G;
    for (const seat of ['0', '1'] as Seat[]) {
      for (const h of heroesOf(G2.players[seat])) {
        const now = h.respawnTurnsLeft ?? 0;
        const was = timers.get(h.iid) ?? 0;
        if (now > 0 && (was === 0 || now > was)) {
          const scorer: Seat = seat === '0' ? '1' : '0';
          r.kills[scorer]++;
          if (!r.firstScorer) { r.firstScorer = scorer; r.firstKoRound = round(G2); }
        }
        timers.set(h.iid, now);
      }
    }
  }
  client.stop();
  const go = st?.ctx?.gameover;
  if (go?.winner === '0' || go?.winner === '1') r.winner = go.winner;
  return r;
}

const rs: R[] = [];
for (let i = 0; i < GAMES; i++) rs.push(playOne());
const dec = rs.filter((r) => r.winner);
const moverWins = dec.filter((r) => r.winner === r.firstMover).length;
const movers = [...new Set(rs.map((r) => r.firstMover))].sort().map((s) => `seat ${s}`).join(' or ');

const byMover = rs.filter((r) => r.firstScorer && r.firstScorer === r.firstMover);
const bySecond = rs.filter((r) => r.firstScorer && r.firstScorer !== r.firstMover);
const firstKoWins = rs.filter((r) => r.firstScorer && r.winner === r.firstScorer).length;
const firstKoGames = rs.filter((r) => r.firstScorer && r.winner).length;
const avg = (xs: number[]) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
const total = (seat: Seat) => rs.reduce((a, r) => a + r.kills[seat], 0);

console.log(`\n# Seat diagnostic — ${GAMES} games\n`);
console.log(`First mover (${movers}) win-rate: ${(100 * moverWins / (dec.length || 1)).toFixed(1)}%  (${dec.length} decisive)`);
console.log(`\nFirst KO scored by:  the first mover ${byMover.length}  ·  the second mover ${bySecond.length}  ·  none ${rs.length - byMover.length - bySecond.length}`);
console.log(`First-KO round (mean): the first mover ${avg(byMover.map((r) => r.firstKoRound!)).toFixed(1)}  ·  the second mover ${avg(bySecond.map((r) => r.firstKoRound!)).toFixed(1)}`);
console.log(`First-KO scorer → wins that game: ${(100 * firstKoWins / (firstKoGames || 1)).toFixed(1)}%`);
console.log(`\nTotal KOs scored:  seat 0 ${total('0')}  ·  seat 1 ${total('1')}`);
console.log(`Avg KOs/game:      seat 0 ${avg(rs.map((r) => r.kills['0'])).toFixed(2)}  ·  seat 1 ${avg(rs.map((r) => r.kills['1'])).toFixed(2)}`);
