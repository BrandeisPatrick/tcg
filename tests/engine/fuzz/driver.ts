/**
 * Seeded game driver for the property / fuzz harness.
 *
 * One call plays one whole game through a real boardgame.io Client with
 * `DeadlockGame` (draft included), so turn flow, endIf, onBegin and onEnd all
 * run. The match seed (`marketSeedFor(seed)`, handed to the match config) draws
 * every shuffle of the decks, so a seed is also a deal. Three random streams
 * keep a seed reproducible and keep observers honest:
 *   - the ENGINE stream: `Math.random` is pinned to mulberry32(seed) for the
 *     length of the game (draft picks, the AI's tie-breaks) and restored
 *     afterwards, even if the game throws;
 *   - the POLICY stream: random-legal / chaos choices;
 *   - the HOOK stream: handed to hooks that want randomness of their own, so
 *     an observer calling the engine on clones can never perturb the game.
 *
 * The Mid-Boss is off for now (MID_BOSS_ENABLED); the harness still plays it:
 * an odd seed's match turns it on (`midBoss`), an even seed's plays the game
 * as it stands, without one.
 */
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import type { GameState, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { enumerateAIMoves } from '@/ai/heuristic';
import { legalActions } from '@/engine/legality';
import { MATCH_TURNS } from '@/engine/rounds';
import type { Action } from '@/engine/engine';
import { ITEMS } from '@/cards';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { allIids, boardOf, handOf, isHeroCard, itemData, skillIdsOf, upgradesOfOracle, wornItemsOf } from './oracle';

export type Policy = 'heuristic' | 'randomLegal' | 'chaos';
const CHAOS_RATE = 0.3;

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
function withPinnedRandom<T>(seed: number, fn: () => T): T {
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

interface PlayOpts {
  seed: number;
  policies: Record<PlayerID, Policy>;
  /** Real match turns before the game is called a stalemate: MATCH_TURNS (the
   *  round cap's last turn) unless a spec asks for fewer — a guard no match reaches. */
  turnCap?: number;
  /** Accepted moves one seat may make in one turn before the driver ends it. */
  movesPerTurnCap?: number;
  chaosRate?: number;
  /** Heroes a seat tries to draft first (each pick takes the first one still in the
   *  pool), so rare interactions — Rem's merge, Sinclair's copied ultimate — are
   *  played far more often than a uniform draft would. The rest is random. The
   *  list is taken in an order the seed draws, so the line-up (who stands Active,
   *  who gets a hero both seats want) varies from seed to seed. */
  prefer?: Partial<Record<PlayerID, string[]>>;
  /** The match has a Mid-Boss (`MatchConfig.midBoss`). Left out: an odd seed's
   *  does, an even seed's does not (MID_BOSS_ENABLED is off), so both games are
   *  played. */
  midBoss?: boolean;
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

/** Each seat's preferences in an order drawn from `r` (a Fisher–Yates shuffle). */
function seededOrder(prefer: Partial<Record<PlayerID, string[]>>, r: () => number): Partial<Record<PlayerID, string[]>> {
  const out: Partial<Record<PlayerID, string[]>> = {};
  for (const pid of ['0', '1'] as PlayerID[]) {
    const list = prefer[pid];
    if (!list) continue;
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    out[pid] = a;
  }
  return out;
}

/** The match seed a game's shuffles are drawn from: a fixed function of the game seed,
 *  so a seed replays its deal whatever the engine stream has drawn first. */
export function marketSeedFor(seed: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x6a09e667) >>> 0;
}

const CHAOS_NAMES = ['playCard', 'placeHero', 'discard', 'chooseActive', 'activate', 'useSkill', 'moveHero', 'promoteToActive', 'useTrigger', 'passTrigger', 'attack', 'endTurn'] as const;
/** Ids that name no card of a hand: a hero not drafted, an ultimate, nonsense. */
const JUNK_IDS = ['hero_haze', 'ult_lash', 'eff_cold_front', 'nope', ''];

/** A random-but-plausible move: real iids from anywhere in G (the player's own
 *  heroes, worn items and hand cards most of the time, the rival's now and
 *  then), an upgrade's id or junk for a play's third argument, slots 0..3 (with
 *  an occasional out-of-range or missing one), discards of the right cards, too
 *  many, repeated or junk, or sometimes nonsense. */
export function chaosMove(G: GameState, pid: PlayerID, r: () => number): { name: string; args: unknown[] } {
  const iids = allIids(G);
  const mine = G.players[pid];
  const myBoard = boardOf(mine).map((c) => c.iid);
  const myItems = boardOf(mine).flatMap((c) => wornItemsOf(c));
  const myHand = handOf(G, pid);
  const theirHand = handOf(G, pid === '0' ? '1' : '0');
  const anyIid = () => (r() < 0.06 ? `nope-${Math.floor(r() * 1000)}` : iids.length ? pick(iids, r) : 'x');
  const maybe = <T,>(v: T, pMissing = 0.12): T | undefined => (r() < pMissing ? undefined : v);
  const slot = () => {
    const x = r();
    if (x < 0.04) return pick([4, 7, -1, 1.5, '2'] as unknown[], r);
    if (x < 0.1) return undefined;
    return Math.floor(r() * 4);
  };
  const myHero = () => (myBoard.length && r() < 0.8 ? pick(myBoard, r) : anyIid());
  const myItem = (actives = false) => {
    const pool = actives ? myItems.filter((c) => itemData(c.cardId)?.type === 'spell') : myItems;
    return pool.length && r() < 0.8 ? pick(pool, r).iid : anyIid();
  };
  /** A card of the player's own: from the hand most of the time, else a worn item, else anything. */
  const myCard = () => {
    const x = r();
    if (x < 0.7 && myHand.length) return pick(myHand, r).iid;
    if (x < 0.78 && theirHand.length) return pick(theirHand, r).iid;
    return x < 0.88 ? myItem() : anyIid();
  };
  // The bookkeeping moves, now and then: they must be harmless outside their window.
  if (r() < 0.08) {
    const extra = pick(['completeAction', 'draftPick'], r);
    return { name: extra, args: extra === 'draftPick' ? [r() < 0.5 ? 'hero_haze' : anyIid()] : [] };
  }
  const name = pick([...CHAOS_NAMES], r);
  switch (name) {
    case 'playCard': {
      const card = maybe(myCard(), 0.05);
      const args: unknown[] = [card, maybe(myHero(), 0.06)];
      // Now and then the upgrade it is to make: one of its own, another item's, or junk.
      if (r() < 0.3) {
        const held = myHand.find((c) => c.iid === card);
        const ups = held ? upgradesOfOracle(held.cardId) : [];
        args.push(ups.length && r() < 0.6 ? pick(ups, r) : r() < 0.5 ? pick(ITEMS, r).id : pick(JUNK_IDS, r));
      }
      // Now and then the worn item it is to replace: one the hero wears, another hero's, Rem, junk.
      if (r() < 0.25) {
        if (args.length < 3) args.push(undefined);
        const hero = boardOf(mine).find((c) => c.iid === args[1]);
        const worn = hero ? wornItemsOf(hero) : [];
        const x = r();
        args.push(worn.length && x < 0.6 ? pick(worn, r).iid : x < 0.75 && myItems.length ? pick(myItems, r).iid : x < 0.85 ? anyIid() : pick([null, 7, ''] as unknown[], r));
      }
      return { name, args };
    }
    case 'placeHero': {
      const heroes = myHand.filter(isHeroCard);
      const card = heroes.length && r() < 0.7 ? pick(heroes, r).iid : myCard();
      const x = r();
      return { name, args: x < 0.4 ? [card] : x < 0.8 ? [card, true] : [card, pick([false, 1, 'yes', null], r)] };
    }
    case 'discard': {
      const x = r();
      const owed = G.pendingDiscard?.count ?? 1;
      const hand = myHand.map((c) => c.iid);
      if (x < 0.5 && hand.length) {
        const n = 1 + Math.floor(r() * Math.min(hand.length, owed + 1));
        const picked = [...hand].sort(() => r() - 0.5).slice(0, n);
        return { name, args: [picked] };
      }
      if (x < 0.65 && hand.length) return { name, args: [[hand[0], hand[0]]] };
      if (x < 0.8) return { name, args: [hand.length && r() < 0.5 ? hand[0] : anyIid()] };
      return { name, args: [pick([[], undefined, [anyIid()], 'x'], r)] };
    }
    case 'chooseActive': {
      const owing = G.pendingActive ? handOf(G, G.pendingActive) : myHand;
      return { name, args: [owing.length && r() < 0.8 ? pick(owing, r).iid : anyIid()] };
    }
    case 'activate': {
      const args: unknown[] = [maybe(myItem(true), 0.04)];
      if (r() < 0.75) args.push(maybe(anyIid(), 0.2));
      return { name, args };
    }
    case 'useSkill': {
      const hero = myBoard.length && r() < 0.8 ? pick(myBoard, r) : anyIid();
      const args: unknown[] = [maybe(hero, 0.03), maybe(anyIid(), 0.3)];
      // Now and then a named ability: one of the hero's kit (an ultimate among them), or junk.
      if (r() < 0.35) {
        const kit = boardOf(mine).find((c) => c.iid === hero);
        const ids = kit ? skillIdsOf(kit) : [];
        args.push(ids.length && r() < 0.8 ? pick(ids, r) : pick(['eff_ult_haze', 'skill_kelvin', 'nope'], r));
      }
      return { name, args };
    }
    case 'moveHero':
      return { name, args: [slot(), slot()] };
    case 'promoteToActive':
      return { name, args: [maybe(anyIid(), 0.1)] };
    case 'useTrigger': {
      // A trigger prompt's yes: the offer owed now and then, else a hero and an ability of the
      // player's own (a trigger that is not offered, a skill), or junk.
      const offer = G.triggers?.[G.triggers.length - 1]?.offers[0];
      if (offer && r() < 0.5) return { name, args: [offer.heroIid, offer.abilityId] };
      const hero = myBoard.length && r() < 0.8 ? pick(myBoard, r) : anyIid();
      const kit = boardOf(mine).find((c) => c.iid === hero);
      const ids = kit ? skillIdsOf(kit) : [];
      return { name, args: [maybe(hero, 0.05), ids.length && r() < 0.7 ? pick(ids, r) : pick(['eff_ult_victor', 'nope'], r)] };
    }
    default:
      return { name, args: [] };
  }
}

export function playGame(opts: PlayOpts): GameRecord {
  const turnCap = opts.turnCap ?? MATCH_TURNS;
  const movesPerTurnCap = opts.movesPerTurnCap ?? 40;
  const chaosRate = opts.chaosRate ?? CHAOS_RATE;
  const policyRandom = mulberry32((opts.seed ^ 0x9e3779b9) >>> 0);
  const hookRandom = mulberry32((opts.seed ^ 0x85ebca6b) >>> 0);
  const savedConfig = getMatchConfig();
  const prefer = seededOrder(opts.prefer ?? {}, mulberry32((opts.seed ^ 0x27d4eb2f) >>> 0));

  return withQuietBgio(() => withPinnedRandom(opts.seed, () => {
    // No scripted setup: the real draft path, on a market the seed draws.
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: marketSeedFor(opts.seed), midBoss: opts.midBoss ?? (opts.seed % 2 === 1) });
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
          const wanted = (prefer[pid] ?? []).find((h) => pool.includes(h));
          // Math.random is drawn either way so a preference never shifts the engine's stream.
          const roll = pool[Math.floor(Math.random() * pool.length)];
          rec = { step, name: 'draftPick', args: [wanted ?? roll], player: pid, policy: 'draft', chaos: false };
        } else if (acceptedThisTurn >= movesPerTurnCap || attemptsThisTurn >= movesPerTurnCap * 5) {
          // A choice owed comes before the end of the turn (which is refused until it is made).
          const owed = owedAnswer(G, ctx);
          rec = owed
            ? { step, ...owed, player: pid, policy: 'fallback', chaos: false }
            : { step, name: 'endTurn', args: [], player: pid, policy: 'fallback', chaos: false };
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
          (client.moves as Record<string, (...a: unknown[]) => void>)[rec.name](...rec.args);
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
        // the game keeps moving (balance-sim does the same). (A choice owed is
        // answered first: the end of the turn waits on it.)
        if (!accepted && !rec.chaos && rec.name !== 'endTurn' && !st.ctx.gameover && !owedAnswer(st.G, st.ctx)) {
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

/** The AI's answer to a choice owed (the opening's first Active, a trigger
 *  prompt, a promotion, a draw card's discard), as a client call; undefined
 *  when none is owed. */
function owedAnswer(G: GameState, ctx: Ctx): { name: string; args: unknown[] } | undefined {
  if (!G.pendingActive && !G.pendingPromotion && !G.pendingDiscard && !G.triggers?.length) return undefined;
  try {
    const o = enumerateAIMoves(G, ctx, false)[0];
    return o ? { name: o.move, args: o.args } : undefined;
  } catch {
    return undefined;
  }
}

/** The plays from the hand the engine lists now: heroes onto the board, items onto heroes. */
const HAND_TYPES: ReadonlySet<Action['type']> = new Set(['playCard', 'placeHero']);

/** A hand play as a client call. */
function handCall(a: Action): { name: string; args: unknown[] } {
  if (a.type === 'playCard') {
    if (a.replaceIid !== undefined) return { name: 'playCard', args: [a.cardIid, a.heroIid, a.upgradeId, a.replaceIid] };
    return { name: 'playCard', args: a.upgradeId ? [a.cardIid, a.heroIid, a.upgradeId] : [a.cardIid, a.heroIid] };
  }
  if (a.type === 'placeHero') return { name: 'placeHero', args: a.toActive ? [a.cardIid, true] : a.slot === undefined ? [a.cardIid] : [a.cardIid, false, a.slot] };
  return { name: 'endTurn', args: [] };
}

/**
 * A random seat's own choices where the AI's list would narrow them: a draw card's discard
 * is a random handful of the hand (one card up to what is owed), so partial payments and
 * heroes discarded are played; and now and then (`HAND_RATE`) a hand play the engine lists
 * — a kind (a hero placed, an item played) at random, then one of that kind — so cards are
 * played onto heroes the AI would not pick and held into later turns. Undefined: leave it to
 * the AI's list.
 */
const HAND_RATE = 0.35;
function randomHandMove(G: GameState, pid: PlayerID, r: () => number): { name: string; args: unknown[] } | undefined {
  const owed = G.pendingDiscard;
  if (owed && owed.pid === pid) {
    const hand = handOf(G, pid).map((c) => c.iid);
    const n = 1 + Math.floor(r() * Math.min(owed.count, hand.length));
    return { name: 'discard', args: [[...hand].sort(() => r() - 0.5).slice(0, n)] };
  }
  if (G.pendingActive || G.pendingPromotion || G.pendingDiscard || G.triggers?.length || r() >= HAND_RATE) return undefined;
  const plays = legalActions(G, pid).filter((a) => HAND_TYPES.has(a.type));
  if (!plays.length) return undefined;
  const kind = pick([...new Set(plays.map((a) => a.type))], r);
  return handCall(pick(plays.filter((a) => a.type === kind), r));
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
    // randomLegal (and the chaos seat between its inventions): a random discard, a hand play
    // at random now and then, else the AI's list of moves at random. An owed choice comes
    // first (the AI lists it alone).
    const m = randomHandMove(G, pid, r);
    if (m) return { ...base, ...m, chaos: false };
    const opts = enumerateAIMoves(G, ctx, false);
    const o = opts.length ? pick(opts, r) : undefined;
    return o ? { ...base, name: o.move, args: o.args, chaos: false } : { ...base, name: 'endTurn', args: [], chaos: false };
  } catch (e) {
    policyThrew.push({ step, error: String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ') });
    return { ...base, name: 'endTurn', args: [], chaos: false };
  }
}
