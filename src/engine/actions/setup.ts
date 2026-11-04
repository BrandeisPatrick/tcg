/**
 * Building a game: the rosters, the market, the opening state and the
 * pre-match snake draft. boardgame.io's `setup` and the `draftPick` move call
 * these (game.ts).
 */
import type { CardId, CardInstance, GameState, PlayerID, PlayerState } from '../types';
import { CARDS_BY_ID, HEROES, itemCard } from '@/cards';
import { getMatchConfig, scriptedSetup, type HeroStatOverride } from '@/storage/matchConfig';
import { allocatorFor, allocatorOf, newCounters, type IidAllocator } from '../ids';
import { makeInstance } from '../instances';
import { pushLog } from '../log';
import { otherPlayer } from '../query';
import { addHero, openingMarket } from '../market';
import { newSeed } from '../rng';
import { PATRON_HP, SOULS_START } from '../constants';

/** Empty PlayerState used while the pre-match draft is running — no heroes
 *  yet. Replaced via `buildPlayer()` once the 8th draft pick lands. */
function makeEmptyPlayer(pid: PlayerID): PlayerState {
  return {
    id: pid,
    hp: PATRON_HP,
    hpMax: PATRON_HP,
    souls: SOULS_START,
    hand: [],
    active: null,
    bench: [null, null, null],
    flexSlot: false,
  };
}

/** Snake draft order for 4 picks per player (8 total).
 *  P0 picks at indexes 0, 3, 4, 7; P1 picks at 1, 2, 5, 6. The pie rule: the
 *  seat that drafts first moves second, so seat 1 takes the first turn — and
 *  seat 0's last pick ends the draft's turn and hands it over. */
const DRAFT_ORDER: PlayerID[] = ['0', '1', '1', '0', '0', '1', '1', '0'];

/** The seat a person plays, from the match config: seat 0 unless the config
 *  says otherwise (null: the AI plays both seats). */
function humanSeat(): PlayerID | null {
  const seat = getMatchConfig().humanSeat;
  return seat === undefined ? '0' : seat;
}

interface RosterOpts {
  /** Flat stat buff applied to every hero (Story mode enemy scaling). */
  buff?: { atk: number; hp: number };
  /** Patron-HP override for this match (Story pacing). */
  patronHp?: number;
  /** Souls held before the first income (SOULS_START when left out). */
  souls?: number;
}

/** Build a PlayerState from a 1-4 hero roster. Heroes beyond the first fill
 *  the bench (length 3, padded with null). Used by both the draft path
 *  (exactly 4 heroes) and Story mode (1-4 heroes, optional buff/patron HP).
 *  `ids` names every card it makes (see ids.ts). */
export function buildPlayer(ids: IidAllocator, pid: PlayerID, heroes: string[], opts: RosterOpts = {}): PlayerState {
  const roster = heroes.slice(0, 4);
  // A bench-only hero (Rem) must never start as the Active — pick the first
  // non-bench-only hero for the Active slot; the rest fill the bench in draft
  // order. (Without this, drafting Rem first put her in the Active slot, which
  // breaks her merge skill that assumes she's on the bench.)
  const isBenchOnly = (id: string) => !!(CARDS_BY_ID[id] as { flags?: { benchOnly?: boolean } } | undefined)?.flags?.benchOnly;
  const activeIdx = roster.findIndex((id) => !isBenchOnly(id));
  const activeId = roster[activeIdx >= 0 ? activeIdx : 0];
  const benchIds = roster.filter((_, i) => i !== (activeIdx >= 0 ? activeIdx : 0));
  const active = makeInstance(ids, activeId, pid, 'active', 0);
  const bench: (CardInstance | null)[] = [null, null, null];
  for (let i = 0; i < benchIds.length && i < 3; i++) {
    bench[i] = makeInstance(ids, benchIds[i], pid, 'bench', (i + 1) as 1 | 2 | 3);
  }

  const buff = opts.buff;
  if (buff && (buff.atk || buff.hp)) {
    for (const c of [active, ...bench]) {
      if (!c) continue;
      if (buff.atk) c.atkMod += buff.atk;
      if (buff.hp) { c.hpMax += buff.hp; c.hp += buff.hp; }
    }
  }

  const patronHp = opts.patronHp ?? PATRON_HP;
  return {
    id: pid,
    hp: patronHp,
    hpMax: patronHp,
    souls: opts.souls ?? SOULS_START,
    hand: [],
    active,
    bench,
    flexSlot: false,
  };
}

