/**
 * Restricted play: what an item is worth, measured by barring one side's AI
 * from buying it while the other side's may, with everything else held equal.
 * The plain measure — the win rate of the sides that bought it — is biased,
 * since winning sides buy more and dearer items (docs/mechanics-survey.md
 * §3.6); this one plays the same draft with and without the item instead.
 *
 * The drafts. Eight uniform picks in the engine's snake order, as the balance
 * sim samples them, split into the first drafter's four heroes (set A) and the
 * second drafter's (set B). The AI only ever buys from its heroes' default
 * builds (cards/builds.ts), and every build item goes on sale as its hero is
 * drafted, so a draft in which no drafted hero's build holds the item says
 * nothing about it: those are skipped, and counted.
 *
 * The four games. Each kept draft is played four times through the engine's
 * own draftPick, on one match seed (one market) and one Math.random stream:
 * the item banned on A's side, with A in seat 0 and then in seat 1; then
 * banned on B's side, with the same two seatings. The banned side's AI gets
 * `{ strength, banned: {item} }` (it skips the item when it shops its builds),
 * the other side's `{ strength }`. Each side is allowed once and banned once
 * from each seat, so the draft's luck and the seat cancel: if the ban changes
 * nothing the allowed side wins exactly half the games (the two games of one
 * seating then differ in nothing and have one winner).
 *
 * The report, per item and AI strength: the allowed side's win rate over
 * decisive games with a 95% Wilson interval (if anything too wide here: a
 * draft's four games cancel its luck rather than repeat it), the lift (the
 * rate less 50%, in points), and how often the allowed side bought the item at
 * all (the share of games). Beside them the item's tier and price, and its
 * share of hero-builds in the last balance sim (sim-reports/latest.json). A
 * side whose heroes do not build the item loses nothing to its ban, so a draft
 * in which only one side builds it shows half of what the item is worth to
 * that side; the notes give the share of kept drafts in which both sides build
 * it.
 *
 * The verdict, over the strengths run, by the reading rule "nerf what is
 * strong under either AI strength, buff only what is weak under both":
 * underpriced when the lift is above +8 points under either strength; dead
 * when the lift's interval includes 0 under every strength and the item's
 * share of builds in the last sim is under 5%; else fits.
 *
 * Reproducible. Candidate draft k and its match seed come from streams of
 * their own off SEED (the balance sim's derivation for its pair k), so every
 * item walks the same candidate drafts, both strengths play the same kept
 * drafts, and a run split over several processes plays the same games as one;
 * Math.random is pinned to a seeded mulberry32 for every game.
 *
 *   npx vite-node scripts/eval/restricted.ts <itemId...> [--pairs 300]
 *   npx vite-node scripts/eval/restricted.ts --top 12 [--pairs 300]
 *
 * --pairs: seat-mirrored pairs per item and strength (default 300), two per
 * kept draft, so 300 is 150 drafts and 600 games; an odd count is rounded up.
 * --top N: the N items with the highest share of builds in
 * sim-reports/latest.json (the highest over its strengths when it reports
 * several), plus any item above its item gate; item ids may be named beside it.
 * Env: SEED (default 1), AI = normal | hard | both (default both), OUT
 * (default sim-reports/restricted; writes OUT.md and OUT.json, rewritten after
 * every item, so a long run keeps what it has done), LATEST (the sim report the
 * shares of builds are read from, default sim-reports/latest.json). Progress
 * goes to stderr. To run items in parallel, give each process its own OUT.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AiOptions, AiStrength } from '@/ai/heuristic';
import type { CardId, GameState, ItemCard, PlayerID } from '@/engine/types';
import { mulberry32, wilson, type Interval } from './stats';

// ---------------------------------------------------------------- the command line
const USAGE = [
  'Usage: npx vite-node scripts/eval/restricted.ts <itemId...> [--pairs 300]',
  '       npx vite-node scripts/eval/restricted.ts --top 12 [--pairs 300]',
  'Env: SEED (default 1), AI = normal | hard | both (default both), OUT (default sim-reports/restricted: OUT.md, OUT.json),',
  '     LATEST (the sim report read for shares of builds, default sim-reports/latest.json)',
].join('\n');

/** Stop on a command line this script cannot run, saying why. */
function usage(why: string): never {
  console.error(`${why}\n\n${USAGE}`);
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
type Flag = 'pairs' | 'top';
const flags: Partial<Record<Flag, string>> = {};
const named: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const m = /^--(pairs|top)(?:=(.*))?$/.exec(argv[i]);
  if (m) {
    const value = m[2] ?? argv[++i];
    if (value === undefined) usage(`--${m[1]} needs a number.`);
    flags[m[1] as Flag] = value;
  } else if (argv[i].startsWith('-')) {
    usage(`Unknown option ${argv[i]}.`);
  } else {
    named.push(argv[i]);
  }
}
/** A flag's whole number (1 or more), or `fallback` when the flag is not given. */
function whole(flag: Flag, fallback: number): number {
  const value = flags[flag];
  if (value === undefined) return fallback;
  const x = Number(value);
  if (!Number.isInteger(x) || x < 1) usage(`--${flag} takes a whole number of 1 or more, not ${value}.`);
  return x;
}

