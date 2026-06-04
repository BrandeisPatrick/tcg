/**
 * Fair evaluation framework for Deadlock TCG.
 *
 * Pieces that make it FAIR (vs. the naive sim):
 *  - **Agent ladder** (random / heuristic / MCTS) so we can measure the skill
 *    gap and de-confound a weak bot from real imbalance.
 *  - **Seeded determinism** so a balance change can be A/B'd on identical games.
 *  - **Matchup control** (random drafts, or forcing a hero onto a side) so a
 *    specific card can be tested at higher N.
 *  - **Wilson confidence intervals** so we only flag statistically real outliers.
 *
 * The runner drives the real boardgame.io engine (souls/draw/combat/endIf all
 * run) via a Client, and only calls the seat's agent during the MATCH phase;
 * drafts are handled here (seeded) so draft policy is independent of play skill.
 */
import { Client } from 'boardgame.io/client';
import { MCTSBot } from 'boardgame.io/ai';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { CARDS_BY_ID } from '@/cards';
import type { GameState, PlayerState, PlayerID } from '@/engine/types';

export type AgentKind = 'random' | 'heuristic' | 'mcts';

// ---- seeded PRNG (mulberry32) ------------------------------------------------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)];

// ---- Wilson score interval (95% by default) ----------------------------------
export function wilson(wins: number, n: number, z = 1.96): { lo: number; hi: number; p: number } {
  if (n === 0) return { lo: 0, hi: 0, p: 0 };
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: center - half, hi: center + half };
}

// ---- agents ------------------------------------------------------------------
// Plain legal-move list (no lookahead) — for the MCTS bot's rollouts and the
// random agent. The heuristic agent calls enumerateAIMoves with lookahead on.
const enumerate = (G: any, ctx: any) =>
  enumerateAIMoves(G, ctx, false).map((o) => ({ move: o.move, args: o.args }));

export type Choice = { move: string; args: any[] };
// Agents receive the FULL boardgame.io client state (not just {G,ctx}) — the
// MCTS bot's internal reducer needs every state field.
type Agent = (st: any) => Promise<Choice | null>;

function makeAgent(kind: AgentKind, r: () => number, mctsIterations: number, mctsDepth: number): Agent {
  if (kind === 'heuristic') {
    return async (st) => enumerateAIMoves(st.G, st.ctx)[0] ?? null;
  }
  if (kind === 'random') {
    return async (st) => {
      const opts = enumerate(st.G, st.ctx);
      return opts.length ? pick(opts, r) : null;
    };
  }
  // mcts
  const bot = new MCTSBot({
    game: DeadlockGame as any,
    enumerate: enumerate as any,
    iterations: mctsIterations,
    playoutDepth: mctsDepth,
  } as any);
  (bot as any).random = (n: number) => Math.floor(r() * n); // deterministic rollouts; must return int [0,n)
  return async (st) => {
    const { action } = (await bot.play(st, st.ctx.currentPlayer)) as any;
    if (!action?.payload) return null;
    return { move: action.payload.type, args: action.payload.args ?? [] };
  };
}

// ---- one game ----------------------------------------------------------------
export type GameResult = {
  winner: PlayerID | undefined;       // undefined = stalemate
  stalemate: boolean;
  length: number;                     // real match turns
  heroes: Record<PlayerID, string[]>;
  equips: Record<PlayerID, string[]>; // equipment cardIds actually built, per side
};

/** Equipment ids attached on a side's board heroes at game end (what got built). */
function boardEquips(ps: PlayerState): string[] {
  const out: string[] = [];
  for (const c of [ps.active, ...ps.bench]) {
    for (const eq of c?.attached ?? []) out.push(eq.cardId);
  }
  return out;
}

function boardHeroes(ps: PlayerState): string[] {
  return [ps.active, ...ps.bench]
    .filter((c): c is NonNullable<typeof c> => !!c && CARDS_BY_ID[c.cardId]?.type === 'hero')
    .map((c) => c.cardId);
}