/** Put the free cards a scripted match hands `pid` (a Story reward) into its
 *  hand, to be played onto a hero like any other: free, so no purchase is
 *  recorded on them. An id that names no item is left out. */
function giveCards(G: GameState, pid: PlayerID, itemIds: CardId[]) {
  for (const id of itemIds) {
    const data = itemCard(id);
    if (!data) continue;
    G.players[pid].hand.push(makeInstance(allocatorOf(G), id, pid, 'hand'));
    pushLog(G, `P${pid} starts with ${data.name} in hand.`);
  }
}

/** The builds the human seat brings (`G.playerBuilds`): the match config's,
 *  copied, when there is a human seat to bring them. */
function playerBuilds(seat: PlayerID | null): Record<CardId, CardId[]> | undefined {
  const builds = getMatchConfig().builds;
  if (seat === null || !builds) return undefined;
  return Object.fromEntries(Object.entries(builds).map(([hero, ids]) => [hero, [...ids]]));
}

/** Overwrite a roster's printed numbers (Active first, then the bench).
 *  Attack is stored as a modifier over the card's base, so everything that
 *  reads `effectiveAtk` sees the custom value. */
function applyHeroStats(ps: PlayerState, stats?: (HeroStatOverride | undefined)[]) {
  if (!stats) return;
  const roster = [ps.active, ...ps.bench];
  stats.forEach((o, i) => {
    const c = roster[i];
    if (!c || !o) return;
    const data = CARDS_BY_ID[c.cardId];
    const baseAtk = data?.type === 'hero' ? data.atk : 0;
    if (o.atk !== undefined) c.atkMod = o.atk - baseAtk;
    if (o.hpMax !== undefined) { c.hpMax = o.hpMax; c.hp = o.hpMax; }
    if (o.hp !== undefined) { c.hp = o.hp; if (c.hpMax < o.hp) c.hpMax = o.hp; }
    if (o.exp !== undefined) c.exp = o.exp;
  });
}

/** The opening state of a game: a pre-match draft, or — for a scripted match
 *  (a Story node or tutorial lesson) — both players built straight from the
 *  given rosters, both rosters' signatures and builds on sale. Either way the
 *  match seed (the config's, else a fresh one) draws the market now, before
 *  any pick. A drafted match's first mover is the
 *  seat that drafts second; a scripted one opens on seat 0's turn, so its first
 *  mover is set to make that turn seat 0's: seat 0 on an odd opening turn,
 *  seat 1 on an even one (seat 0 is then the second mover, as in a drafted
 *  match). */
