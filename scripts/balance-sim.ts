/**
 * Headless AI-vs-AI balance simulator: the numbers the redesign's sim gates
 * are judged on (seat 50 ± 3, every hero 45–55, and the length and item gates
 * once the engine has its round cap and shop).
 *
 * The real boardgame.io engine plays every game (souls, draws, combat, endIf)
 * with the heuristic AI in both seats.
 *
 * Seat-mirrored. A draft is sampled once (eight uniform picks in the engine's
 * snake order, which split the pool into the first drafter's four heroes and
 * the second drafter's four) and played twice through the engine's own
 * draftPick: once as sampled, once with the two sets swapped between the
 * seats. Every set sits in seat 0 once and in seat 1 once, so the draft's luck
 * cancels out of the seat numbers and the seat cancels out of the hero
 * numbers. Both games of a pair run on one engine seed, so each seat keeps its
 * deck and shuffle while the heroes change places: each set plays both decks.
 *
 * Reproducible. Math.random, which the engine reads for the decks and their
 * shuffles, is pinned to a seeded mulberry32 for every game (as in
 * scripts/eval/ai-vs-ai.ts and tests/engine/fuzz/driver.ts), and the drafts
 * draw from a stream of their own, so one SEED replays the run game for game.
 *
 * Own turns. Lengths are counted in own turns (one player's turns) through
 * `ownTurns`, the one place engine turns are converted; it reads the engine's
 * own counting (src/engine/rounds.ts) and `G.firstMover`.
 *
 * Seats. The pie rule: seat 0 drafts first and seat 1 moves first, so the
 * report gives the first mover's win rate and the first drafter's, each with
 * its interval (in this engine every game has the same pair, so the two are
 * complements; the report reads each game's `firstMover` all the same).
 *
 * Seat-neutral. The match config names no human seat, so the engine replaces
 * a fallen Active on both sides at once by one rule (the healthiest bench
 * hero, the first slot on a tie). Both patrons falling to one action, which the
 * engine settles on the HP left and then for the second mover, is scored here
 * as a draw.
 *
 *   npx vite-node scripts/balance-sim.ts [games=2500] [capOwnTurns=20]
 *
 * Env: SEED (default 1). An odd game count is rounded up to whole pairs.
 * Writes sim-reports/latest.md and sim-reports/latest.json (sim-reports/ is
 * gitignored); the JSON keeps every draft and game, so the tables and the fit
 * can be recomputed without replaying anything.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { CardInstance, GameState, PlayerID, PlayerState } from '@/engine/types';
import { fitTeams, gamesNeeded, mulberry32, wilson, type Interval, type TeamFit } from './eval/stats';

const PAIRS = Math.max(1, Math.ceil((Number(process.argv[2]) || 2500) / 2));
const GAMES = 2 * PAIRS;
/** Own turns each before the sim calls a game at the cap (the old 40 engine turns). */
const CAP = Number(process.argv[3]) || 20;
const SEED = Number(process.env.SEED ?? 1);
const MOVES_PER_TURN_CAP = 40; // safety against a stuck turn

// Pin before the engine modules load: setup, the decks and the shuffles read Math.random.
let rand = mulberry32(SEED);
Math.random = () => rand();
const { Client } = await import('boardgame.io/client');
const { DeadlockGame } = await import('@/engine/game');
const { setupGame } = await import('@/engine/actions/setup');
const { enumerateAIMoves } = await import('@/ai/heuristic');
const { CARDS_BY_ID } = await import('@/cards');
const { setMatchConfig } = await import('@/storage/matchConfig');
const rounds = await import('@/engine/rounds');
// The AI plays both seats: no human seat, so both are promoted on the spot.
setMatchConfig({ playerDeck: [], heroPreferences: [null, null, null, null], humanSeat: null });

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

const isHero = (c: CardInstance | null): c is CardInstance => !!c && CARDS_BY_ID[c.cardId]?.type === 'hero';

/** Every hero a side has, wherever it stands: the Active, the bench, and a Rem
 *  merged into an ally (she rides in its `attached` list, not on a slot). */
