/**
 * Headless AI-vs-AI balance simulator: the numbers the redesign's sim gates
 * are judged on (seat 50 ± 3, every hero 45–55, no item in more than 40% of
 * builds, a mean length of 8–10 own turns with under 2% of games decided by
 * the round cap).
 *
 * The real boardgame.io engine plays every game (income, the shop, abilities,
 * combat, endIf) with the heuristic AI in both seats.
 *
 * Seat-mirrored. A draft is sampled once (eight uniform picks in the engine's
 * snake order, which split the pool into the first drafter's four heroes and
 * the second drafter's four) and played twice through the engine's own
 * draftPick: once as sampled, once with the two sets swapped between the
 * seats. Every set sits in seat 0 once and in seat 1 once, so the draft's luck
 * cancels out of the seat numbers and the seat cancels out of the hero
 * numbers. Both games of a pair run on one match seed (the match config's
 * `seed`), so they share one market: every tier 1 item, the seed's random
 * slice and the eight heroes' signature items. Each set shops from the same
 * market from both seats.
 *
 * Reproducible. The drafts and the match seeds come from streams of their own
 * off SEED, and Math.random (which the engine reads only for a match seed the
 * config does not give, and the AI only for draft picks the sim makes itself)
 * is pinned to a seeded mulberry32 for every game all the same (as in
 * scripts/eval/ai-vs-ai.ts and tests/engine/fuzz/driver.ts), so one SEED
 * replays the run game for game.
 *
 * Own turns. Lengths are counted in own turns (one player's turns) through
 * `ownTurns`, the one place engine turns are converted; it reads the engine's
 * own counting (src/engine/rounds.ts) and `G.firstMover`. Round r holds both
 * players' r-th own turns, so a purchase is made in the round whose number is
 * the buyer's own turn.
 *
 * Seats. The pie rule: seat 0 drafts first and seat 1 moves first, so the
 * report gives the first mover's win rate and the first drafter's, each with
 * its interval (in this engine every game has the same pair, so the two are
 * complements; the report reads each game's `firstMover` all the same).
 *
 * Seat-neutral. The match config names no human seat, so the engine replaces
 * a fallen Active on both sides at once by one rule (the healthiest bench
 * hero, the first slot on a tie). Both Patrons falling to one action is
 * settled by the engine on what stands (structure HP, net worth, the second
 * mover), and counted here as decided, apart.
 *
 * The map. Read off the engine's own record (`G.record`: kills, pushes and the
 * structure HP they took, Mid-Bosses taken and the ones taken while behind on
 * net worth, Rejuvenator revives) and the board: structure HP at the end, the
 * share of games the round cap decides and on what, lead changes measured on
 * total structure HP.
 *
 * The shop. What each seat buys, sells and uses is read off the board after
 * every move (scripts/eval/ledger.ts), not off G.log, which keeps only its
 * last 200 lines: purchases per player, sells, souls banked at the end, actives
 * used, items by share of builds (the item gate) and the round of the first
 * tier 3 and tier 4 purchase.
 *
 *   npx vite-node scripts/balance-sim.ts [games=2500] [guardOwnTurns=13]
 *
 * Env: SEED (default 1). An odd game count is rounded up to whole pairs.
 * Writes sim-reports/latest.md and sim-reports/latest.json (sim-reports/ is
 * gitignored); the JSON keeps every draft and game, so the tables and the fit
 * can be recomputed without replaying anything (a pair's market is
 * `openingMarket(engineSeed)` plus its eight heroes' signatures).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { GameState, ItemSlot, ItemTier, PlayerID, PlayerState } from '@/engine/types';
import { fitTeams, gamesNeeded, mulberry32, wilson, type Interval, type TeamFit } from './eval/stats';

const PAIRS = Math.max(1, Math.ceil((Number(process.argv[2]) || 2500) / 2));
const GAMES = 2 * PAIRS;
const SEED = Number(process.env.SEED ?? 1);
const MOVES_PER_TURN_CAP = 40; // safety against a stuck turn
/** The item gate: no item in more than this share of builds. */
const ITEM_GATE = 0.4;

// Pin before the engine modules load, as every driver does.
let rand = mulberry32(SEED);
Math.random = () => rand();
const { Client } = await import('boardgame.io/client');
const { DeadlockGame } = await import('@/engine/game');
const { setupGame } = await import('@/engine/actions/setup');
const { enumerateAIMoves } = await import('@/ai/heuristic');
const { CARDS_BY_ID, ITEMS } = await import('@/cards');
const { setMatchConfig } = await import('@/storage/matchConfig');
const { heroesOf, patronFallen, standingVerdict, structureHp } = await import('@/engine/query');
const rounds = await import('@/engine/rounds');
const { ROUND_CAP } = await import('@/engine/constants');
const { shopLedger } = await import('./eval/ledger');
/** The sim's own guard, in own turns: past the round cap, which ends every match first
 *  (`MATCH_TURNS`); a game still running there is a stalled one. */
const CAP = Number(process.argv[3]) || ROUND_CAP + 1;

/** The match config for one game: no human seat (the AI plays both, and both
 *  are promoted on the spot) and the pair's match seed. */
const configure = (seed?: number) =>
  setMatchConfig({ heroPreferences: [null, null, null, null], humanSeat: null, ...(seed === undefined ? {} : { seed }) });
configure();

type Seat = PlayerID;
const SEATS: Seat[] = ['0', '1'];
const rival = (s: Seat): Seat => (s === '0' ? '1' : '0');

// The engine's own draft: its pool and its snake order (seat 0 picks first).
const BLANK = setupGame().draft!;
const POOL = [...BLANK.pool];
const ORDER = [...BLANK.order] as Seat[];

/** The seat that moved first: the engine's `G.firstMover` (seat 1, by the pie rule). */
const firstMover = (G: GameState): Seat => rounds.firstMover(G);

/**
 * Engine turns to own turns, the one conversion the report uses: the engine's
 * own `ownTurn` (src/engine/rounds.ts), which reads `G.firstMover`.
 * `G.turnNumber` counts both players' turns; round r holds each player's r-th
 * own turn, the first mover's at engine turn 2r − 1 and the second mover's at
 * 2r. Returns the own turns `seat` has begun: ceil(T / 2) for the first mover,
 * floor(T / 2) for the second. Read for the first mover (the default) it is
 * the round in progress, which is a finished game's length.
 */