/** Kept drafts per item and strength: each is two seat-mirrored pairs (the ban on either side). */
const DRAFTS = Math.ceil(whole('pairs', 300) / 2);
const PAIRS = 2 * DRAFTS;
/** Games per item and strength. */
const GAMES = 2 * PAIRS;
const TOP = whole('top', 0);
if (!named.length && !TOP) usage('Name at least one item id, or pass --top N.');
const SEED = Number(process.env.SEED ?? 1);
if (!Number.isFinite(SEED)) usage(`SEED must be a number, not ${process.env.SEED}.`);
const AI = (process.env.AI ?? 'both').trim().toLowerCase();
const STRENGTHS: AiStrength[] =
  AI === 'both' ? ['normal', 'hard'] : AI === 'normal' || AI === 'hard' ? [AI] : usage(`AI must be normal, hard or both, not ${process.env.AI}.`);
/** Where the report goes: a path without its extension. */
const OUT = process.env.OUT || 'sim-reports/restricted';
/** The last balance sim's report: the items' shares of builds. */
const LATEST = process.env.LATEST || 'sim-reports/latest.json';

const MOVES_PER_TURN_CAP = 40; // safety against a stuck turn, as in the balance sim
/** The verdict's numbers: a lift above this is underpriced; a share of builds under this, with no lift, is dead. */
const UNDERPRICED_LIFT = 0.08;
const DEAD_SHARE = 0.05;
/** The item gate when the last sim's report names none. */
const DEFAULT_GATE = 0.4;

// Pin before the engine modules load, as every driver does.
let rand = mulberry32(SEED);
Math.random = () => rand();
const { Client } = await import('boardgame.io/client');
const { DeadlockGame } = await import('@/engine/game');
const { setupGame } = await import('@/engine/actions/setup');
const { enumerateAIMoves } = await import('@/ai/heuristic');
const { CARDS_BY_ID, ITEMS } = await import('@/cards');
const { defaultBuild } = await import('@/cards/builds');
const { PRICE, ROUND_CAP } = await import('@/engine/constants');
const { patronFallen } = await import('@/engine/query');
const rounds = await import('@/engine/rounds');
const { setMatchConfig } = await import('@/storage/matchConfig');

/** The match config for one game: no human seat (the AI plays both, and both
 *  are promoted on the spot) and the draft's match seed. */
const configure = (seed?: number) =>
  setMatchConfig({ heroPreferences: [null, null, null, null], humanSeat: null, ...(seed === undefined ? {} : { seed }) });
configure();

type Seat = PlayerID;
const SEATS: readonly Seat[] = ['0', '1'];
const rival = (s: Seat): Seat => (s === '0' ? '1' : '0');
/** A kept draft's two hero sets: A the first drafter's, B the second's. */
type Side = 'A' | 'B';