function heroesOf(ps: PlayerState): CardInstance[] {
  const slotted = [ps.active, ...ps.bench].filter(isHero);
  return [...slotted, ...slotted.flatMap((c) => (c.attached ?? []).filter((a) => a.remMergeTurnsLeft != null))];
}

/** The engine's loss test (`checkWinner` in query.ts): the patron at 0 HP. */
function down(ps: PlayerState): boolean {
  return ps.hp <= 0;
}

interface GameRecord {
  pair: number;
  /** The second game of the pair: the first drafter's set sat in seat 1. */
  swapped: boolean;
  /** Each seat's heroes in pick order; the first is its starting Active
   *  unless it is bench-only (Rem). */
  seats: Record<Seat, string[]>;
  /** Seat 0 makes the engine's first pick; this is who took the first turn. */
  firstMover: Seat;
  /** A win; both patrons down to one action (scored here as a draw); or still
   *  running at the cap. */
  end: 'win' | 'mutual' | 'cap';
  winner: Seat | null;
  engineTurns: number;
  /** The game's length; a game stopped at the cap counts the cap (the round
   *  after it had begun, but nobody moved in it). */
  ownTurns: number;
  /** Enemy heroes each seat felled. */
  kills: Record<Seat, number>;
  /** Times the patron-HP lead passed from one seat to the other. */
  leadChanges: number;
  /** The sim's own interventions: AI moves the engine refused (the turn was
   *  ended instead), turns the per-turn move cap cut short, and a game the move
   *  guard stopped. */
  refused: number;
  cutTurns: number;
  stuck: boolean;
}

/** One game of a pair: `seats` says which four heroes each seat drafts. */
function playGame(seats: Record<Seat, string[]>, seed: number): Omit<GameRecord, 'pair' | 'swapped' | 'seats'> {
  rand = mulberry32(seed);
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

  // The board is read after every move. A hero whose respawn timer appears, or
  // restarts higher than it was, has fallen: a kill for the other seat. The
  // patron-HP difference changing sign is a lead change (a tie keeps the
  // previous leader).
  const timers = new Map<string, number>();
  const kills: Record<Seat, number> = { '0': 0, '1': 0 };
  let leader = 0, leadChanges = 0;
  const observe = (G: GameState) => {
    for (const seat of SEATS) {
      for (const h of heroesOf(G.players[seat])) {
        const now = h.respawnTurnsLeft ?? 0;
        const was = timers.get(h.iid) ?? 0;
        if (now > 0 && (was === 0 || now > was)) kills[rival(seat)]++;
        timers.set(h.iid, now);
      }
    }
    const sign = Math.sign(G.players['0'].hp - G.players['1'].hp);
    if (sign !== 0) {
      if (leader !== 0 && sign !== leader) leadChanges++;
      leader = sign;
    }
  };
  observe(st.G);

  let refused = 0, cutTurns = 0, movesThisTurn = 0, lastTurn = -1, guard = 0;
  while (!st.ctx.gameover && ownTurns(st.G) <= CAP && guard++ < 50_000) {
    const G: GameState = st.G;
    const ctx = st.ctx;
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }
    // An owed promotion comes first whatever the count: the engine will not end the turn before it.
    const cut = movesThisTurn >= MOVES_PER_TURN_CAP && !G.pendingPromotion;
    if (cut) cutTurns++;
    const best = cut ? undefined : enumerateAIMoves(G, ctx)[0];
    const before = st._stateID;
    if (!best || best.move === 'endTurn') client.moves.endTurn();
    else (client.moves as any)[best.move](...best.args);
    st = client.getState();
    movesThisTurn++;
    // A move the engine refused changes nothing: end the turn so the game goes on.
    if (st._stateID === before && !st.ctx.gameover) {
      if (best && best.move !== 'endTurn') refused++;
      client.moves.endTurn();
      st = client.getState();
    }
    observe(st.G);
  }
  client.stop();

  const G: GameState = st.G;
  const over = st.ctx.gameover as { winner?: Seat } | undefined;
  const mutual = !!over && down(G.players['0']) && down(G.players['1']);
  return {
    firstMover: mover,
    end: !over ? 'cap' : mutual ? 'mutual' : 'win',
    winner: over && !mutual ? over.winner ?? null : null,
    engineTurns: G.turnNumber ?? 0,
    ownTurns: over ? ownTurns(G) : Math.min(ownTurns(G), CAP),
    kills,
    leadChanges,
    refused,
    cutTurns,
    stuck: !over && ownTurns(G) <= CAP,
  };
}