function ownTurns(G: GameState, seat: Seat = firstMover(G)): number {
  return rounds.ownTurn(G, seat);
}

/** The engine's loss test (`checkWinner` in query.ts): the Patron fallen. */
function down(ps: PlayerState): boolean {
  return patronFallen(ps);
}

/** One seat's shopping in one game, read off the board (scripts/eval/ledger.ts). */
interface SeatShop {
  /** Items bought; an upgrade over a worn component counts once, as the item it became. */
  buys: number;
  /** Of them, upgrades (paid the difference). */
  upgrades: number;
  /** Purchases by tier: tier 1, 2, 3, 4. */
  tiers: number[];
  /** Souls paid for them. */
  spent: number;
  /** Cards played from the hand onto a hero (the AI plays each as it buys it). */
  plays: number;
  /** Items sold. The AI never sells, so this should stay 0. */
  sells: number;
  /** Active items used. */
  actives: number;
  /** Souls on hand when the game ended. */
  soulsEnd: number;
  /** Cards still in the hand when the game ended (the AI holds none). */
  handEnd: number;
  /** The round of this seat's first purchase of a tier 3 item, and of a tier 4
   *  one (an upgrade into that tier counts); null for none. */
  firstT3: number | null;
  firstT4: number | null;
  /** What each of the seat's heroes bought (its hero-build), by hero id in
   *  pick order, in purchase order. */
  bought: Record<string, string[]>;
}

interface GameRecord {
  pair: number;
  /** The second game of the pair: the first drafter's set sat in seat 1. */
  swapped: boolean;
  /** The match seed both games of the pair ran on: the market's. */
  engineSeed: number;
  /** Each seat's heroes in pick order; the first is its starting Active
   *  unless it is bench-only (Rem). */
  seats: Record<Seat, string[]>;
  /** Seat 0 makes the engine's first pick; this is who took the first turn. */
  firstMover: Seat;
  /** A Patron fell ('win'); both fell to one action ('mutual', settled on what
   *  stands); the round cap decided it ('cap', on what stands); or the sim's
   *  guard stopped it ('guard', never expected). */
  end: 'win' | 'mutual' | 'cap' | 'guard';
  winner: Seat | null;
  /** What settled a game decided on what stands (the round cap, or both
   *  Patrons at once): structure HP, net worth or the second mover. */
  verdict: 'structures' | 'netWorth' | 'secondMover' | null;
  /** Structure HP each seat had standing at the end (of 18), and each
   *  structure's — Guardian, Walker, Patron. */
  structures: Record<Seat, number>;
  track: Record<Seat, number[]>;
  /** The engine's record of the map, per seat. */
  record: GameState['record'];
  /** Each Mid-Boss taken, in order: who took it, the round, and whether the
   *  taker trailed on net worth as it fell. */
  bosses: { seat: Seat; round: number; behind: boolean }[];
  engineTurns: number;
  /** The game's length; a game stopped at the cap counts the cap (the round
   *  after it had begun, but nobody moved in it). */
  ownTurns: number;
  /** Enemy heroes each seat felled. */
  kills: Record<Seat, number>;
  /** Times the lead on total structure HP passed from one seat to the other. */
  leadChanges: number;
  shop: Record<Seat, SeatShop>;
  /** The AI moves the engine accepted, by move. */
  moves: Record<string, number>;
  /** The sim's own interventions: AI moves the engine refused (the turn was
   *  ended instead), turns the per-turn move cap cut short, and a game the move
   *  guard stopped. */
  refused: number;
  cutTurns: number;
  stuck: boolean;
}

type Played = Omit<GameRecord, 'pair' | 'swapped' | 'engineSeed' | 'seats'>;

/** One game of a pair: `seats` says which four heroes each seat drafts. Returns
 *  the record and the market the game was played with. */
