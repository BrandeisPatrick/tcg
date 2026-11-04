/**
 * Per-hero SEAT sensitivity. For each hero, its team's win-rate when it moved
 * first and when it moved second. The pie rule: seat 0 drafts first and seat 1
 * moves first, so in a drafted match the first mover is seat 1 (read off
 * `G.firstMover` all the same). A hero with a small (or negative) gap is
 * seat-robust / good going second. No human seat: both seats are promoted on
 * the spot, as in the balance sim.
 *
 * Run:  npx vite-node scripts/eval/hero-seat.ts [games]
 */
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { CARDS_BY_ID } from '@/cards';
import { setMatchConfig } from '@/storage/matchConfig';
import { heroesOf } from '@/engine/query';
import { firstMover } from '@/engine/rounds';
import type { GameState, PlayerID } from '@/engine/types';

const GAMES = Number(process.argv[2] ?? 600);
const TURN_CAP = 40; // engine turns
setMatchConfig({ heroPreferences: [null, null, null, null], humanSeat: null });

type Seat = PlayerID;
// Per hero: games and wins with its team moving first, and moving second.
const stat: Record<string, { fg: number; fw: number; sg: number; sw: number }> = {};
const bump = (id: string) => (stat[id] ??= { fg: 0, fw: 0, sg: 0, sw: 0 });

function playOne() {
  const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
  client.start();
  let st: any = client.getState();
  let guard = 0, movesThisTurn = 0, lastTurn = -1;
  let rosters: Record<Seat, string[]> | null = null;
  let mover: Seat = '1';

  while (st && !st.ctx.gameover) {
    const G: GameState = st.G; const ctx = st.ctx;
    if (++guard > 50_000) break;
    if (G.draft) {
      const pool = G.draft.pool; if (!pool.length) break;
      const before = st._stateID;
      client.moves.draftPick(pool[Math.floor(Math.random() * pool.length)]);
      st = client.getState(); if (st._stateID === before) break; continue;
    }
    // A merged Rem rides in an ally's `attached` list: heroesOf still finds her.
    if (!rosters) {
      rosters = { '0': heroesOf(G.players['0']).map((c) => c.cardId), '1': heroesOf(G.players['1']).map((c) => c.cardId) };
      mover = firstMover(G);
    }
    if ((G.turnNumber ?? 0) > TURN_CAP) break;
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }
    const best = enumerateAIMoves(G, ctx)[0];
    const before = st._stateID;
    if (!best || best.move === 'endTurn' || movesThisTurn >= 40) client.moves.endTurn();
    else (client.moves as any)[best.move](...best.args);
    st = client.getState(); movesThisTurn++;
    if (st._stateID === before && !st.ctx.gameover) client.moves.endTurn();
  }
  client.stop();
  const w = st?.ctx?.gameover?.winner as Seat | undefined;
  if ((w !== '0' && w !== '1') || !rosters) return;
  for (const seat of ['0', '1'] as Seat[]) {
    for (const h of rosters[seat]) {
      const s = bump(h);
      if (seat === mover) { s.fg++; if (w === seat) s.fw++; }
      else { s.sg++; if (w === seat) s.sw++; }
    }
  }
}

for (let i = 0; i < GAMES; i++) playOne();

const rows = Object.entries(stat).map(([id, s]) => {
  const first = s.fg ? (100 * s.fw / s.fg) : 0;
  const second = s.sg ? (100 * s.sw / s.sg) : 0;
  return { name: CARDS_BY_ID[id]?.name ?? id, first, second, gap: first - second, n: s.fg + s.sg };
}).sort((a, b) => a.gap - b.gap); // smallest gap first = most seat-robust

console.log(`\n# Per-hero seat sensitivity — ${GAMES} games`);
console.log(`(win% when this hero's team moved first · when it moved second · gap = first − second; smaller gap = better going second)\n`);
console.log(`| Hero | moved first win% | moved second win% | gap | n |`);
console.log(`|---|---:|---:|---:|---:|`);
for (const r of rows) {
  console.log(`| ${r.name} | ${r.first.toFixed(0)}% | ${r.second.toFixed(0)}% | ${r.gap >= 0 ? '+' : ''}${r.gap.toFixed(0)} | ${r.n} |`);
}
const avgGap = rows.reduce((a, r) => a + r.gap, 0) / (rows.length || 1);
console.log(`\nMean gap across heroes: ${avgGap >= 0 ? '+' : ''}${avgGap.toFixed(1)}  (this ≈ the structural edge of moving first)`);