// The engine's own draft: its pool and its snake order.
const BLANK = setupGame().draft!;
const POOL = [...BLANK.pool];
const ORDER = [...BLANK.order] as Seat[];
/** The sim's guard, in own turns: past the round cap, which ends every match first. */
const CAP = ROUND_CAP + 1;

const ITEM_BY_ID = new Map<CardId, ItemCard>(ITEMS.map((i) => [i.id, i]));
const nameOf = (id: CardId) => CARDS_BY_ID[id]?.name ?? id;

// ---------------------------------------------------------------- the items
/** One item's shares of hero-builds in the last sim: by the strength its report
 *  names ('all' for a report of one), the highest of them, and whether any is
 *  above that report's item gate. */
interface Share { by: Record<string, number>; max: number; overGate: boolean }

/** The last sim's shares of builds, read off either shape of its report: a
 *  top-level `shop.items.rows`, or `byStrength.<strength>.shop.items.rows`. */
function readShares(path: string): { shares: Map<CardId, Share>; tables: string[] } | { error: string } {
  let report: any;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { error: `cannot read ${path}: ${(e as Error).message}` };
  }
  const tables: { strength: string; items: any }[] = [];
  if (Array.isArray(report?.shop?.items?.rows)) tables.push({ strength: 'all', items: report.shop.items });
  if (report?.byStrength && typeof report.byStrength === 'object') {
    for (const [strength, part] of Object.entries<any>(report.byStrength)) {
      if (Array.isArray(part?.shop?.items?.rows)) tables.push({ strength, items: part.shop.items });
    }
  }
  if (!tables.length) return { error: `${path} has no shop.items.rows, nor byStrength.<strength>.shop.items.rows` };
  const shares = new Map<CardId, Share>();
  for (const { strength, items } of tables) {
    const gate = typeof items.gate === 'number' ? items.gate : DEFAULT_GATE;
    for (const row of items.rows) {
      if (typeof row?.id !== 'string' || typeof row?.share !== 'number') continue;
      const s = shares.get(row.id) ?? { by: {}, max: 0, overGate: false };
      s.by[strength] = row.share;
      s.max = Math.max(s.max, row.share);
      s.overGate ||= row.share > gate;
      shares.set(row.id, s);
    }
  }
  return { shares, tables: tables.map((t) => t.strength) };
}

const latest = readShares(LATEST);
const shareOf = (id: CardId): Share | null => ('shares' in latest ? latest.shares.get(id) ?? null : null);

for (const id of named) {
  if (ITEM_BY_ID.has(id)) continue;
  const key = id.toLowerCase().replace(/[^a-z0-9]/g, '');
  const near = ITEMS.filter((i) => i.id.replace(/_/g, '').includes(key) || i.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key));
  usage(`${id} is not an item id.${near.length ? ` Did you mean ${near.map((i) => i.id).join(', ')}?` : ''}`);
}
let top: CardId[] = [];
if (TOP) {
  if ('error' in latest) usage(`--top reads the last sim's shares of builds, but ${latest.error}.`);
  const ranked = [...latest.shares.entries()]
    .filter(([id]) => ITEM_BY_ID.has(id))
    .sort((a, b) => b[1].max - a[1].max || a[0].localeCompare(b[0]));
  top = [...ranked.slice(0, TOP), ...ranked.slice(TOP).filter(([, s]) => s.overGate)].map(([id]) => id);
}
const RUN: CardId[] = [...new Set([...named, ...top])];

// ---------------------------------------------------------------- drafts
interface Draft {
  /** The candidate's index in the stream off SEED. */
  k: number;
  /** Its Math.random seed, the same for its four games. */
  seed: number;
  /** Its match seed: the market. */
  engineSeed: number;
  a: CardId[];
  b: CardId[];
}
interface Kept extends Draft {
  /** Which sides' heroes have the item in a default build. */
  wants: Record<'a' | 'b', boolean>;
}