// ---------------------------------------------------------------- run
console.log(`Balance sim: ${GAMES} seat-mirrored games (${PAIRS} drafts, each from both seats), SEED ${SEED}, cap ${CAP} own turns…`);
const t0 = Date.now();
const drafts: string[][] = [];
const games: GameRecord[] = [];
for (let pair = 0; pair < PAIRS; pair++) {
  const seed = (SEED * 100_003 + pair) >>> 0;
  const draw = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const pool = [...POOL];
  const picks = ORDER.map(() => pool.splice(Math.floor(draw() * pool.length), 1)[0]);
  drafts.push(picks);
  const first = picks.filter((_, k) => ORDER[k] === '0');
  const second = picks.filter((_, k) => ORDER[k] === '1');
  for (const swapped of [false, true]) {
    const seats: Record<Seat, string[]> = swapped ? { '0': second, '1': first } : { '0': first, '1': second };
    games.push({ pair, swapped, seats, ...playGame(seats, seed) });
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

// Seats.
const decisive = games.filter((g) => g.end === 'win');
const wins: Record<Seat, number> = { '0': 0, '1': 0 };
for (const g of decisive) wins[g.winner!]++;
const mutual = games.filter((g) => g.end === 'mutual').length;
const capped = games.filter((g) => g.end === 'cap').length;
const seat0 = wilson(wins['0'], decisive.length);
const movers = new Set(games.map((g) => g.firstMover));
const seat0Role = movers.size > 1 ? 'drafts first' : movers.has('0') ? 'drafts first and moves first' : 'drafts first, moves second';
// The pie rule's two roles, each read off the game: the seat that took the
// first turn (`G.firstMover`), and the seat that made the first pick (the
// engine's snake order opens on ORDER[0]).
const movedFirst = wilson(decisive.filter((g) => g.winner === g.firstMover).length, decisive.length);
const draftedFirst = wilson(decisive.filter((g) => g.winner === ORDER[0]).length, decisive.length);
const moverSeats = [...movers].sort().map((s) => `seat ${s}`).join(' or ');
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
  if (g.end === 'win') { t.decisive++; if (g.winner === seat) t.wins++; }
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
const killsBySeat: Record<Seat, number> = { '0': mean(games.map((g) => g.kills['0'])), '1': mean(games.map((g) => g.kills['1'])) };
const leadChanges = mean(games.map((g) => g.leadChanges));
const withLeadChange = games.filter((g) => g.leadChanges > 0).length / GAMES;

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

// Health: what the sim did that a player would not.
const refused = games.reduce((s, g) => s + g.refused, 0);
const cutTurns = games.reduce((s, g) => s + g.cutTurns, 0);
const stuck = games.filter((g) => g.stuck).length;

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
    today: `mean ${mean(lengths).toFixed(1)} own turns, ${pct(capped / GAMES)} at the sim's cap`,
    verdict: 'not yet',
    why: `the gate is set for the redesigned match, which ends by rule after round 12 and is paced by the shop; today's engine has neither, so games end when a patron falls (to kills and to pushes into an empty lane) and the only cap is this sim's stalemate guard (${CAP} own turns)`,
  },
  {
    gate: 'Items', target: 'no item in more than 40% of builds',
    today: '—',
    verdict: 'not yet',
    why: 'there is no shop or build yet: items come from a random archetype deck, not from a choice',
  },
];

// ---------------------------------------------------------------- report
let md = `# Balance sim: ${n(GAMES)} seat-mirrored games\n\n`;
md += `_SEED ${SEED}. ${n(PAIRS)} sampled drafts (uniform picks in the snake order), each played twice with the two hero sets swapped between the seats, on one engine seed per pair. Heuristic AI in both seats. Lengths in own turns (one player's turns; a game that ends on engine turn T lasted ceil(T / 2) of them). Cap ${CAP} own turns each. ${seconds.toFixed(1)} s, ${((seconds * 1000) / GAMES).toFixed(0)} ms a game._\n\n`;