function playGame(seats: Record<Seat, string[]>, seed: number, engineSeed: number): { played: Played; market: string[] } {
  rand = mulberry32(seed);
  configure(engineSeed);
  const client = Client({ game: DeadlockGame as any, numPlayers: 2 });
  client.start();
  let st: any = client.getState();

  // The draft, through the engine: each seat takes its own set, in order.
  while (st.G.draft) {
    const d = st.G.draft;
    const picker = d.order[d.currentIndex] as Seat;
    const hero = seats[picker][d.picks[picker].length];
    const before = st._stateID;
    client.moves.draftPick(hero);
    st = client.getState();
    if (st._stateID === before) throw new Error(`the engine refused seat ${picker}'s draft pick ${hero}`);
  }
  const mover = firstMover(st.G);

  // The board is read after every move. The total structure HP difference
  // changing sign is a lead change (a tie keeps the previous leader). Each
  // Mid-Boss taken is read off the record as it is taken, with the round and
  // whether the taker was behind. The ledger diffs the worn items: purchases,
  // sales, uses. (Kills, pushes and revives are the engine's record: a kill the
  // Rejuvenator undoes leaves no respawn timer to see.)
  let leader = 0, leadChanges = 0;
  const bosses: { seat: Seat; round: number; behind: boolean }[] = [];
  let lastRecord = structuredClone(st.G.record) as GameState['record'];
  const observe = (G: GameState) => {
    const sign = Math.sign(structureHp(G.players['0']) - structureHp(G.players['1']));
    if (sign !== 0) {
      if (leader !== 0 && sign !== leader) leadChanges++;
      leader = sign;
    }
    for (const seat of SEATS) {
      const took = G.record[seat].bossKills - lastRecord[seat].bossKills;
      const behind = G.record[seat].bossKillsBehind - lastRecord[seat].bossKillsBehind;
      for (let k = 0; k < took; k++) bosses.push({ seat, round: rounds.round(G), behind: k < behind });
    }
    lastRecord = structuredClone(G.record);
  };
  observe(st.G);
  const ledger = shopLedger(st.G);

  const moves: Record<string, number> = {};
  let refused = 0, cutTurns = 0, movesThisTurn = 0, lastTurn = -1, guard = 0;
  while (!st.ctx.gameover && ownTurns(st.G) <= CAP && guard++ < 50_000) {
    const G: GameState = st.G;
    const ctx = st.ctx;
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }
    // An owed promotion comes first whatever the count: the engine will not end the turn before it.
    const cut = movesThisTurn >= MOVES_PER_TURN_CAP && !G.pendingPromotion;
    if (cut) cutTurns++;
    const best = cut ? undefined : enumerateAIMoves(G, ctx)[0];
    const move = best?.move ?? 'endTurn';
    const before = st._stateID;
    if (!best || move === 'endTurn') client.moves.endTurn();
    else (client.moves as any)[move](...best.args);
    st = client.getState();
    movesThisTurn++;
    // A move the engine refused changes nothing: end the turn so the game goes on.
    if (st._stateID === before && !st.ctx.gameover) {
      if (move !== 'endTurn') refused++;
      client.moves.endTurn();
      st = client.getState();
    } else if (best) {
      moves[move] = (moves[move] ?? 0) + 1;
    }
    observe(st.G);
    ledger.observe(st.G);
  }
  client.stop();

  const G: GameState = st.G;
  const shop = {} as Record<Seat, SeatShop>;
  for (const seat of SEATS) {
    const mine = ledger.purchases.filter((p) => p.seat === seat);
    const bought: Record<string, string[]> = Object.fromEntries(seats[seat].map((id) => [id, [] as string[]]));
    for (const p of mine) if (p.hero) (bought[p.hero] ??= []).push(p.item);
    const first = (tier: ItemTier) => mine.find((p) => p.tier === tier)?.round ?? null;
    shop[seat] = {
      buys: mine.length,
      upgrades: mine.filter((p) => p.upgradeOf).length,
      tiers: ([1, 2, 3, 4] as ItemTier[]).map((t) => mine.filter((p) => p.tier === t).length),
      spent: mine.reduce((s, p) => s + p.paid, 0),
      plays: ledger.plays.filter((e) => e.seat === seat).length,
      sells: ledger.sales.filter((e) => e.seat === seat).length,
      actives: ledger.uses.filter((e) => e.seat === seat).length,
      soulsEnd: G.players[seat].souls,
      handEnd: G.players[seat].hand.length,
      firstT3: first(3),
      firstT4: first(4),
      bought,
    };
  }
  const over = st.ctx.gameover as { winner?: Seat } | undefined;
  const fell = SEATS.filter((s) => down(G.players[s]));
  const end: GameRecord['end'] = !over ? 'guard' : fell.length === 2 ? 'mutual' : fell.length === 1 ? 'win' : 'cap';
  return {
    market: [...G.market],
    played: {
      firstMover: mover,
      end,
      winner: over ? over.winner ?? null : null,
      verdict: end === 'cap' || end === 'mutual' ? standingVerdict(G).by : null,
      structures: { '0': structureHp(G.players['0']), '1': structureHp(G.players['1']) },
      track: { '0': G.players['0'].structures.map((s) => s.hp), '1': G.players['1'].structures.map((s) => s.hp) },
      record: structuredClone(G.record),
      bosses,
      engineTurns: G.turnNumber ?? 0,
      ownTurns: over ? ownTurns(G) : Math.min(ownTurns(G), CAP),
      kills: { '0': G.record['0'].kills, '1': G.record['1'].kills },
      leadChanges,
      shop,
      moves,
      refused,
      cutTurns,
      stuck: !over && ownTurns(G) <= CAP,
    },
  };
}

// ---------------------------------------------------------------- run
console.log(`Balance sim: ${GAMES} seat-mirrored games (${PAIRS} drafts, each from both seats), SEED ${SEED}, cap ${CAP} own turns…`);
const t0 = Date.now();
const drafts: string[][] = [];
const games: GameRecord[] = [];
/** Per item: the games it was on sale in, and the hero-builds those games had. */
const offered = new Map<string, { games: number; heroBuilds: number }>();
for (let pair = 0; pair < PAIRS; pair++) {
  const seed = (SEED * 100_003 + pair) >>> 0;
  const draw = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const engineSeed = Math.floor(mulberry32((seed ^ 0x85ebca6b) >>> 0)() * 2 ** 32) >>> 0;
  const pool = [...POOL];
  const picks = ORDER.map(() => pool.splice(Math.floor(draw() * pool.length), 1)[0]);
  drafts.push(picks);
  const first = picks.filter((_, k) => ORDER[k] === '0');
  const second = picks.filter((_, k) => ORDER[k] === '1');
  for (const swapped of [false, true]) {
    const seats: Record<Seat, string[]> = swapped ? { '0': second, '1': first } : { '0': first, '1': second };
    const { played, market } = playGame(seats, seed, engineSeed);
    games.push({ pair, swapped, engineSeed, seats, ...played });
    for (const id of new Set(market)) {
      const o = offered.get(id) ?? { games: 0, heroBuilds: 0 };
      o.games++;
      o.heroBuilds += seats['0'].length + seats['1'].length;
      offered.set(id, o);
    }
  }
  if ((pair + 1) % 125 === 0) process.stderr.write(`  …${2 * (pair + 1)}/${GAMES}\n`);
}
const seconds = (Date.now() - t0) / 1000;

// ---------------------------------------------------------------- aggregate
const n = (x: number) => x.toLocaleString('en-US');
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ci = (w: Interval) => `${pct(w.p)} [${pct(w.lo)}–${pct(w.hi)}]`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const nameOf = (id: string) => CARDS_BY_ID[id]?.name ?? id;