/** Candidate draft k: the balance sim's sampling of its pair k. */
function candidate(k: number): Draft {
  const seed = (SEED * 100_003 + k) >>> 0;
  const draw = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const engineSeed = Math.floor(mulberry32((seed ^ 0x85ebca6b) >>> 0)() * 2 ** 32) >>> 0;
  const pool = [...POOL];
  const picks = ORDER.map(() => pool.splice(Math.floor(draw() * pool.length), 1)[0]);
  return { k, seed, engineSeed, a: picks.filter((_, i) => ORDER[i] === ORDER[0]), b: picks.filter((_, i) => ORDER[i] !== ORDER[0]) };
}

const builds = (heroes: CardId[], item: CardId) => heroes.some((h) => defaultBuild(h).includes(item));

// ---------------------------------------------------------------- one game
type End = 'win' | 'mutual' | 'cap' | 'guard';
const ENDS: readonly End[] = ['win', 'mutual', 'cap', 'guard'];

interface Played {
  /** A Patron fell; both fell to one action (settled on what stands); the
   *  round cap decided it; or the sim's guard stopped it (never expected). */
  end: End;
  winner: Seat | null;
  ownTurns: number;
  /** Purchases of the measured item by each seat (moves the engine accepted). */
  buys: Record<Seat, number>;
  /** AI moves the engine refused (the turn was ended instead), and turns cut at the move cap. */
  refused: number;
  cutTurns: number;
}

/** Own turns the first mover has begun: the round in play, a finished game's length. */
const ownTurns = (G: GameState) => rounds.ownTurn(G, rounds.firstMover(G));

/** One game: `seats` says which four heroes each seat drafts, `ai` how each
 *  seat's AI plays. The loop is the balance sim's: the AI's first choice for
 *  whoever is to move, the turn ended when the engine refuses a move. */
function playGame(seats: Record<Seat, CardId[]>, ai: Record<Seat, AiOptions>, seed: number, engineSeed: number, item: CardId): Played {
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

  const buys: Record<Seat, number> = { '0': 0, '1': 0 };
  let refused = 0, cutTurns = 0, movesThisTurn = 0, lastTurn = -1, guard = 0;
  while (!st.ctx.gameover && ownTurns(st.G) <= CAP && guard++ < 50_000) {
    const G: GameState = st.G;
    const ctx = st.ctx;
    if (ctx.turn !== lastTurn) { lastTurn = ctx.turn; movesThisTurn = 0; }
    // An owed promotion comes first whatever the count: the engine will not end the turn before it.
    const cut = movesThisTurn >= MOVES_PER_TURN_CAP && !G.pendingPromotion;
    if (cut) cutTurns++;
    const seat = ctx.currentPlayer as Seat;
    const best = cut ? undefined : enumerateAIMoves(G, ctx, true, ai[seat])[0];
    const move = best?.move ?? 'endTurn';
    const before = st._stateID;
    if (!best || move === 'endTurn') client.moves.endTurn();
    else client.moves[move](...best.args);
    st = client.getState();
    movesThisTurn++;
    // A move the engine refused changes nothing: end the turn so the game goes on.
    if (st._stateID === before && !st.ctx.gameover) {
      if (move !== 'endTurn') refused++;
      client.moves.endTurn();
      st = client.getState();
    } else if (move === 'buy' && best?.args[0] === item) {
      buys[seat]++;
    }
  }
  client.stop();

  const G: GameState = st.G;
  const over = st.ctx.gameover as { winner?: Seat } | undefined;
  const fell = SEATS.filter((s) => patronFallen(G.players[s])).length;
  return {
    end: !over ? 'guard' : fell === 2 ? 'mutual' : fell === 1 ? 'win' : 'cap',
    winner: over?.winner ?? null,
    ownTurns: over ? ownTurns(G) : Math.min(ownTurns(G), CAP),
    buys,
    refused,
    cutTurns,
  };
}

