/**
 * Building a game: the rosters, the decks and opening hands, the opening state
 * and the pre-match snake draft. boardgame.io's `setup` and the `draftPick`
 * move call these (game.ts).
 */
import type { CardId, CardInstance, GameState, PlayerID, PlayerState, TrackHp } from '../types';
import { CARDS_BY_ID, HEROES, itemCard } from '@/cards';
import { getMatchConfig, scriptedSetup, type HeroStatOverride, type StorySetup } from '@/storage/matchConfig';
import { allocatorFor, allocatorOf, newCounters, type IidAllocator } from '../ids';
import { makeInstance } from '../instances';
import { pushLog } from '../log';
import { otherPlayer } from '../query';
import { dealOpeningHand, drawCards, fillDeck, shuffleDeck, sideDeckIds, stockDeck } from '../deck';
import { newRecord, newTrack } from '../map';
import { newSeed } from '../rng';
import { BOSS_SPAWN_ROUND, MID_BOSS_ENABLED, OPENING_DRAW, OPENING_HAND, SOULS_START } from '../constants';
import { pushFx } from '../fx';

/** Empty PlayerState used while the pre-match draft is running — no heroes
 *  yet. Replaced via `buildPlayer()` once the 8th draft pick lands. */
function makeEmptyPlayer(pid: PlayerID): PlayerState {
  return {
    id: pid,
    structures: newTrack(),
    souls: SOULS_START,
    deck: [],
    hand: [],
    discard: [],
    active: null,
    bench: [null, null, null],
    flexSlot: false,
    reviveCredits: 0,
    reviveUntilRound: 0,
  };
}

/** The map's part of a fresh game: a Mid-Boss in the match or not (`midBoss`:
 *  MID_BOSS_ENABLED unless the setup says), none until round BOSS_SPAWN_ROUND,
 *  no cap reached, nothing on the record. (Hand-built test states use it too.) */
export function freshMap(midBoss: boolean = MID_BOSS_ENABLED): Pick<GameState, 'midBoss' | 'boss' | 'bossDamage' | 'bossLastHit' | 'bossRespawnRound' | 'bossAttacker' | 'capped' | 'record'> {
  return {
    midBoss,
    boss: null,
    bossDamage: { '0': 0, '1': 0 },
    bossLastHit: null,
    bossRespawnRound: BOSS_SPAWN_ROUND,
    bossAttacker: null,
    capped: false,
    record: { '0': newRecord(), '1': newRecord() },
  };
}

/** The track a scripted match gives a side: its own by structure, else a
 *  Patron alone at the setup's patron HP, else the standard one. */
function scriptedTrack(story: StorySetup, pid: PlayerID): TrackHp | undefined {
  const rival = pid === '1';
  const own = rival ? story.enemyStructures ?? story.structures : story.structures;
  if (own) return own;
  const patron = rival ? story.enemyPatronHp ?? story.patronHp : story.patronHp;
  return patron === undefined ? undefined : { patron };
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
  /** The side's track, when it is not the standard one (Story pacing, a lesson). */
  track?: TrackHp;
  /** Souls held before the first income (SOULS_START when left out). */
  souls?: number;
}

/** Build a PlayerState with a 1-4 hero roster on the board: heroes beyond the
 *  first fill the bench (length 3, padded with null). A scripted match (a
 *  Story fight, a lesson: 1-4 heroes, optional buff and track) and the tests'
 *  hand-built boards start this way; a drafted match starts with its heroes in
 *  the deck instead (`openDraftedMatch`). Deck, hand and discard pile start
 *  empty. `ids` names every card it makes (see ids.ts). */
export function buildPlayer(ids: IidAllocator, pid: PlayerID, heroes: string[], opts: RosterOpts = {}): PlayerState {
  const roster = heroes.slice(0, 4);
  // A bench-only hero (`flags.benchOnly`) must never start as the Active —
  // pick the first one that may stand there; the rest fill the bench in draft
  // order. No card is bench-only now (Rem stands in the lane, 2026-11-09), so
  // the first hero named is the Active.
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

  return {
    id: pid,
    structures: newTrack(opts.track),
    souls: opts.souls ?? SOULS_START,
    deck: [],
    hand: [],
    discard: [],
    active,
    bench,
    flexSlot: false,
    reviveCredits: 0,
    reviveUntilRound: 0,
  };
}

