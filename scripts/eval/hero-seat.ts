/**
 * Per-hero SEAT sensitivity. For each hero, win-rate when drafted by P0 vs P1.
 * A hero with a small (or negative) P0−P1 gap is seat-robust / good going second.
 *
 * Run:  npx vite-node scripts/eval/hero-seat.ts [games]
 */
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { CARDS_BY_ID } from '@/cards';
import type { GameState, PlayerState } from '@/engine/types';

const GAMES = Number(process.argv[2] ?? 600);
const TURN_CAP = 40;

function roster(ps: PlayerState): string[] {
  return [ps.active, ...ps.bench]
    .filter((c): c is NonNullable<typeof c> => !!c && CARDS_BY_ID[c.cardId]?.type === 'hero')
    .map((c) => c.cardId);
}

type Seat = '0' | '1';
const stat: Record<string, { p0g: number; p0w: number; p1g: number; p1w: number }> = {};
const bump = (id: string) => (stat[id] ??= { p0g: 0, p0w: 0, p1g: 0, p1w: 0 });

function playOne() {
  const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
  client.start();
  let st: any = client.getState();
  let guard = 0, movesThisTurn = 0, lastTurn = -1;
  let r0: string[] = [], r1: string[] = [], captured = false;

  while (st && !st.ctx.gameover) {
    const G: GameState = st.G; const ctx = st.ctx;
    if (++guard > 50_000) break;
    if (G.draft) {
      const pool = G.draft.pool; if (!pool.length) break;
      const before = st._stateID;
      client.moves.draftPick(pool[Math.floor(Math.random() * pool.length)]);
      st = client.getState(); if (st._stateID === before) break; continue;
    }
    if (!captured) { r0 = roster(G.players['0']); r1 = roster(G.players['1']); captured = true; }
    if ((G.turnNumber ?? 0) > TURN_CAP) break;
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }
    const best = enumerateAIMoves(G, ctx)[0];
    const before = st._stateID;
    if (!best || best.move === 'endTurn' || movesThisTurn >= 40) client.moves.endTurn();
    else (client.moves as any)[best.move](...best.args);
    st = client.getState(); movesThisTurn++;
    if (st._stateID === before && !st.ctx.gameover) client.moves.endTurn();
  }
  const w = st?.ctx?.gameover?.winner as Seat | undefined;
  if (w !== '0' && w !== '1') return;
  for (const h of r0) { const s = bump(h); s.p0g++; if (w === '0') s.p0w++; }
  for (const h of r1) { const s = bump(h); s.p1g++; if (w === '1') s.p1w++; }
}

for (let i = 0; i < GAMES; i++) playOne();

const rows = Object.entries(stat).map(([id, s]) => {
  const p0 = s.p0g ? (100 * s.p0w / s.p0g) : 0;
  const p1 = s.p1g ? (100 * s.p1w / s.p1g) : 0;
  return { name: CARDS_BY_ID[id]?.name ?? id, p0, p1, gap: p0 - p1, n: s.p0g + s.p1g };
}).sort((a, b) => a.gap - b.gap); // smallest gap first = most seat-robust

console.log(`\n# Per-hero seat sensitivity — ${GAMES} games`);
console.log(`(P0 win% when this hero is on P0's team · P1 win% when on P1's team · gap = P0−P1; smaller gap = better going second)\n`);
console.log(`| Hero | P0 win% | P1 win% | gap | n |`);
console.log(`|---|---:|---:|---:|---:|`);
for (const r of rows) {
  console.log(`| ${r.name} | ${r.p0.toFixed(0)}% | ${r.p1.toFixed(0)}% | ${r.gap >= 0 ? '+' : ''}${r.gap.toFixed(0)} | ${r.n} |`);
}
const avgGap = rows.reduce((a, r) => a + r.gap, 0) / rows.length;
console.log(`\nMean gap across heroes: +${avgGap.toFixed(1)}  (this ≈ the structural seat skew)`);