export async function runGame(opts: {
  seed: number;
  agents: Record<PlayerID, AgentKind>;
  turnCap: number;
  movesPerTurnCap?: number;
  /** Force these hero ids onto a side's draft (rest random) — for focused tests. */
  force?: Partial<Record<PlayerID, string[]>>;
  mctsIterations?: number;
  mctsDepth?: number;
}): Promise<GameResult> {
  const r = rng(opts.seed);
  const game = { ...(DeadlockGame as any), seed: opts.seed };
  const client = Client({ game, numPlayers: 2 });
  client.start();

  const agents: Record<PlayerID, Agent> = {
    '0': makeAgent(opts.agents['0'], rng(opts.seed ^ 0x9e3779b1), opts.mctsIterations ?? 60, opts.mctsDepth ?? 40),
    '1': makeAgent(opts.agents['1'], rng(opts.seed ^ 0x85ebca77), opts.mctsIterations ?? 60, opts.mctsDepth ?? 40),
  };
  const forceLeft: Record<PlayerID, string[]> = {
    '0': [...(opts.force?.['0'] ?? [])],
    '1': [...(opts.force?.['1'] ?? [])],
  };

  const moveCap = opts.movesPerTurnCap ?? 40;
  let st: any = client.getState();
  let guard = 0, movesThisTurn = 0, lastTurn = -1;

  while (st && !st.ctx.gameover) {
    const G: GameState = st.G;
    const ctx = st.ctx;
    if (++guard > 80_000) break;

    if (G.draft) {
      const cur = ctx.currentPlayer as PlayerID;
      const pool = G.draft.pool;
      if (!pool.length) break;
      // honour forced heroes for this side first
      const forced = forceLeft[cur].find((h) => pool.includes(h));
      const choiceId = forced ?? pick(pool, r);
      if (forced) forceLeft[cur].splice(forceLeft[cur].indexOf(forced), 1);
      const before = st._stateID;
      client.moves.draftPick(choiceId);
      st = client.getState();
      if (st._stateID === before) break;
      continue;
    }

    if ((G.turnNumber ?? 0) > opts.turnCap) break; // stalemate
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }

    const choice = await agents[ctx.currentPlayer as PlayerID](st);
    const before = st._stateID;
    if (!choice || choice.move === 'endTurn' || movesThisTurn >= moveCap) {
      client.moves.endTurn();
    } else {
      (client.moves as any)[choice.move](...choice.args);
    }
    st = client.getState();
    movesThisTurn++;
    if (st._stateID === before && !st.ctx.gameover) {
      client.moves.endTurn();
      st = client.getState();
    }
  }

  const G: GameState = st.G;
  const over = st.ctx.gameover;
  return {
    winner: over?.winner,
    stalemate: !over,
    length: G.turnNumber ?? 0,
    heroes: { '0': boardHeroes(G.players['0']), '1': boardHeroes(G.players['1']) },
    equips: { '0': boardEquips(G.players['0']), '1': boardEquips(G.players['1']) },
  };
}

// ---- batch helper ------------------------------------------------------------
export async function runBatch(opts: {
  games: number;
  masterSeed: number;
  agents: Record<PlayerID, AgentKind>;
  turnCap: number;
  force?: Partial<Record<PlayerID, string[]>>;
  mctsIterations?: number;
  onProgress?: (i: number) => void;
}): Promise<GameResult[]> {
  const out: GameResult[] = [];
  for (let i = 0; i < opts.games; i++) {
    out.push(await runGame({
      seed: (opts.masterSeed + i * 2654435761) >>> 0,
      agents: opts.agents,
      turnCap: opts.turnCap,
      force: opts.force,
      mctsIterations: opts.mctsIterations,
    }));
    opts.onProgress?.(i + 1);
  }
  return out;
}

export function heroName(id: string): string {
  return CARDS_BY_ID[id]?.name ?? id;
}