/** Put the cards a scripted match hands `pid` (a Story reward) into its hand,
 *  on top of its opening hand, to be played onto a hero like any other. An id
 *  that names no item is left out. */
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

/** The deck the human seat brings (`G.playerDeck`): the match config's saved
 *  deck, copied, when there is a human seat to bring it. */
function playerDeck(seat: PlayerID | null): CardId[] | undefined {
  const deck = getMatchConfig().deck;
  if (seat === null || !deck || deck.length === 0) return undefined;
  return [...deck];
}

/** The hero of `ps`'s deck an AI seat opens with in the lane: the one with
 *  the most HP, then the most attack (never a bench-only one). */
function openingPick(ps: PlayerState): CardInstance | undefined {
  const heroes = ps.deck.filter((c) => {
    const d = CARDS_BY_ID[c.cardId];
    return d?.type === 'hero' && !d.flags?.benchOnly;
  });
  const score = (c: CardInstance) => {
    const d = CARDS_BY_ID[c.cardId];
    return d?.type === 'hero' ? d.hp * 10 + d.atk : 0;
  };
  return heroes.reduce<CardInstance | undefined>((best, c) => (!best || score(c) > score(best) ? c : best), undefined);
}

/** The hero `card`, from `pid`'s deck, takes the lane as its side's first
 *  Active. The board flies it there (`place`). */
export function laneFromDeck(G: GameState, pid: PlayerID, card: CardInstance) {
  const ps = G.players[pid];
  ps.deck = ps.deck.filter((c) => c !== card);
  ps.active = card;
  card.zone = 'active';
  card.slot = 0;
  pushLog(G, `P${pid} put ${CARDS_BY_ID[card.cardId]?.name ?? card.cardId} in the lane.`);
  pushFx(G, { kind: 'deck', what: 'place', pid, iid: card.iid, cardId: card.cardId, slot: 0 });
}

/**
 * The rest of a drafted match's opening, once the human seat has chosen its
 * first Active (`chooseActive`) — or at once, when no seat is human: every
 * AI seat picks its own from its deck (`openingPick`), then each side's deck
 * is shuffled, with the motion, and each draws OPENING_DRAW. The Pocket
 * hero guarantee has nothing to do here: every side opens with a hero in the
 * lane.
 */
export function finishOpening(G: GameState) {
  const seats = ['0', '1'] as PlayerID[];
  for (const pid of seats) {
    if (G.players[pid].active) continue;
    const pick = openingPick(G.players[pid]);
    if (pick) laneFromDeck(G, pid, pick);
  }
  for (const pid of seats) {
    shuffleDeck(G, pid);
    drawCards(G, pid, OPENING_DRAW);
  }
}

/**
 * The drafted match's opening, as the last pick lands: each side's deck is
 * stocked with its items (`sideDeckIds`: the human seat's saved deck, else
 * one made from its heroes' builds) and its four drafted heroes, unshuffled
 * and unseen. The human seat is asked for its first Active from among its
 * drafted heroes (`G.pendingActive`, answered by `chooseActive`); with no
 * human seat the AI's picks are made at once and the opening finishes here
 * (`finishOpening`: the AI's pick, the shuffles, the deal of OPENING_DRAW).
 * Nothing else is on the board.
 */