// Seats. Every game the engine ends has a winner (a Patron falling, or what stands
// at the round cap); only a game the sim's guard stopped has none.
const decided = (g: GameRecord) => g.winner !== null;
const decisive = games.filter(decided);
const wins: Record<Seat, number> = { '0': 0, '1': 0 };
for (const g of decisive) wins[g.winner!]++;
const mutual = games.filter((g) => g.end === 'mutual').length;
const capped = games.filter((g) => g.end === 'cap').length;
const guarded = games.filter((g) => g.end === 'guard').length;
const seat0 = wilson(wins['0'], decisive.length);
const movers = new Set(games.map((g) => g.firstMover));
const seat0Role = movers.size > 1 ? 'drafts first' : movers.has('0') ? 'drafts first and moves first' : 'drafts first, moves second';
// The pie rule's two roles, each read off the game: the seat that took the
// first turn (`G.firstMover`), and the seat that made the first pick (the
// engine's snake order opens on ORDER[0]).
const movedFirst = wilson(decisive.filter((g) => g.winner === g.firstMover).length, decisive.length);
const draftedFirst = wilson(decisive.filter((g) => g.winner === ORDER[0]).length, decisive.length);
const moverSeats = [...movers].sort().map((s) => `seat ${s}`).join(' or ');
const secondSeats = [...new Set(games.map((g) => rival(g.firstMover)))].sort().map((s) => `seat ${s}`).join(' or ');
// A pair whose two games went to the same seat was decided by the seat (each
// set won once); one whose games went to different seats was won twice by the
// same set, from both seats: the draft outweighed the seat.
const sweptBySeat: Record<Seat, number> = { '0': 0, '1': 0 };
let sweptBySet = 0;
for (let p = 0; p < PAIRS; p++) {
  const [a, b] = [games[2 * p], games[2 * p + 1]];
  if (a.end !== 'win' || b.end !== 'win') continue;
  if (a.winner === b.winner) sweptBySeat[a.winner!]++;
  else sweptBySet++;
}
const completePairs = sweptBySeat['0'] + sweptBySeat['1'] + sweptBySet;

// Heroes, counted from both games of every pair.
type Tally = { games: number; decisive: number; wins: number };
const tally = (): Tally => ({ games: 0, decisive: 0, wins: 0 });
const add = (t: Tally, g: GameRecord, seat: Seat) => {
  t.games++;
  if (decided(g)) { t.decisive++; if (g.winner === seat) t.wins++; }
};
const heroTally = new Map(POOL.map((id) => [id, { all: tally(), seat: { '0': tally(), '1': tally() } as Record<Seat, Tally> }]));
for (const g of games) {
  for (const seat of SEATS) {
    for (const id of g.seats[seat]) {
      const h = heroTally.get(id)!;
      add(h.all, g, seat);
      add(h.seat[seat], g, seat);
    }
  }
}
const heroRows = [...heroTally.entries()]
  .map(([id, h]) => ({ id, name: nameOf(id), ...h, rate: wilson(h.all.wins, h.all.decisive) }))
  .sort((a, b) => b.rate.p - a.rate.p);
// A hero with no decisive game (only in a short run) is not measured, so it cannot pass.
const unmeasured = heroRows.filter((r) => r.all.decisive === 0);
const outside = heroRows.filter((r) => r.all.decisive > 0 && (r.rate.p < 0.45 || r.rate.p > 0.55));

// The joint fit: logit P(seat 0 wins) = seat + Σ hero(seat 0) − Σ hero(seat 1).
let fit: TeamFit | null = null;
let fitError = '';
try {
  fit = fitTeams(decisive.map((g) => ({ side0: g.seats['0'], side1: g.seats['1'], side0Won: g.winner === '0' })));
} catch (e) {
  fitError = (e as Error).message;
}

// Pace, in own turns.
const lengths = games.map((g) => g.ownTurns);
const sortedLengths = [...lengths].sort((a, b) => a - b);
const byOwnTurn = new Map<number, number>();
for (const l of lengths) byOwnTurn.set(l, (byOwnTurn.get(l) ?? 0) + 1);
const killsPerGame = mean(games.map((g) => g.kills['0'] + g.kills['1']));

// The map.
const allBosses = games.flatMap((g) => g.bosses.map((b) => ({ g, ...b })));
const withBoss = games.filter((g) => g.bosses.length > 0);
const map = {
  structures: {
    winner: mean(decisive.map((g) => g.structures[g.winner!])),
    loser: mean(decisive.map((g) => g.structures[rival(g.winner!)])),
    seat0: mean(games.map((g) => g.structures['0'])),
    seat1: mean(games.map((g) => g.structures['1'])),
  },
  verdicts: {
    structures: games.filter((g) => g.end === 'cap' && g.verdict === 'structures').length,
    netWorth: games.filter((g) => g.end === 'cap' && g.verdict === 'netWorth').length,
    secondMover: games.filter((g) => g.end === 'cap' && g.verdict === 'secondMover').length,
  },
  pushesPerGame: mean(games.map((g) => g.record['0'].pushes + g.record['1'].pushes)),
  pushDamagePerGame: mean(games.map((g) => g.record['0'].pushDamage + g.record['1'].pushDamage)),
  guardians: mean(games.map((g) => SEATS.filter((s) => g.track[s][0] <= 0).length)),
  walkers: mean(games.map((g) => SEATS.filter((s) => g.track[s][1] <= 0).length)),
  boss: {
    total: allBosses.length,
    perGame: allBosses.length / GAMES,
    anyShare: withBoss.length / GAMES,
    bySeat: { '0': allBosses.filter((b) => b.seat === '0').length, '1': allBosses.filter((b) => b.seat === '1').length } as Record<Seat, number>,
    firstMover: allBosses.filter((b) => b.seat === b.g.firstMover).length,
    secondMover: allBosses.filter((b) => b.seat !== b.g.firstMover).length,
    behind: allBosses.filter((b) => b.behind).length,
    behindShare: allBosses.length ? allBosses.filter((b) => b.behind).length / allBosses.length : 0,
    takerWon: withBoss.length ? withBoss.filter((g) => g.winner === g.bosses[0].seat).length / withBoss.length : 0,
    firstRound: withBoss.length ? mean(withBoss.map((g) => g.bosses[0].round)) : null,
  },
  revivesPerGame: mean(games.map((g) => g.record['0'].revives + g.record['1'].revives)),
};
const killsBySeat: Record<Seat, number> = { '0': mean(games.map((g) => g.kills['0'])), '1': mean(games.map((g) => g.kills['1'])) };
const leadChanges = mean(games.map((g) => g.leadChanges));
const withLeadChange = games.filter((g) => g.leadChanges > 0).length / GAMES;