export function setupGame(): GameState {
  const counters = newCounters();
  const seed = (getMatchConfig().seed ?? newSeed()) >>> 0;
  const market = openingMarket(seed);
  const human = humanSeat();
  // Scripted match (Story node or tutorial lesson): skip the draft entirely
  // and build both players from the given rosters. Enemy heroes carry the
  // setup's scaling buff.
  const story = scriptedSetup();

  if (story) {
    const ids = allocatorFor(counters);
    // A lesson may open mid-match: the turn counter starts at `startTurn`
    // (from turn 2 on the first turn has its attack).
    const startTurn = Math.max(1, Math.floor(story.startTurn ?? 1));
    const G: GameState = {
      counters,
      players: {
        '0': buildPlayer(ids, '0', story.playerHeroes, { patronHp: story.patronHp, souls: story.playerSouls }),
        '1': buildPlayer(ids, '1', story.enemyHeroes, { buff: story.enemyBuff, patronHp: story.enemyPatronHp ?? story.patronHp, souls: story.enemySouls }),
      },
      turnNumber: startTurn,
      firstMover: startTurn % 2 === 1 ? '0' : '1',
      humanSeat: human,
      log: [{ turn: startTurn, text: 'Battle begins.' }],
      draft: null,
      // realTurn = ctx.turn - offset, and ctx.turn starts at 1.
      draftTurnsOffset: 1 - startTurn,
      seed,
      market,
      playerBuilds: playerBuilds(human),
      step: 'shop',
      attackUsed: false,
      retreatUsed: false,
      action: null,
      fx: [],
    };
    for (const id of story.playerHeroes) addHero(G, '0', id);
    for (const id of story.enemyHeroes) addHero(G, '1', id);
    // A lesson builds the exact situation it teaches: custom attack,
    // health and experience per hero, by roster position.
    applyHeroStats(G.players['0'], story.playerHeroStats);
    applyHeroStats(G.players['1'], story.enemyHeroStats);
    giveCards(G, '0', story.playerItems ?? []);
    return G;
  }

  return {
    counters,
    players: {
      '0': makeEmptyPlayer('0'),
      '1': makeEmptyPlayer('1'),
    },
    // The draft comes before the match's first turn: engine turn 0.
    turnNumber: 0,
    firstMover: otherPlayer(DRAFT_ORDER[0]),
    humanSeat: human,
    log: [{ turn: 0, text: 'Draft begins.' }],
    draft: {
      pool: HEROES.map((h) => h.id),
      order: [...DRAFT_ORDER],
      currentIndex: 0,
      picks: { '0': [], '1': [] },
    },
    draftTurnsOffset: 0,  // set in draftPick when draft completes
    seed,
    market,
    playerBuilds: playerBuilds(human),
    step: 'shop',
    attackUsed: false,
    retreatUsed: false,
    action: null,
    fx: [],
  };
}

/**
 * Pre-match hero draft pick (`draftPickBlocked` has checked it is the player's
 * pick from the pool). Removes the hero from the pool, puts its signature
 * items and its build on sale (`addHero`: the picker's own build of it), and
 * says whether the boardgame.io turn ends — when the next
 * pick belongs to the other player — or stays (consecutive snake picks). The
 * final pick builds both players from the drafted heroes and always ends the
 * draft's turn: the next boardgame.io turn is the first mover's (seat 0 picks
 * last, seat 1 moves first), and it opens as engine turn 1 with a real
 * `beginTurn` — income, ticks and all.
 */
export function draftPick(G: GameState, ctx: { currentPlayer: string; turn: number }, heroId: string): { endTurn: boolean } {
  const draft = G.draft!;
  const picker = draft.order[draft.currentIndex];

  draft.pool = draft.pool.filter((id) => id !== heroId);
  draft.picks[picker].push(heroId);
  draft.currentIndex++;
  addHero(G, picker, heroId);

  const data = CARDS_BY_ID[heroId];
  pushLog(G, `P${picker} drafted ${data?.name ?? heroId}.`);

  if (draft.currentIndex >= draft.order.length) {
    const ids = allocatorOf(G);
    G.players['0'] = buildPlayer(ids, '0', draft.picks['0']);
    G.players['1'] = buildPlayer(ids, '1', draft.picks['1']);
    G.draft = null;
    // The draft's turn ends now; the next boardgame.io turn is engine turn 1.
    // Until it begins the match is still at turn 0 (no turn's end to run).
    G.draftTurnsOffset = ctx.turn;
    pushLog(G, 'Match begins.');
    return { endTurn: true };
  }

  return { endTurn: draft.order[draft.currentIndex] !== ctx.currentPlayer };
}
