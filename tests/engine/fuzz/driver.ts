/**
 * Seeded game driver for the property / fuzz harness.
 *
 * One call plays one whole game through a real boardgame.io Client with
 * `DeadlockGame` (draft included), so turn flow, endIf, onBegin and onEnd all
 * run. Three random streams keep a seed reproducible and keep observers honest:
 *   - the ENGINE stream: `Math.random` is pinned to mulberry32(seed) for the
 *     length of the game (shuffles, the AI deck pick, draft picks) and restored
 *     afterwards, even if the game throws;
 *   - the POLICY stream: random-legal / chaos choices;
 *   - the HOOK stream: handed to hooks that want randomness of their own, so
 *     an observer calling the engine on clones can never perturb the game.
 */
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import type { GameState, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { allIids, boardOf } from './oracle';

export type Policy = 'heuristic' | 'randomLegal' | 'chaos';
export const CHAOS_RATE = 0.3;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run `fn` with Math.random pinned to a seeded generator; always restores it. */
export function withPinnedRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** boardgame.io logs every rejected move (console.error) and turn event
 *  (console.log); a fuzz run rejects thousands. Silence just those lines. */
function withQuietBgio<T>(fn: () => T): T {
  const err = console.error;
  const log = console.log;
  console.error = (...a: unknown[]) => { if (a[0] !== 'ERROR:') err(...a); };
  console.log = (...a: unknown[]) => { if (typeof a[0] !== 'string' || !a[0].startsWith('INFO:')) log(...a); };
  try {
    return fn();
  } finally {
    console.error = err;
    console.log = log;
  }
}

export interface MoveRecord {
  /** 0-based index over every attempt in the game (accepted or not). */
  step: number;
  name: string;
  args: unknown[];
  player: PlayerID;
  policy: Policy | 'draft' | 'fallback';
  /** True when the move came from the chaos generator rather than the legal list. */
  chaos: boolean;
}

export interface StepInfo extends MoveRecord { seed: number }
export interface Snapshot { G: GameState; ctx: Ctx }

export interface PlayOpts {
  seed: number;
  policies: Record<PlayerID, Policy>;
  /** Real match turns before the game is called a stalemate. */
  turnCap?: number;
  /** Accepted moves one seat may make in one turn before the driver ends it. */
  movesPerTurnCap?: number;
  chaosRate?: number;
  /** Heroes a seat tries to draft first (each pick takes the first one still in the
   *  pool), so rare interactions — Rem's merge, Sinclair's copied ultimate — are
   *  played far more often than a uniform draft would. The rest is random. */
  prefer?: Partial<Record<PlayerID, string[]>>;
  /** Before every attempt, with the state the move will be made from. May
   *  return nothing; throw to abort the game. `hookRandom` is a private stream. */
  beforeMove?: (snap: Snapshot, info: StepInfo, hookRandom: () => number) => void;
  /** After every attempt (accepted or not). */
  afterMove?: (before: Snapshot, after: Snapshot, move: StepInfo, accepted: boolean, error?: unknown) => void;
}

export interface GameRecord {
  seed: number;
  policies: Record<PlayerID, Policy>;
  final: Snapshot;
  steps: number;
  accepted: number;
  turns: number;
  winner: PlayerID | undefined;
  stalemate: boolean;
  moves: MoveRecord[];
  /** Moves the engine threw on (a throw leaves the client state untouched). */
  threw: { move: MoveRecord; error: string }[];
  /** Policy generators (heuristic / enumerate) that threw. */
  policyThrew: { step: number; error: string }[];
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

const CHAOS_NAMES = ['playCard', 'useSkill', 'moveHero', 'promoteToActive', 'attack', 'endTurn'] as const;

/** A random-but-plausible move: real iids from anywhere in G, slots 0..3 (with
 *  an occasional out-of-range or missing one), or sometimes nonsense. */
export function chaosMove(G: GameState, pid: PlayerID, r: () => number): { name: string; args: unknown[] } {
  const iids = allIids(G);
  const mine = G.players[pid];
  const myHand = mine.hand.map((c) => c.iid);
  const myBoard = boardOf(mine).map((c) => c.iid);
  const anyIid = () => (r() < 0.06 ? `nope-${Math.floor(r() * 1000)}` : iids.length ? pick(iids, r) : 'x');
  const maybe = <T,>(v: T, pMissing = 0.12): T | undefined => (r() < pMissing ? undefined : v);
  const slot = () => {
    const x = r();
    if (x < 0.04) return pick([4, 7, -1, 1.5, '2'] as unknown[], r);
    if (x < 0.1) return undefined;
    return Math.floor(r() * 4);
  };
  // The bookkeeping moves, now and then: they must be harmless outside their window.
  if (r() < 0.08) {
    const extra = pick(['completeAction', 'mulligan', 'draftPick'], r);
    return { name: extra, args: extra === 'draftPick' ? [r() < 0.5 ? 'hero_haze' : anyIid()] : [] };
  }
  const name = pick([...CHAOS_NAMES], r);
  switch (name) {
    case 'playCard': {
      const card = myHand.length && r() < 0.8 ? pick(myHand, r) : anyIid();
      const args: unknown[] = [maybe(card, 0.03), maybe(anyIid(), 0.25)];
      if (r() < 0.3) args.push(maybe(anyIid(), 0.4));
      return { name, args };
    }
    case 'useSkill': {
      const hero = myBoard.length && r() < 0.8 ? pick(myBoard, r) : anyIid();
      return { name, args: [maybe(hero, 0.03), maybe(anyIid(), 0.3)] };
    }
    case 'moveHero':
      return { name, args: [slot(), slot()] };
    case 'promoteToActive':
      return { name, args: [maybe(anyIid(), 0.1)] };
    default:
      return { name, args: [] };
  }
}

export function playGame(opts: PlayOpts): GameRecord {
  const turnCap = opts.turnCap ?? 40;
  const movesPerTurnCap = opts.movesPerTurnCap ?? 40;
  const chaosRate = opts.chaosRate ?? CHAOS_RATE;
  const policyRandom = mulberry32((opts.seed ^ 0x9e3779b9) >>> 0);
  const hookRandom = mulberry32((opts.seed ^ 0x85ebca6b) >>> 0);
  const savedConfig = getMatchConfig();

  return withQuietBgio(() => withPinnedRandom(opts.seed, () => {
    // No scripted setup: the real draft path.
    setMatchConfig({ playerDeck: [], heroPreferences: [null, null, null, null] });
    try {
      const client = Client({ game: { ...DeadlockGame, seed: `fuzz-${opts.seed}` } as any, numPlayers: 2 });
      client.start();
      let st: any = client.getState();

      const moves: MoveRecord[] = [];
      const threw: GameRecord['threw'] = [];
      const policyThrew: GameRecord['policyThrew'] = [];
      let step = 0;
      let acceptedCount = 0;
      let lastTurn = -1;
      let acceptedThisTurn = 0;
      let attemptsThisTurn = 0;
      const HARD_CAP = 20000;

      while (st && !st.ctx.gameover && step < HARD_CAP) {
        const G: GameState = st.G;
        const ctx: Ctx = st.ctx;
        if (!G.draft && (G.turnNumber ?? 0) > turnCap) break;
        if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; acceptedThisTurn = 0; attemptsThisTurn = 0; }
        const pid = ctx.currentPlayer as PlayerID;
        const policy = opts.policies[pid];

        let rec: MoveRecord;
        if (G.draft) {
          const pool = G.draft.pool;
          const wanted = (opts.prefer?.[pid] ?? []).find((h) => pool.includes(h));
          // Math.random is drawn either way so a preference never shifts the engine's stream.
          const roll = pool[Math.floor(Math.random() * pool.length)];
          rec = { step, name: 'draftPick', args: [wanted ?? roll], player: pid, policy: 'draft', chaos: false };
        } else if (acceptedThisTurn >= movesPerTurnCap || attemptsThisTurn >= movesPerTurnCap * 5) {
          rec = { step, name: 'endTurn', args: [], player: pid, policy: 'fallback', chaos: false };
        } else {
          rec = chooseMove(G, ctx, pid, policy, policyRandom, chaosRate, step, policyThrew);
        }
        moves.push(rec);
        const info: StepInfo = { ...rec, seed: opts.seed };
        opts.beforeMove?.({ G, ctx }, info, hookRandom);

        const before: Snapshot = { G, ctx };
        const stateId = st._stateID;
        let error: unknown;
        try {
          (client.moves as any)[rec.name](...rec.args);
        } catch (e) {
          error = e;
          threw.push({ move: rec, error: String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ') });
        }
        st = client.getState();
        const accepted = st._stateID !== stateId;
        step++;
        attemptsThisTurn++;
        if (accepted) { acceptedCount++; acceptedThisTurn++; }
        opts.afterMove?.(before, { G: st.G, ctx: st.ctx }, info, accepted, error);

        // A legal-list move the engine refused: fall back to ending the turn so
        // the game keeps moving (balance-sim does the same).
        if (!accepted && !rec.chaos && rec.name !== 'endTurn' && !st.ctx.gameover) {
          const fb: MoveRecord = { step, name: 'endTurn', args: [], player: pid, policy: 'fallback', chaos: false };
          moves.push(fb);
          const fbBefore: Snapshot = { G: st.G, ctx: st.ctx };
          const fbId = st._stateID;
          try { (client.moves as any).endTurn(); } catch (e) { threw.push({ move: fb, error: String(e) }); }
          st = client.getState();
          step++;
          opts.afterMove?.(fbBefore, { G: st.G, ctx: st.ctx }, { ...fb, seed: opts.seed }, st._stateID !== fbId);
        }
      }

      client.stop();
      const G: GameState = st.G;
      return {
        seed: opts.seed,
        policies: opts.policies,
        final: { G, ctx: st.ctx },
        steps: step,
        accepted: acceptedCount,
        turns: G.turnNumber ?? 0,
        winner: st.ctx.gameover?.winner,
        stalemate: !st.ctx.gameover,
        moves,
        threw,
        policyThrew,
      };
    } finally {
      setMatchConfig(savedConfig);
    }
  }));
}

function chooseMove(
  G: GameState,
  ctx: Ctx,
  pid: PlayerID,
  policy: Policy,
  r: () => number,
  chaosRate: number,
  step: number,
  policyThrew: GameRecord['policyThrew'],
): MoveRecord {
  const base = { step, player: pid, policy } as const;
  try {
    if (policy === 'chaos' && r() < chaosRate) {
      const m = chaosMove(G, pid, r);
      return { ...base, ...m, chaos: true };
    }
    if (policy === 'heuristic') {
      const best = enumerateAIMoves(G, ctx)[0];
      return best ? { ...base, name: best.move, args: best.args, chaos: false } : { ...base, name: 'endTurn', args: [], chaos: false };
    }
    const opts = enumerateAIMoves(G, ctx, false);
    const o = opts.length ? pick(opts, r) : undefined;
    return o ? { ...base, name: o.move, args: o.args, chaos: false } : { ...base, name: 'endTurn', args: [], chaos: false };
  } catch (e) {
    policyThrew.push({ step, error: String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ') });
    return { ...base, name: 'endTurn', args: [], chaos: false };
  }
}