md += `## Gates\n`;
md += `| Gate | Target | Today | |\n|---|---|---|---|\n`;
for (const g of gates) md += `| ${g.gate} | ${g.target} | ${g.today} | **${g.verdict}**${g.why ? `: ${g.why}` : ''} |\n`;
md += `\n`;

md += `## Seats\n`;
md += `- Moved first (${moverSeats}): **${ci(movedFirst)}** over ${n(decisive.length)} decisive games.\n`;
md += `- Drafted first (seat ${ORDER[0]}): **${ci(draftedFirst)}**.\n`;
md += `- Seat 0 (${seat0Role}) win rate: ${ci(seat0)}.\n`;
md += `- Seat 0 won ${n(wins['0'])}, seat 1 won ${n(wins['1'])}; ${n(mutual)} ended with both patrons falling to one action (draws here); ${n(capped)} reached the cap.\n`;
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
  md += `"Even matchup" is σ(coefficient): the win rate a hero gives an otherwise average team against an average team, with no seat edge.\n\n`;
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
md += `- Length: mean **${mean(lengths).toFixed(1)}** own turns, median ${sortedLengths[sortedLengths.length >> 1] ?? 0}, min ${sortedLengths[0] ?? 0}, max ${sortedLengths[sortedLengths.length - 1] ?? 0}; **${pct(capped / GAMES)}** reached the cap (all games, a capped game counted at the cap).\n`;
md += `- By own turns: ${[...byOwnTurn.entries()].sort((a, b) => a[0] - b[0]).map(([t, c]) => `${t}: ${n(c)}`).join(' · ')}\n`;
md += `- Kills per game: **${killsPerGame.toFixed(2)}** (seat 0 scores ${killsBySeat['0'].toFixed(2)}, seat 1 ${killsBySeat['1'].toFixed(2)}).\n`;
md += `- Lead changes per game (the patron-HP difference changing sign): **${leadChanges.toFixed(2)}**; ${pct(withLeadChange)} of games have at least one.\n\n`;

md += `## Draft pick order\n`;
md += `Picks are uniform, so first-pick counts are flat by construction; they are logged so a draft policy can be judged once one replaces the random picks. A team's first pick is its starting Active (Rem, who is bench-only, excepted).\n\n`;
md += `| Hero | first picks (first drafter / second) | team win rate when first pick |\n|---|---:|---|\n`;
for (const r of firstPickRows) md += `| ${r.name} | ${r.byFirst + r.bySecond} (${r.byFirst} / ${r.bySecond}) | ${ci(r.rate)} |\n`;
md += `\nWin rate by pick slot, for the team that made the pick over both seatings: ${slotLine('first')}; ${slotLine('second')}. A team's four slots share its result, so the split is the value of drafting first, which random picks make nothing.\n\n`;

md += `## Precision and health\n`;
md += `- This run: the seat rate is known to ±${(halfWidth(seat0) * 100).toFixed(1)} points, a hero's to about ±${(halfWidth(wilson(medianHeroDecisive / 2, medianHeroDecisive)) * 100).toFixed(1)} (median ${n(medianHeroDecisive)} decisive games).\n`;
md += `- For ±3 points at 95%: the seat needs ${n(need.seat)} decisive games; each hero ${n(need.hero)} games, since ${ORDER.length} of the ${POOL.length} heroes play each game.\n`;
md += `- The sim stepped in: ${n(refused)} AI moves refused by the engine (the turn was ended instead), ${n(cutTurns)} turns cut at ${MOVES_PER_TURN_CAP} moves, ${n(stuck)} games stopped by the move guard.\n`;

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
  picks: { order: ORDER, firstPicks: firstPickRows.map(({ id, byFirst, bySecond, team, rate }) => ({ id, byFirst, bySecond, team, rate })), slots },
  precision: { seatHalfWidth: halfWidth(seat0), medianHeroDecisive, gamesNeededFor3Points: need },
  health: { refused, cutTurns, stuck },
  drafts,
  records: games,
}, null, 1));

console.log('\n' + md);
console.log(`Wrote sim-reports/latest.md and sim-reports/latest.json (${seconds.toFixed(1)} s).`);
