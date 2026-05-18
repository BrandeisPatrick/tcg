/**
 * Balance simulator wrapped as a vitest spec so it has the same module
 * resolution as the test suite. Disabled by default — set RUN_SIM=1 to
 * actually run a batch.
 *
 *   RUN_SIM=1 npx vitest run tests/sim/balance-sim.spec.ts
 *   RUN_SIM=1 SIM_N=200 npx vitest run tests/sim/balance-sim.spec.ts
 *
 * Both players use the AI heuristic (Aggro deck for P0, Control for P1).
 * Output: aggregate win rate, average + median match length, per-hero KO counts.
 */
import { describe, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import type { GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';

const N_MATCHES = parseInt(process.env.SIM_N || '50', 10);
const MAX_TURNS = 60;

interface MatchResult {
  winner: PlayerID | 'draw' | 'timeout';
  turns: number;
  p0KOs: string[];
  p1KOs: string[];
  finalP0Hp: number;
  finalP1Hp: number;
}

function runOneMatch(seed: number): MatchResult {
  // Simple LCG for reproducibility.
  let state = seed;
  const origRandom = Math.random;
  Math.random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  try {
    const c = Client({ game: DeadlockGame, numPlayers: 2 });
    c.start();
    // Auto-confirm mulligan.
    try { (c.moves as any).mulligan([]); } catch {}

    const p0KOs = new Set<string>();
    const p1KOs = new Set<string>();
    let safety = 0;

    while (true) {
      if (++safety > 5000) return finalize('timeout');
      const snap = c.getState()!;
      const ctx = snap.ctx as any;
      const G = snap.G as GameState;

      if (ctx.gameover) {
        const w = (ctx.gameover.winner ?? (ctx.gameover.draw ? 'draw' : 'draw')) as any;
        return finalize(w);
      }
      if (ctx.turn >= MAX_TURNS) return finalize('timeout');

      // Snapshot KO'd heroes for tracking.
      for (const pid of ['0','1'] as PlayerID[]) {
        const ps = G.players[pid];
        const checkCorpse = (card: any) => {
          if (card && (card.respawnTurnsLeft ?? 0) > 0) {
            if (pid === '0') p0KOs.add(card.cardId);
            else p1KOs.add(card.cardId);
          }
        };
        checkCorpse(ps.active);
        for (const b of ps.bench) checkCorpse(b);
      }

      const moves = enumerateAIMoves(G, ctx);
      const best = moves.sort((a, b) => b.score - a.score)[0];
      if (!best) {
        try { (c.moves as any).endTurn?.(); } catch { return finalize('draw'); }
        continue;
      }
      try {
        (c.moves as any)[best.move]?.(...best.args);
      } catch {
        // illegal move — bail
        return finalize('draw');
      }
    }

    function finalize(winner: any): MatchResult {
      const snap = c.getState()!;
      const G = snap.G as GameState;
      const ctx = snap.ctx as any;
      return {
        winner,
        turns: ctx.turn,
        p0KOs: Array.from(p0KOs),
        p1KOs: Array.from(p1KOs),
        finalP0Hp: G.players['0'].hp,
        finalP1Hp: G.players['1'].hp,
      };
    }
  } finally {
    Math.random = origRandom;
  }
}

function fmt(n: number, places = 1) { return n.toFixed(places); }

function runSim() {
  const results: MatchResult[] = [];
  for (let i = 0; i < N_MATCHES; i++) {
    results.push(runOneMatch(i + 1));
  }

  let p0Wins = 0, p1Wins = 0, draws = 0, timeouts = 0;
  let totalTurns = 0;
  const koCount: Record<string, number> = {};
  const matchupLengths: number[] = [];

  for (const r of results) {
    if (r.winner === '0') p0Wins++;
    else if (r.winner === '1') p1Wins++;
    else if (r.winner === 'draw') draws++;
    else timeouts++;
    totalTurns += r.turns;
    matchupLengths.push(r.turns);
    for (const id of [...r.p0KOs, ...r.p1KOs]) {
      koCount[id] = (koCount[id] || 0) + 1;
    }
  }

  const total = results.length;
  console.log(`\n=== BALANCE SIM (${total} matches) ===`);
  console.log(`P0 (Aggro)   wins: ${p0Wins.toString().padStart(3)} (${fmt(100 * p0Wins / total)}%)`);
  console.log(`P1 (Control) wins: ${p1Wins.toString().padStart(3)} (${fmt(100 * p1Wins / total)}%)`);
  console.log(`Draws / Timeouts:  ${draws} / ${timeouts}`);
  console.log(`Avg turns: ${fmt(totalTurns / total)}`);
  matchupLengths.sort((a, b) => a - b);
  const median = matchupLengths[Math.floor(matchupLengths.length / 2)];
  console.log(`Median / Min / Max turns: ${median} / ${matchupLengths[0]} / ${matchupLengths[matchupLengths.length - 1]}`);
  console.log("\nHero KO counts (matches where this hero KO'd at least once):");
  const koEntries = Object.entries(koCount).sort((a, b) => b[1] - a[1]);
  for (const [id, n] of koEntries) {
    const name = CARDS_BY_ID[id]?.name ?? id;
    console.log(`  ${name.padEnd(15)} ${n.toString().padStart(3)} (${fmt(100 * n / total)}%)`);
  }
  console.log('=========================\n');
}

describe.runIf(process.env.RUN_SIM === '1')('balance simulator', () => {
  it('runs N self-play matches and prints stats', () => {
    runSim();
  }, 120_000);
});