// The shop. A player is one seat of one game.
interface Player { g: GameRecord; seat: Seat; shop: SeatShop }
const players: Player[] = games.flatMap((g) => SEATS.map((seat) => ({ g, seat, shop: g.shop[seat] })));
const groups = {
  all: players,
  firstMover: players.filter((p) => p.seat === p.g.firstMover),
  secondMover: players.filter((p) => p.seat !== p.g.firstMover),
  seat0: players.filter((p) => p.seat === '0'),
  seat1: players.filter((p) => p.seat === '1'),
  winner: players.filter((p) => decided(p.g) && p.g.winner === p.seat),
  loser: players.filter((p) => decided(p.g) && p.g.winner !== p.seat),
};
type Group = keyof typeof groups;
/** The mean of `f` over each group of players. */
const perPlayer = (f: (s: SeatShop) => number) =>
  Object.fromEntries((Object.keys(groups) as Group[]).map((k) => [k, mean(groups[k].map((p) => f(p.shop)))])) as Record<Group, number>;
const purchases = perPlayer((s) => s.buys);
const upgrades = perPlayer((s) => s.upgrades);
const spent = perPlayer((s) => s.spent);
const tierBuys = [0, 1, 2, 3].map((t) => mean(players.map((p) => p.shop.tiers[t])));
const soulsBanked = perPlayer((s) => s.soulsEnd);
const handLeft = perPlayer((s) => s.handEnd);
const handLeftAny = players.filter((p) => p.shop.handEnd > 0).length;
const activesPerPlayer = perPlayer((s) => s.actives);
const activesPerGame = mean(games.map((g) => g.shop['0'].actives + g.shop['1'].actives));
const sells = players.reduce((s, p) => s + p.shop.sells, 0);

type TierKey = 'firstT3' | 'firstT4';
/** Mean, median, range and the share with none of a list of rounds (null: none). */
const roundStats = (xs: (number | null)[]) => {
  const have = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  return {
    mean: have.length ? mean(have) : null,
    median: have[have.length >> 1] ?? null,
    min: have[0] ?? null,
    max: have[have.length - 1] ?? null,
    none: xs.length - have.length,
    noneShare: xs.length ? (xs.length - have.length) / xs.length : 0,
  };
};
const gameFirst = (g: GameRecord, key: TierKey) => {
  const xs = SEATS.map((s) => g.shop[s][key]).filter((x): x is number => x !== null);
  return xs.length ? Math.min(...xs) : null;
};
/** The round of the first purchase of a tier: each game's, by either seat, and
 *  each player's own, by role. */
const firstTier = (key: TierKey) => ({
  perGame: roundStats(games.map((g) => gameFirst(g, key))),
  firstMover: roundStats(groups.firstMover.map((p) => p.shop[key])),
  secondMover: roundStats(groups.secondMover.map((p) => p.shop[key])),
});
const firstT3 = firstTier('firstT3');
const firstT4 = firstTier('firstT4');

// Items by share of builds. A hero-build is one drafted hero in one game (eight
// a game); an item is in it when that hero bought it at least once.
const heroBuilds = games.reduce((s, g) => s + g.seats['0'].length + g.seats['1'].length, 0);
const itemTally = new Map<string, { builds: number; sides: number; buys: number }>();
const itemOf = (id: string) => itemTally.get(id) ?? itemTally.set(id, { builds: 0, sides: 0, buys: 0 }).get(id)!;
for (const p of players) {
  const side = new Set<string>();
  for (const items of Object.values(p.shop.bought)) {
    for (const id of items) itemOf(id).buys++;
    for (const id of new Set(items)) { itemOf(id).builds++; side.add(id); }
  }
  for (const id of side) itemOf(id).sides++;
}
const itemRows = ITEMS.map((item) => {
  const t = itemTally.get(item.id) ?? { builds: 0, sides: 0, buys: 0 };
  const o = offered.get(item.id) ?? { games: 0, heroBuilds: 0 };
  return {
    id: item.id,
    name: item.name,
    slot: item.slot as ItemSlot,
    tier: item.tier as ItemTier,
    ...t,
    share: heroBuilds ? t.builds / heroBuilds : 0,
    sideShare: players.length ? t.sides / players.length : 0,
    onSale: o.games,
    shareOnSale: o.heroBuilds ? t.builds / o.heroBuilds : 0,
  };
}).sort((a, b) => b.share - a.share || b.buys - a.buys || a.name.localeCompare(b.name));
const boughtRows = itemRows.filter((r) => r.builds > 0);
const neverBought = itemRows.filter((r) => r.builds === 0 && r.onSale > 0);
const neverOnSale = itemRows.filter((r) => r.onSale === 0);
const overGate = itemRows.filter((r) => r.share > ITEM_GATE);
const topItem = itemRows[0];

// Pick order. Each sampled draft's two first picks (pick 1 by the first
// drafter, pick 2 by the second), and the team's result from both seatings.
const firstPicks = new Map(POOL.map((id) => [id, { byFirst: 0, bySecond: 0, team: tally() }]));
const firstPickOf = (id: string) => firstPicks.get(id)!;
for (const picks of drafts) { firstPickOf(picks[0]).byFirst++; firstPickOf(picks[1]).bySecond++; }
for (const g of games) for (const seat of SEATS) add(firstPickOf(g.seats[seat][0]).team, g, seat);
const firstPickRows = [...firstPicks.entries()]
  .map(([id, f]) => ({ id, name: nameOf(id), ...f, rate: wilson(f.team.wins, f.team.decisive) }))
  .sort((a, b) => b.byFirst + b.bySecond - (a.byFirst + a.bySecond) || b.rate.p - a.rate.p);
// Win rate by pick slot: the team that made pick k, over both seatings.
const slots = ORDER.map((drafter, k) => {
  const t = tally();
  for (const g of games) add(t, g, g.swapped ? rival(drafter) : drafter);
  return { slot: k + 1, drafter: drafter === '0' ? 'first' : 'second', ...t, rate: wilson(t.wins, t.decisive) };
});
const slotLine = (drafter: 'first' | 'second') => {
  const rows = slots.filter((s) => s.drafter === drafter);
  return `slots ${rows.map((s) => s.slot).join(', ')} (the ${drafter} drafter's team): ${ci(rows[0].rate)}`;
};

// Precision and the games the gates need.
const medianHeroDecisive = [...heroRows.map((r) => r.all.decisive)].sort((a, b) => a - b)[heroRows.length >> 1] ?? 0;
const halfWidth = (w: Interval) => (w.hi - w.lo) / 2;
const heroShare = ORDER.length / POOL.length; // eight heroes of the pool play each game
const need = { seat: gamesNeeded(0.03), hero: gamesNeeded(0.03, { share: heroShare }) };