// ---------------------------------------------------------------- the runs
interface GameRecord {
  /** The kept draft's candidate index. */
  draft: number;
  banned: Side;
  /** The seat set A sat in. */
  aSeat: Seat;
  end: End;
  winner: Seat | null;
  /** The allowed side won (null: no winner). */
  allowedWon: boolean | null;
  ownTurns: number;
  /** Purchases of the item by the allowed side and by the banned one (none by construction). */
  buys: { allowed: number; banned: number };
  refused: number;
  cutTurns: number;
}

interface StrengthResult {
  strength: AiStrength;
  games: number;
  decisive: number;
  allowedWins: number;
  /** The allowed side's win rate over decisive games, 95% Wilson. */
  rate: Interval;
  /** rate − 50% (null with no decisive game), and its interval. */
  lift: number | null;
  liftInterval: [number, number];
  /** Games in which the allowed side bought the item, and their share. */
  boughtGames: number;
  bought: number;
  /** The allowed side's purchases of it per game. */
  copies: number;
  /** The banned side's purchases of it: 0 unless the ban leaked. */
  bannedBuys: number;
  ends: Record<End, number>;
  refused: number;
  cutTurns: number;
  msPerGame: number;
  records: GameRecord[];
}

type Verdict = 'underpriced' | 'dead' | 'fits';

interface ItemResult {
  id: CardId;
  name: string;
  slot: ItemCard['slot'];
  tier: ItemCard['tier'];
  price: number;
  /** The component it upgrades from, and what it costs over it. */
  upgradesFrom: CardId | null;
  upgradePrice: number | null;
  /** The pool's heroes whose default build holds it. */
  heroes: CardId[];
  /** Its share of hero-builds in the last sim (the highest over its strengths), and each; null when unread. */
  buildShare: number | null;
  buildShareBy: Record<string, number> | null;
  /** Candidate drafts walked, and the ones kept. */
  sampled: number;
  kept: Kept[];
  /** Kept drafts in which both sides build it. */
  bothSides: number;
  strengths: StrengthResult[];
  verdict: Verdict;
  why: string;
}

const n = (x: number) => x.toLocaleString('en-US');
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ci = (w: Interval) => `${pct(w.p)} [${pct(w.lo)}–${pct(w.hi)}]`;
const pts = (x: number) => `${x < 0 ? '−' : '+'}${Math.abs(x * 100).toFixed(1)}`;
const clock = (s: number) => (s < 90 ? `${s.toFixed(0)} s` : `${(s / 60).toFixed(1)} min`);
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The verdict over the strengths run (see the head of this file). */
function judge(r: Pick<ItemResult, 'heroes' | 'strengths' | 'buildShare'>): { verdict: Verdict; why: string } {
  if (!r.heroes.length) return { verdict: 'dead', why: "in no hero's default build: the AI never buys it, so restricted play cannot measure it" };
  const s = r.strengths;
  const strong = s.filter((x) => x.lift !== null && x.lift > UNDERPRICED_LIFT);
  if (strong.length) return { verdict: 'underpriced', why: `lift above +8 points under ${list(strong.map((x) => `${x.strength} (${pts(x.lift!)})`))}` };
  const flat = s.every((x) => x.rate.lo <= 0.5 && x.rate.hi >= 0.5);
  if (flat) {
    const where = s.length > 1 ? `under ${list(s.map((x) => x.strength))}` : `under ${s[0]?.strength ?? 'any strength'}`;
    if (r.buildShare === null) return { verdict: 'fits', why: `no lift clear of 0 ${where}, but no share of builds to read (${LATEST})` };
    if (r.buildShare < DEAD_SHARE) return { verdict: 'dead', why: `no lift clear of 0 ${where}, and in ${pct(r.buildShare)} of builds` };
    return { verdict: 'fits', why: `no lift clear of 0 ${where}, but in ${pct(r.buildShare)} of builds` };
  }
  const up = s.filter((x) => x.rate.lo > 0.5);
  const down = s.filter((x) => x.rate.hi < 0.5);
  return {
    verdict: 'fits',
    why: [
      up.length ? `lift clear of 0 but not above +8 under ${list(up.map((x) => `${x.strength} (${pts(x.lift!)})`))}` : '',
      down.length ? `lift below 0 under ${list(down.map((x) => `${x.strength} (${pts(x.lift!)})`))}: the side allowed it wins less` : '',
    ].filter(Boolean).join('; '),
  };
}