export function openDraftedMatch(G: GameState, picks: Record<PlayerID, CardId[]>) {
  for (const pid of ['0', '1'] as PlayerID[]) {
    G.players[pid] = makeEmptyPlayer(pid);
    stockDeck(G, pid, [...sideDeckIds(G, pid, picks[pid]), ...picks[pid]]);
  }
  const human = G.humanSeat;
  if (human && openingPick(G.players[human])) G.pendingActive = human;
  else finishOpening(G);
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
 *  given rosters, each with a deck of items and its opening hand. The match
 *  seed (the config's, else a fresh one) draws every shuffle. A drafted
 *  match's first mover is the
 *  seat that drafts second; a scripted one opens on seat 0's turn, so its first
 *  mover is set to make that turn seat 0's: seat 0 on an odd opening turn,
 *  seat 1 on an even one (seat 0 is then the second mover, as in a drafted
 *  match). */
export function setupGame(): GameState {
  const counters = newCounters();
  const seed = (getMatchConfig().seed ?? newSeed()) >>> 0;
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
        '0': buildPlayer(ids, '0', story.playerHeroes, { track: scriptedTrack(story, '0'), souls: story.playerSouls }),
        '1': buildPlayer(ids, '1', story.enemyHeroes, { buff: story.enemyBuff, track: scriptedTrack(story, '1'), souls: story.enemySouls }),
      },
      turnNumber: startTurn,
      firstMover: startTurn % 2 === 1 ? '0' : '1',
      humanSeat: human,
      log: [{ turn: startTurn, text: 'Battle begins.' }],
      draft: null,
      // realTurn = ctx.turn - offset, and ctx.turn starts at 1.
      draftTurnsOffset: 1 - startTurn,
      seed,
      playerBuilds: playerBuilds(human),
      playerDeck: playerDeck(human),
      attackUsed: false,
      retreatUsed: false,
      ...freshMap(story.midBoss ?? getMatchConfig().midBoss ?? MID_BOSS_ENABLED),
      action: null,
      fx: [],
    };
    // A lesson builds the exact situation it teaches: custom attack,
    // health and experience per hero, by roster position.
    applyHeroStats(G.players['0'], story.playerHeroStats);
    applyHeroStats(G.players['1'], story.enemyHeroStats);
    // The rosters stand on the board; each deck holds items only. A lesson
    // names its decks (top first, unshuffled); a Story fight's come from the
    // sides' decks and builds.
    const decks: Record<PlayerID, CardId[] | undefined> = { '0': story.playerDeck, '1': story.enemyDeck };
    const rosters: Record<PlayerID, CardId[]> = { '0': story.playerHeroes, '1': story.enemyHeroes };
    for (const pid of ['0', '1'] as PlayerID[]) {
      const own = decks[pid];
      fillDeck(G, pid, own ?? sideDeckIds(G, pid, rosters[pid]), { ordered: !!own });
      dealOpeningHand(G, pid, story.openingHand ?? OPENING_HAND);
    }
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
    playerBuilds: playerBuilds(human),
    playerDeck: playerDeck(human),
    attackUsed: false,
    retreatUsed: false,
    ...freshMap(getMatchConfig().midBoss ?? MID_BOSS_ENABLED),
    action: null,
    fx: [],
  };
}

/**
 * Pre-match hero draft pick (`draftPickBlocked` has checked it is the player's
 * pick from the pool). Removes the hero from the pool and says whether the
 * boardgame.io turn ends — when the next pick belongs to the other player — or
 * stays (consecutive snake picks). The final pick opens the match
 * (`openDraftedMatch`: the decks, the opening hands, the first Actives) and
 * always ends the draft's turn: the next boardgame.io turn is the first
 * mover's (seat 0 picks last, seat 1 moves first), and it opens as engine turn
 * 1 with a real `beginTurn` — income, the draw, ticks and all.
 */
export function draftPick(G: GameState, ctx: { currentPlayer: string; turn: number }, heroId: string): { endTurn: boolean } {
  const draft = G.draft!;
  const picker = draft.order[draft.currentIndex];

  draft.pool = draft.pool.filter((id) => id !== heroId);
  draft.picks[picker].push(heroId);
  draft.currentIndex++;

  const data = CARDS_BY_ID[heroId];
  pushLog(G, `P${picker} drafted ${data?.name ?? heroId}.`);

  if (draft.currentIndex >= draft.order.length) {
    openDraftedMatch(G, draft.picks);
    G.draft = null;
    // The draft's turn ends now — or, the human seat's first Active still
    // owed, once it is chosen (`chooseActive` ends it); the next boardgame.io
    // turn is engine turn 1. Until it begins the match is still at turn 0
    // (no turn's end to run).
    G.draftTurnsOffset = ctx.turn;
    pushLog(G, 'Match begins.');
    return { endTurn: !G.pendingActive };
  }

  return { endTurn: draft.order[draft.currentIndex] !== ctx.currentPlayer };
}