// Health: what the sim did that a player would not, and the ledger checked
// against the moves the engine accepted.
const refused = games.reduce((s, g) => s + g.refused, 0);
const cutTurns = games.reduce((s, g) => s + g.cutTurns, 0);
const stuck = games.filter((g) => g.stuck).length;
const accepted: Record<string, number> = {};
for (const g of games) for (const [m, c] of Object.entries(g.moves)) accepted[m] = (accepted[m] ?? 0) + c;
const seen = {
  buy: players.reduce((s, p) => s + p.shop.buys, 0),
  playCard: players.reduce((s, p) => s + p.shop.plays, 0),
  sell: sells,
  activate: players.reduce((s, p) => s + p.shop.actives, 0),
};
const ledgerMismatch = (Object.keys(seen) as (keyof typeof seen)[]).filter((m) => seen[m] !== (accepted[m] ?? 0));

// Gates.
type Verdict = 'PASS' | 'FAIL' | 'not yet';
const gates: { gate: string; target: string; today: string; verdict: Verdict; why?: string }[] = [
  {
    gate: 'Seat', target: 'the first mover wins 50 ± 3%',
    today: ci(movedFirst),
    verdict: Math.abs(movedFirst.p - 0.5) <= 0.03 ? 'PASS' : 'FAIL',
  },
  {
    gate: 'Heroes', target: 'every hero 45–55%',
    today: [
      outside.length ? `${outside.length} of ${heroRows.length} outside: ${outside.map((r) => `${r.name} ${pct(r.rate.p)}`).join(', ')}` : `all ${heroRows.length - unmeasured.length} measured inside`,
      unmeasured.length ? `${unmeasured.length} without a decisive game` : '',
    ].filter(Boolean).join('; '),
    verdict: outside.length === 0 && unmeasured.length === 0 ? 'PASS' : 'FAIL',
  },
  {
    gate: 'Length', target: 'mean 8–10 own turns, under 2% at the cap',
    today: `mean ${mean(lengths).toFixed(1)} own turns, ${pct(capped / GAMES)} decided by the round cap${guarded ? `, ${n(guarded)} stopped by the sim's guard` : ''}`,
    verdict: mean(lengths) >= 8 && mean(lengths) <= 10 && capped / GAMES < 0.02 && guarded === 0 ? 'PASS' : 'FAIL',
  },
  {
    gate: 'Items', target: `no item in more than ${ITEM_GATE * 100}% of builds`,
    today: overGate.length
      ? `${overGate.length} above: ${overGate.map((r) => `${r.name} ${pct(r.share)}`).join(', ')}`
      : topItem && topItem.builds ? `top ${topItem.name}, ${pct(topItem.share)} of hero-builds` : 'nothing bought',
    verdict: overGate.length === 0 && seen.buy > 0 ? 'PASS' : 'FAIL',
  },
];

// ---------------------------------------------------------------- report
const f1 = (x: number | null) => (x === null ? '—' : x.toFixed(1));
/** A per-player mean by role; by seat as well when the roles changed seats. */
const roles = (r: Record<Group, number>, digits = 1) =>
  `the first mover (${moverSeats}) ${r.firstMover.toFixed(digits)}, the second (${secondSeats}) ${r.secondMover.toFixed(digits)}` +
  (movers.size > 1 ? `; seat 0 ${r.seat0.toFixed(digits)}, seat 1 ${r.seat1.toFixed(digits)}` : '');
const tierLine = (label: string, s: ReturnType<typeof firstTier>) =>
  `- First tier ${label} purchase, by either seat: round **${f1(s.perGame.mean)}** on average (median ${s.perGame.median ?? '—'}, ${s.perGame.min ?? '—'}–${s.perGame.max ?? '—'}); none in **${pct(s.perGame.noneShare)}** of games. Each player's own first: the first mover's own turn ${f1(s.firstMover.mean)} (none ${pct(s.firstMover.noneShare)}), the second mover's ${f1(s.secondMover.mean)} (none ${pct(s.secondMover.noneShare)}).\n`;

let md = `# Balance sim: ${n(GAMES)} seat-mirrored games\n\n`;
md += `_SEED ${SEED}. ${n(PAIRS)} sampled drafts (uniform picks in the snake order), each played twice with the two hero sets swapped between the seats, on one match seed per pair (one market for both games). Heuristic AI in both seats. Lengths in own turns (one player's turns; a game that ends on engine turn T lasted ceil(T / 2) of them). Cap ${CAP} own turns each. ${seconds.toFixed(1)} s, ${((seconds * 1000) / GAMES).toFixed(0)} ms a game._\n\n`;

md += `## Gates\n`;
md += `| Gate | Target | Today | |\n|---|---|---|---|\n`;
for (const g of gates) md += `| ${g.gate} | ${g.target} | ${g.today} | **${g.verdict}**${g.why ? `: ${g.why}` : ''} |\n`;
md += `\n`;

md += `## Seats\n`;
md += `- Moved first (${moverSeats}): **${ci(movedFirst)}** over ${n(decisive.length)} decisive games.\n`;
md += `- Drafted first (seat ${ORDER[0]}): **${ci(draftedFirst)}**.\n`;
md += `- Seat 0 (${seat0Role}) win rate: ${ci(seat0)}.\n`;
md += `- Seat 0 won ${n(wins['0'])}, seat 1 won ${n(wins['1'])}; ${n(capped)} were decided by the round cap and ${n(mutual)} by both Patrons falling to one action (both on what stands); ${n(guarded)} were stopped by the sim's guard.\n`;
md += `- Of ${n(completePairs)} pairs with two decisive games: seat 0 won both ${n(sweptBySeat['0'])} times and seat 1 ${n(sweptBySeat['1'])} (the seat decided), and the same hero set won both ${n(sweptBySet)} times (the draft outweighed the seat).\n\n`;