/** Sum a number over records. */
const total = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

function summarize(strength: AiStrength, records: GameRecord[], ms: number): StrengthResult {
  const decisive = records.filter((r) => r.winner !== null);
  const allowedWins = decisive.filter((r) => r.allowedWon).length;
  const rate = wilson(allowedWins, decisive.length);
  const boughtGames = records.filter((r) => r.buys.allowed > 0).length;
  return {
    strength,
    games: records.length,
    decisive: decisive.length,
    allowedWins,
    rate,
    lift: decisive.length ? rate.p - 0.5 : null,
    liftInterval: [rate.lo - 0.5, rate.hi - 0.5],
    boughtGames,
    bought: records.length ? boughtGames / records.length : 0,
    copies: records.length ? total(records, (r) => r.buys.allowed) / records.length : 0,
    bannedBuys: total(records, (r) => r.buys.banned),
    ends: Object.fromEntries(ENDS.map((e) => [e, records.filter((r) => r.end === e).length])) as Record<End, number>,
    refused: total(records, (r) => r.refused),
    cutTurns: total(records, (r) => r.cutTurns),
    msPerGame: records.length ? ms / records.length : 0,
    records,
  };
}

// ---------------------------------------------------------------- the report
const t0 = performance.now();

function markdown(results: ItemResult[], done: boolean): string {
  const seconds = (performance.now() - t0) / 1000;
  const runs = results.flatMap((r) => r.strengths);
  const speed = STRENGTHS.map((s) => {
    const xs = runs.filter((x) => x.strength === s);
    const games = total(xs, (x) => x.games);
    return games ? `${s} ${(total(xs, (x) => x.msPerGame * x.games) / games).toFixed(0)} ms a game` : '';
  }).filter(Boolean).join(', ');
  let md = `# Restricted play: what an item is worth\n\n`;
  md += `_SEED ${SEED}. ${n(PAIRS)} seat-mirrored pairs per item and AI strength: ${n(DRAFTS)} kept drafts, each played four times (${n(GAMES)} games). AI ${list(STRENGTHS)}${speed ? `; ${speed}` : ''}; ${clock(seconds)} in all.`;
  md += done ? '_\n\n' : ` **Partial: ${results.length} of ${RUN.length} items so far.**_\n\n`;
  md += `Each kept draft (eight uniform picks in the engine's snake order, kept when a drafted hero's default build holds the item) is played four times on one match seed: the item banned on one side's AI and allowed on the other's, each side in turn, each from both seats. If the ban changes nothing, the allowed side wins exactly half. `;
  md += `**Allowed wins** is the allowed side's win rate over decisive games with its 95% Wilson interval; **lift** is that rate less 50%, in points; **bought** is the share of games in which the allowed side bought the item. `;
  md += `**Build share** is the item's share of hero-builds in the last balance sim (${LATEST}${'tables' in latest && latest.tables.length > 1 ? `, the highest of ${list(latest.tables)}` : ''}${'error' in latest ? `: not read, ${latest.error}` : ''}).\n\n`;

  const head = ['Item', 'tier', 'price', 'build share', ...STRENGTHS.flatMap((s) => [`${s}: allowed wins [95% CI]`, 'lift', 'bought']), 'verdict'];
  const align = ['---', '---', '---:', '---:', ...STRENGTHS.flatMap(() => ['---', '---:', '---:']), '---'];
  md += `| ${head.join(' | ')} |\n|${align.join('|')}|\n`;
  for (const r of results) {
    const cells = [r.name, `${r.slot} T${r.tier}`, `${r.price}`, r.buildShare === null ? '—' : pct(r.buildShare)];
    for (const s of STRENGTHS) {
      const x = r.strengths.find((y) => y.strength === s);
      cells.push(...(x ? [x.decisive ? ci(x.rate) : '—', x.lift === null ? '—' : pts(x.lift), pct(x.bought)] : ['—', '—', '—']));
    }
    cells.push(`**${r.verdict}**`);
    md += `| ${cells.join(' | ')} |\n`;
  }
  md += `\nThe verdict, over ${STRENGTHS.length > 1 ? `both strengths` : `the one strength run (${STRENGTHS[0]})`}, by the reading rule "nerf what is strong under either AI strength, buff only what is weak under both": **underpriced** when the lift is above +8 points under either; **dead** when the lift's interval includes 0 under ${STRENGTHS.length > 1 ? 'both' : 'it'} and the build share is under 5%; otherwise **fits**.\n\n`;

  md += `## Notes\n`;
  for (const r of results) {
    const price = r.upgradesFrom ? `${r.price} souls, ${r.upgradePrice} over ${nameOf(r.upgradesFrom)}` : `${r.price} souls`;
    md += `- **${r.name}** (\`${r.id}\`, ${r.slot} T${r.tier}, ${price}): ${r.verdict}, ${r.why}.`;
    if (!r.heroes.length) { md += `\n`; continue; }
    md += ` In the default build of ${list(r.heroes.map(nameOf))}. ${n(r.kept.length)} of ${n(r.sampled)} sampled drafts kept (${pct(r.kept.length / r.sampled)}); both sides build it in ${pct(r.bothSides / r.kept.length)} of them. `;
    md += r.strengths.map((x) => {
      const ends = [`Patron ${n(x.ends.win)}`, x.ends.cap ? `round cap ${n(x.ends.cap)}` : '', x.ends.mutual ? `both Patrons ${n(x.ends.mutual)}` : '', x.ends.guard ? `guard ${n(x.ends.guard)}` : ''].filter(Boolean).join(', ');
      return `${x.strength}: ${n(x.games)} games, ${n(x.decisive)} decisive (${ends}); the allowed side bought it in ${pct(x.bought)} of games (${x.copies.toFixed(2)} copies a game), the banned side ${x.bannedBuys ? `**${n(x.bannedBuys)} times: the ban leaked**` : 'never'}; ${x.msPerGame.toFixed(0)} ms a game.`;
    }).join(' ') + '\n';
  }
  const refused = total(runs, (x) => x.refused);
  const cut = total(runs, (x) => x.cutTurns);
  const guarded = total(runs, (x) => x.ends.guard);
  md += `- The sim stepped in: ${n(refused)} AI moves refused by the engine (the turn was ended instead), ${n(cut)} turns cut at ${MOVES_PER_TURN_CAP} moves, ${n(guarded)} games stopped by the guard.\n`;
  return md;
}

