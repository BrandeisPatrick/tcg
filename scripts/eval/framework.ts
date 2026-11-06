/**
 * Fair evaluation framework for Deadlock TCG.
 *
 * Pieces that make it FAIR (vs. the naive sim):
 *  - **Agent ladder** (random / heuristic / MCTS) so we can measure the skill
 *    gap and de-confound a weak bot from real imbalance.
 *  - **Seeded determinism** so a balance change can be A/B'd on identical games:
 *    the draft picks, the agents, the match seed (the market) and Math.random
 *    all draw from streams of the game's seed.
 *  - **Matchup control** (random drafts, or forcing a hero onto a side) so a
 *    specific card can be tested at higher N.
 *  - **Wilson confidence intervals** so we only flag statistically real outliers.
 *  - **Seat-neutral promotions**: no human seat, so the engine replaces a
 *    fallen Active on both sides by one rule (as in the balance sim).
 *
 * The runner drives the real boardgame.io engine (income, the shop, combat,
 * endIf all run) via a Client, and only calls the seat's agent during the
 * MATCH phase; drafts are handled here (seeded) so draft policy is independent
 * of play skill. What each side buys, sells and uses is read off the board
 * after every move (ledger.ts).
 */
import { Client } from 'boardgame.io/client';
import { MCTSBot } from 'boardgame.io/ai';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { CARDS_BY_ID } from '@/cards';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { heroesOf } from '@/engine/query';
import { firstMover, ownTurn } from '@/engine/rounds';
import type { GameState, PlayerID } from '@/engine/types';
import { shopLedger, wornBySide } from './ledger';
// The seeded PRNG (mulberry32) and the Wilson interval live with the other
// statistics, which have tests of their own.
import { mulberry32 as rng, wilson } from './stats';

export { rng, wilson };

export type AgentKind = 'random' | 'heuristic' | 'mcts';

const pick = <T>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)];

// ---- agents ------------------------------------------------------------------
// Plain legal-move list (no lookahead) — for the MCTS bot's rollouts and the
// random agent. The heuristic agent calls enumerateAIMoves with lookahead on.
// In the shop step every agent gets the heuristic's one shopping move (it buys
// by the hero's build), so the agents differ in how they act, not in what they buy.
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
  length: number;                     // engine turns (both players' turns together)
  /** The length in own turns: the rounds the first mover began. */
  ownTurns: number;
  /** The seat that took the first turn (seat 1 in a drafted match: the pie rule). */
  firstMover: PlayerID;
  heroes: Record<PlayerID, string[]>;
  /** Items each side bought, in the order bought (an upgrade as the item it became). */
  buys: Record<PlayerID, string[]>;
  /** Active items each side used, one entry per use. */
  actives: Record<PlayerID, string[]>;
  /** Items each side sold (the heuristic never sells). */
  sells: Record<PlayerID, number>;
  /** Items each side's heroes wore when the game ended, actives and passives. */
  worn: Record<PlayerID, string[]>;
  /** Souls each side held when the game ended. */
  souls: Record<PlayerID, number>;
};

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
  // Math.random (which the engine reads only for a match seed the config does
  // not give) is pinned to a stream of this game's seed for the length of the
  // game, as scripts/eval/ai-vs-ai.ts and tests/engine/fuzz/driver.ts do, and
  // the match config gives a match seed of the game's own (the market) and no
  // human seat; both are restored after, so the same seed plays the same game.
  // (The games of a batch run one after another.)
  const original = Math.random;
  const config = getMatchConfig();
  Math.random = rng((opts.seed ^ 0xc2b2ae35) >>> 0);
  setMatchConfig({ heroPreferences: [null, null, null, null], humanSeat: null, seed: (opts.seed ^ 0x27d4eb2f) >>> 0 });
  try {
    return await playGame(opts);
  } finally {
    Math.random = original;
    setMatchConfig(config);
  }
}

async function playGame(opts: Parameters<typeof runGame>[0]): Promise<GameResult> {
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
  const ledger = shopLedger(st.G);
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
    ledger.observe(st.G);
  }
  client.stop();

  const G: GameState = st.G;
  const over = st.ctx.gameover;
  const bySide = <T>(f: (pid: PlayerID) => T) => ({ '0': f('0'), '1': f('1') }) as Record<PlayerID, T>;
  return {
    winner: over?.winner,
    stalemate: !over,
    length: G.turnNumber ?? 0,
    ownTurns: ownTurn(G, firstMover(G)),
    firstMover: firstMover(G),
    // A merged Rem rides in an ally's `attached` list, not on a slot: she is
    // still this side's hero, so her games count for her (heroesOf finds her).
    heroes: bySide((pid) => heroesOf(G.players[pid]).map((c) => c.cardId)),
    buys: bySide((pid) => ledger.purchases.filter((p) => p.seat === pid).map((p) => p.item)),
    actives: bySide((pid) => ledger.uses.filter((u) => u.seat === pid).map((u) => u.item)),
    sells: bySide((pid) => ledger.sales.filter((s) => s.seat === pid).length),
    worn: bySide((pid) => wornBySide(G.players[pid])),
    souls: bySide((pid) => G.players[pid].souls),
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