md += `## Heroes (both games of every pair)\n`;
md += `Each hero's games split evenly between the seats. The rate is over decisive games; the interval is 95% Wilson.\n\n`;
md += `| Hero | games | win rate [95% CI] | as seat 0 | as seat 1 | |\n|---|---:|---|---:|---:|---|\n`;
for (const r of heroRows) {
  const s = (seat: Seat) => pct(r.seat[seat].decisive ? r.seat[seat].wins / r.seat[seat].decisive : 0);
  const flag = !r.all.decisive ? 'no decisive game' : r.rate.p > 0.55 ? 'above 55' : r.rate.p < 0.45 ? 'below 45' : '';
  md += `| ${r.name} | ${n(r.all.games)} | ${ci(r.rate)} | ${s('0')} | ${s('1')} | ${flag} |\n`;
}
md += `\n`;

md += `## Joint fit: hero effects net of their teammates\n`;
if (fit) {
  md += `Logistic regression over ${n(fit.games)} decisive games: logit P(seat 0 wins) = seat + Σ hero(seat 0) − Σ hero(seat 1), by Newton steps (${fit.iterations} iterations, ${fit.converged ? 'converged' : 'did not converge'}). `;
  md += `A team's result credits all four of its heroes, so each coefficient is that hero's effect with its teammates and opponents held apart; the effects sum to zero, so each is against the average hero. `;
  md += `"Even matchup" is σ(coefficient): the win rate a hero gives an otherwise average team against an average team, with no seat edge. `;
  md += `Items are not in the fit: the AI buys each hero's default build, so an item's effect cannot be told apart from its heroes'.\n\n`;
  md += `- Seat term: **${fit.seat.coef.toFixed(3)} ± ${fit.seat.se.toFixed(3)}** log-odds, so seat 0 wins ${pct(sigmoid(fit.seat.coef))} between two average teams.\n\n`;
  md += `| Hero | coefficient ± SE | 95% CI | even matchup |\n|---|---:|---|---:|\n`;
  for (const m of fit.members) {
    md += `| ${nameOf(m.id)} | ${m.coef >= 0 ? '+' : ''}${m.coef.toFixed(3)} ± ${m.se.toFixed(3)} | [${(m.coef - 1.96 * m.se).toFixed(3)}, ${(m.coef + 1.96 * m.se).toFixed(3)}] | ${pct(sigmoid(m.coef))} |\n`;
  }
} else {
  md += `Not fitted: ${fitError}. More games separate the heroes.\n`;
}
md += `\n`;

md += `## Pace\n`;
md += `- Length: mean **${mean(lengths).toFixed(1)}** own turns, median ${sortedLengths[sortedLengths.length >> 1] ?? 0}, min ${sortedLengths[0] ?? 0}, max ${sortedLengths[sortedLengths.length - 1] ?? 0}; **${pct(capped / GAMES)}** decided by the round cap (round ${ROUND_CAP}).\n`;
md += `- By own turns: ${[...byOwnTurn.entries()].sort((a, b) => a[0] - b[0]).map(([t, c]) => `${t}: ${n(c)}`).join(' · ')}\n`;
md += `- Kills per game: **${killsPerGame.toFixed(2)}** (seat 0 scores ${killsBySeat['0'].toFixed(2)}, seat 1 ${killsBySeat['1'].toFixed(2)}).\n`;
md += `- Lead changes per game (the total structure HP difference changing sign): **${leadChanges.toFixed(2)}**; ${pct(withLeadChange)} of games have at least one.\n\n`;

md += `## The map\n`;
md += `Read off the engine's record (\`G.record\`) and the board at the end. A track is Guardian 4 · Walker 6 · Patron 8 (18 HP); a kill pushes the victim's level + 1, an empty lane the Active's bullet power, both doubled from round 9.\n\n`;
md += `- Structure HP standing at the end: the winner **${map.structures.winner.toFixed(1)}**, the loser **${map.structures.loser.toFixed(1)}**; by seat, seat 0 ${map.structures.seat0.toFixed(1)}, seat 1 ${map.structures.seat1.toFixed(1)}.\n`;
md += `- Decided by the round cap: **${pct(capped / GAMES)}** of games (${n(capped)}): on structure HP ${n(map.verdicts.structures)}, on net worth ${n(map.verdicts.netWorth)}, for the second mover ${n(map.verdicts.secondMover)}. Both Patrons at once: ${n(mutual)}.\n`;
md += `- Pushes per game: **${map.pushesPerGame.toFixed(2)}**, taking **${map.pushDamagePerGame.toFixed(1)}** structure HP; Guardians felled per game ${map.guardians.toFixed(2)}, Walkers ${map.walkers.toFixed(2)} (the flex slot).\n`;
md += `- Mid-Boss: **${map.boss.perGame.toFixed(2)}** taken per game (${n(map.boss.total)} in all; ${pct(map.boss.anyShare)} of games see one taken). By seat: seat 0 ${n(map.boss.bySeat['0'])}, seat 1 ${n(map.boss.bySeat['1'])}; by role: the first mover ${n(map.boss.firstMover)}, the second ${n(map.boss.secondMover)}. Taken by the side behind on net worth: **${pct(map.boss.behindShare)}** (${n(map.boss.behind)}). The taker won ${pct(map.boss.takerWon)} of the games it was taken in (the first taker's result). First taken in round ${f1(map.boss.firstRound)} on average.\n`;
md += `- Rejuvenator revives per game: **${map.revivesPerGame.toFixed(2)}**.\n\n`;