/** OUT.md and OUT.json, as far as the run has got. */
function writeReport(results: ItemResult[], done: boolean): string {
  const md = markdown(results, done);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(`${OUT}.md`, md);
  writeFileSync(`${OUT}.json`, JSON.stringify({
    seed: SEED,
    pairs: PAIRS,
    drafts: DRAFTS,
    gamesPerStrength: GAMES,
    strengths: STRENGTHS,
    done,
    items: RUN,
    seconds: (performance.now() - t0) / 1000,
    rule: { underpricedLift: UNDERPRICED_LIFT, deadShare: DEAD_SHARE },
    latest: 'error' in latest ? { path: LATEST, error: latest.error } : { path: LATEST, tables: latest.tables },
    results,
  }, null, 1));
  return md;
}

// ---------------------------------------------------------------- run
const measurable = RUN.filter((id) => POOL.some((h) => defaultBuild(h).includes(id)));
const allGames = measurable.length * STRENGTHS.length * GAMES;
let gamesDone = 0;
let gameMs = 0;
console.error(`Restricted play: ${RUN.length} item${RUN.length === 1 ? '' : 's'} (${RUN.join(', ')}), ${n(PAIRS)} pairs (${n(GAMES)} games) per item and strength, AI ${STRENGTHS.join(' + ')}, SEED ${SEED}; ${n(allGames)} games in all.`);

