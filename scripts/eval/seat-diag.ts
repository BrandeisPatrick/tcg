/**
 * Seat-advantage diagnostic. Runs heuristic-vs-heuristic games and tracks the
 * KO race to find WHY P0 wins: who scores the first KO, KO counts per seat,
 * first-KO→win correlation, and the turn the first KO lands.
 *
 * Run:  npx vite-node scripts/eval/seat-diag.ts [games]
 */
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import type { GameState } from '@/engine/types';

const GAMES = Number(process.argv[2] ?? 300);
const TURN_CAP = 40;

type R = {
  winner?: '0' | '1';
  firstScorer?: '0' | '1';   // seat that landed the first KO
  firstKoTurn?: number;
  kills0: number;            // KOs scored BY P0 (= P1 patron drops)
  kills1: number;
};

function playOne(): R {
  const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
  client.start();
  let st: any = client.getState();
  let guard = 0, movesThisTurn = 0, lastTurn = -1;
  let hp0 = 8, hp1 = 8;            // patron HP trackers (PATRON_HP = 8)
  const r: R = { kills0: 0, kills1: 0 };

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

    // Detect KOs via patron-HP drops. P0's patron dropping = P1 scored a KO.
    const G2: GameState = st.G;
    const n0 = G2.players['0'].hp, n1 = G2.players['1'].hp;
    if (n1 < hp1) { // P1 patron dropped → P0 killed a hero
      r.kills0 += hp1 - n1;
      if (!r.firstScorer) { r.firstScorer = '0'; r.firstKoTurn = G2.turnNumber; }
    }
    if (n0 < hp0) {
      r.kills1 += hp0 - n0;
      if (!r.firstScorer) { r.firstScorer = '1'; r.firstKoTurn = G2.turnNumber; }
    }
    hp0 = n0; hp1 = n1;
  }
  const go = st?.ctx?.gameover;
  if (go?.winner === '0' || go?.winner === '1') r.winner = go.winner;
  return r;
}

const rs: R[] = [];
for (let i = 0; i < GAMES; i++) rs.push(playOne());
const dec = rs.filter((r) => r.winner);
const p0win = dec.filter((r) => r.winner === '0').length;

const firstScored0 = rs.filter((r) => r.firstScorer === '0');
const firstScored1 = rs.filter((r) => r.firstScorer === '1');
const firstKoWins = rs.filter((r) => r.firstScorer && r.winner === r.firstScorer).length;
const firstKoGames = rs.filter((r) => r.firstScorer && r.winner).length;
const avg = (xs: number[]) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

console.log(`\n# Seat diagnostic — ${GAMES} games\n`);
console.log(`P0 win-rate: ${(100 * p0win / dec.length).toFixed(1)}%  (${dec.length} decisive)`);
console.log(`\nFirst KO scored by:  P0 ${firstScored0.length}  ·  P1 ${firstScored1.length}  ·  none ${rs.length - firstScored0.length - firstScored1.length}`);
console.log(`First-KO turn (mean): P0 ${avg(firstScored0.map(r=>r.firstKoTurn!)).toFixed(1)}  ·  P1 ${avg(firstScored1.map(r=>r.firstKoTurn!)).toFixed(1)}`);
console.log(`First-KO scorer → wins that game: ${(100 * firstKoWins / firstKoGames).toFixed(1)}%`);
console.log(`\nTotal KOs scored:  P0 ${rs.reduce((a,r)=>a+r.kills0,0)}  ·  P1 ${rs.reduce((a,r)=>a+r.kills1,0)}`);
console.log(`Avg KOs/game:      P0 ${avg(rs.map(r=>r.kills0)).toFixed(2)}  ·  P1 ${avg(rs.map(r=>r.kills1)).toFixed(2)}`);