md += `## Shop\n`;
md += `Read off the board after every move: a card instance that appears (in a hand, where a purchase goes) is a purchase (an upgrade over a component counts once, as the item it became, at the difference it cost), one that goes from a hand onto a hero was played, one that goes with no upgrade holding it was sold, an active whose cooldown rises or whose charges fall was used. A player is one seat of one game; a purchase is made on the buyer's own turn, whose number is the round's.\n\n`;
md += `- Purchases per player per game: **${purchases.all.toFixed(2)}** (${roles(purchases, 2)}), of them ${upgrades.all.toFixed(2)} upgrades; ${spent.all.toFixed(1)} souls spent. By tier: ${tierBuys.map((x, t) => `T${t + 1} ${x.toFixed(2)}`).join(' · ')}.\n`;
md += `- Sells: **${n(sells)}** in all (the AI never sells). Plays from the hand per player: ${perPlayer((s) => s.plays).all.toFixed(2)} (the AI plays each card as it buys it).\n`;
md += `- Cards left in the hand at the end, per player: **${handLeft.all.toFixed(2)}**; ${n(handLeftAny)} of ${n(players.length)} players ended holding any (the AI never holds a card).\n`;
md += `- Souls banked at the end, per player: **${soulsBanked.all.toFixed(1)}** (${roles(soulsBanked)}; the winner ${soulsBanked.winner.toFixed(1)}, the loser ${soulsBanked.loser.toFixed(1)}).\n`;
md += `- Actives used per game (both players): **${activesPerGame.toFixed(2)}**; per player, ${roles(activesPerPlayer, 2)}.\n`;
md += tierLine('3', firstT3);
md += tierLine('4', firstT4);
md += `\n### Items by share of builds\n`;
md += `A hero-build is one drafted hero in one game: eight a game, ${n(heroBuilds)} in all. An item's **share of builds** is the share of hero-builds that bought it at least once (an upgrade counts for the item it became; its component, bought before, for itself); the item gate flags any item above ${ITEM_GATE * 100}%. Also shown: the share of (game, side) pairs in which any of the side's four heroes bought it, how many games had it on sale, and its share of the hero-builds of those games.\n\n`;
md += `| Item | tab, tier | hero-builds | share of builds | (game, side) | on sale (games) | share when on sale | |\n|---|---|---:|---:|---:|---:|---:|---|\n`;
for (const r of boughtRows) {
  md += `| ${r.name} | ${r.slot} T${r.tier} | ${n(r.builds)} | ${pct(r.share)} | ${pct(r.sideShare)} | ${n(r.onSale)} | ${pct(r.shareOnSale)} | ${r.share > ITEM_GATE ? `above ${ITEM_GATE * 100}%` : ''} |\n`;
}
if (!boughtRows.length) md += `| _(nothing bought)_ | | 0 | | | | | |\n`;
if (neverBought.length) md += `\nOn sale but never bought (${neverBought.length}): ${neverBought.map((r) => `${r.name} (${r.slot} T${r.tier}, ${n(r.onSale)} games)`).join(', ')}.\n`;
if (neverOnSale.length) md += `\nNever on sale (${neverOnSale.length}): ${neverOnSale.map((r) => r.name).join(', ')}.\n`;
md += `\n`;

md += `## Draft pick order\n`;
md += `Picks are uniform, so first-pick counts are flat by construction; they are logged so a draft policy can be judged once one replaces the random picks. A team's first pick is its starting Active (Rem, who is bench-only, excepted).\n\n`;
md += `| Hero | first picks (first drafter / second) | team win rate when first pick |\n|---|---:|---|\n`;
for (const r of firstPickRows) md += `| ${r.name} | ${r.byFirst + r.bySecond} (${r.byFirst} / ${r.bySecond}) | ${ci(r.rate)} |\n`;
md += `\nWin rate by pick slot, for the team that made the pick over both seatings: ${slotLine('first')}; ${slotLine('second')}. A team's four slots share its result, so the split is the value of drafting first, which random picks make nothing.\n\n`;

md += `## Precision and health\n`;
md += `- This run: the seat rate is known to ±${(halfWidth(seat0) * 100).toFixed(1)} points, a hero's to about ±${(halfWidth(wilson(medianHeroDecisive / 2, medianHeroDecisive)) * 100).toFixed(1)} (median ${n(medianHeroDecisive)} decisive games).\n`;
md += `- For ±3 points at 95%: the seat needs ${n(need.seat)} decisive games; each hero ${n(need.hero)} games, since ${ORDER.length} of the ${POOL.length} heroes play each game.\n`;
md += `- The sim stepped in: ${n(refused)} AI moves refused by the engine (the turn was ended instead), ${n(cutTurns)} turns cut at ${MOVES_PER_TURN_CAP} moves, ${n(stuck)} games stopped by the move guard.\n`;
md += `- Moves the engine accepted: ${Object.entries(accepted).sort((a, b) => b[1] - a[1]).map(([m, c]) => `${m} ${n(c)}`).join(' · ')}. `;
md += ledgerMismatch.length
  ? `**The board and the moves disagree** on ${ledgerMismatch.map((m) => `${m} (board ${n(seen[m])}, moves ${n(accepted[m] ?? 0)})`).join(', ')}.\n`
  : `The board agrees: ${n(seen.buy)} purchases, ${n(seen.sell)} sales, ${n(seen.activate)} actives used.\n`;

mkdirSync('sim-reports', { recursive: true });
writeFileSync('sim-reports/latest.md', md);
writeFileSync('sim-reports/latest.json', JSON.stringify({
  seed: SEED, games: GAMES, pairs: PAIRS, capOwnTurns: CAP, seconds,
  gates,
  seats: { decisive: decisive.length, wins, mutual, capped, seat0, movedFirst, draftedFirst, pairs: { complete: completePairs, sweptBySeat, sweptBySet } },
  heroes: heroRows.map((r) => ({ id: r.id, name: r.name, ...r.all, rate: r.rate, bySeat: r.seat })),
  fit: fit ?? { error: fitError },
  pace: {
    ownTurns: { mean: mean(lengths), median: sortedLengths[sortedLengths.length >> 1] ?? 0, min: sortedLengths[0] ?? 0, max: sortedLengths[sortedLengths.length - 1] ?? 0, capShare: capped / GAMES, histogram: Object.fromEntries(byOwnTurn) },
    killsPerGame, killsBySeat, leadChanges, withLeadChange,
  },
  map,
  shop: {
    perPlayer: { purchases, upgrades, spent, soulsBanked, handLeft, actives: activesPerPlayer, byTier: tierBuys },
    handLeftAny,
    activesPerGame, sells,
    firstT3, firstT4,
    items: { heroBuilds, gate: ITEM_GATE, rows: itemRows },
  },
  picks: { order: ORDER, firstPicks: firstPickRows.map(({ id, byFirst, bySecond, team, rate }) => ({ id, byFirst, bySecond, team, rate })), slots },
  precision: { seatHalfWidth: halfWidth(seat0), medianHeroDecisive, gamesNeededFor3Points: need },
  health: { refused, cutTurns, stuck, accepted, ledger: seen, ledgerMismatch },
  drafts,
  records: games,
}, null, 1));

console.log('\n' + md);
console.log(`Wrote sim-reports/latest.md and sim-reports/latest.json (${seconds.toFixed(1)} s).`);