const results: ItemResult[] = [];
for (const id of RUN) {
  const item = ITEM_BY_ID.get(id)!;
  const share = shareOf(id);
  const heroes = POOL.filter((h) => defaultBuild(h).includes(id));
  const base = {
    id,
    name: item.name,
    slot: item.slot,
    tier: item.tier,
    price: PRICE[item.tier],
    upgradesFrom: item.upgradesFrom ?? null,
    upgradePrice: item.upgradesFrom && ITEM_BY_ID.has(item.upgradesFrom) ? PRICE[item.tier] - PRICE[ITEM_BY_ID.get(item.upgradesFrom)!.tier] : null,
    heroes,
    buildShare: share?.max ?? ('error' in latest ? null : 0),
    buildShareBy: share?.by ?? null,
  };

  // The drafts: walk the candidates until enough have a hero that builds the item.
  const kept: Kept[] = [];
  let sampled = 0;
  for (let k = 0; heroes.length && kept.length < DRAFTS; k++) {
    sampled++;
    const d = candidate(k);
    const wants = { a: builds(d.a, id), b: builds(d.b, id) };
    if (wants.a || wants.b) kept.push({ ...d, wants });
  }
  if (!heroes.length) console.error(`  ${id}: in no hero's default build; nothing to play.`);

  const ban: ReadonlySet<CardId> = new Set([id]);
  const strengths: StrengthResult[] = [];
  for (const strength of heroes.length ? STRENGTHS : []) {
    const records: GameRecord[] = [];
    const started = performance.now();
    const every = Math.max(1, Math.round(DRAFTS / 10));
    kept.forEach((d, i) => {
      for (const banned of ['A', 'B'] as Side[]) {
        for (const aSeat of SEATS) {
          const bSeat = rival(aSeat);
          const seats = { [aSeat]: d.a, [bSeat]: d.b } as Record<Seat, CardId[]>;
          const bannedSeat = banned === 'A' ? aSeat : bSeat;
          const allowedSeat = rival(bannedSeat);
          const ai = { [bannedSeat]: { strength, banned: ban }, [allowedSeat]: { strength } } as Record<Seat, AiOptions>;
          const g0 = performance.now();
          const g = playGame(seats, ai, d.seed, d.engineSeed, id);
          gameMs += performance.now() - g0;
          gamesDone++;
          records.push({
            draft: d.k,
            banned,
            aSeat,
            end: g.end,
            winner: g.winner,
            allowedWon: g.winner === null ? null : g.winner === allowedSeat,
            ownTurns: g.ownTurns,
            buys: { allowed: g.buys[allowedSeat], banned: g.buys[bannedSeat] },
            refused: g.refused,
            cutTurns: g.cutTurns,
          });
        }
      }
      if ((i + 1) % every === 0 || i + 1 === kept.length) {
        const ms = gameMs / gamesDone;
        process.stderr.write(`  ${id} ${strength}: ${records.length}/${GAMES} games, ${(((performance.now() - started) / records.length)).toFixed(0)} ms a game; about ${clock(((allGames - gamesDone) * ms) / 1000)} left in all\n`);
      }
    });
    strengths.push(summarize(strength, records, performance.now() - started));
  }

  const partial = { ...base, sampled, kept, bothSides: kept.filter((d) => d.wants.a && d.wants.b).length, strengths };
  results.push({ ...partial, ...judge(partial) });
  writeReport(results, false);
}

const md = writeReport(results, true);
console.log(md);
console.log(`Wrote ${OUT}.md and ${OUT}.json (${clock((performance.now() - t0) / 1000)}).`);
