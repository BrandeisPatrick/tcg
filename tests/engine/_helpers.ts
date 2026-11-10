import { Client } from 'boardgame.io/client';
import type { CardId, GameState, CardInstance, PlayerID, TrackHp } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { buildPlayer, freshMap } from '@/engine/actions/setup';
import { allocatorFor, allocatorOf, newCounters } from '@/engine/ids';
import { INVALID, perform } from '@/engine/engine';
import { blocked } from '@/engine/legality';
import { findWornItem, seatOf, structureHp } from '@/engine/query';
import { newTrack } from '@/engine/map';
import { attachItem, makeInstance, syncVitalitySpike } from '@/engine/instances';
import { playCost } from '@/engine/legality';
import { CARDS_BY_ID, itemCard } from '@/cards';
import { HARD_CC_CHARGES } from '@/engine/constants';
import { setMatchConfig } from '@/storage/matchConfig';

let testIids = 1;
/**
 * An instance id for a card a test builds by hand. The counter is the test's
 * own (a game's ids come from `G.counters`, as 'i…'), and the 't' prefix keeps
 * the two from ever colliding in one game. Pass a prefix for readable ids.
 */
export function nextTestIid(prefix = 't'): string {
  return `${prefix}${testIids++}`;
}

/** The two rosters the engine tests were written against: seat 0 Haze
 *  (Active), Vindicta, Lash, Paige; seat 1 Abrams (Active), Dynamo, Kelvin,
 *  Seven. */
export const TEST_ROSTERS: Record<PlayerID, CardId[]> = {
  '0': ['hero_haze', 'hero_vindicta', 'hero_lash', 'hero_paige'],
  '1': ['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven'],
};

/** The seed the test games draw their shuffles from (the deck, the opening
 *  hand's hero swap, where an upgrade goes in the deck). */
export const TEST_SEED = 11395;

/** The structure HP `pid` has standing (Guardian + Walker + Patron). */
export function structuresOf(G: GameState, pid: PlayerID): number {
  return structureHp(G.players[pid]);
}

/** Put `pid` on a track of its own: `hp` by structure, the rest off it (a
 *  Patron at 1 makes the next push the win). */
export function setTrack(G: GameState, pid: PlayerID, hp: TrackHp) {
  G.players[pid].structures = newTrack(hp);
}

/**
 * Battle-ready GameState with both rosters already on the board (no draft), on
 * P0's first turn as the second mover (the pie rule: P1 took engine turn 1),
 * so P0 may play cards, attack, use abilities and items, and retreat. Nobody
 * wears anything, every deck, hand and discard pile is empty and nobody has
 * souls. `setup()` itself returns empty players + a pending draft, so tests
 * that read `players['0'].active` must build a ready state via this helper
 * instead.
 */
export function freshReadyGame(): GameState {
  const counters = newCounters();
  const ids = allocatorFor(counters);
  const G: GameState = {
    counters,
    players: {
      '0': buildPlayer(ids, '0', TEST_ROSTERS['0']),
      '1': buildPlayer(ids, '1', TEST_ROSTERS['1']),
    },
    // Turn 2, P0's: the first mover (P1) forgoes first strike on turn 1, P0 may attack.
    turnNumber: 2,
    firstMover: '1',
    humanSeat: '0',
    log: [{ turn: 1, text: 'Battle begins.' }],
    draft: null,
    draftTurnsOffset: 0,
    seed: TEST_SEED,
    attackUsed: false,
    retreatUsed: false,
    ...freshMap(),
    action: null,
    fx: [],
  };
  return G;
}

/**
 * Turn the Mid-Boss on for this game (`G.midBoss`): MID_BOSS_ENABLED is off
 * for now, and the tests that cover the boss bring it back for themselves.
 * Returns `G`.
 */
export function midBossOn(G: GameState): GameState {
  G.midBoss = true;
  return G;
}

/**
 * Put the item `itemId` on `hero` directly, as if played earlier: its bonus on
 * the hero, the Vitality spike synced, an active ready to use (no cooldown) —
 * or, with `cooldown`, cooling for that many own turns — and a hard crowd-control
 * active with its full charges. No souls, no hand: for tests that need a hero
 * wearing something. Returns the item instance.
 */
export function giveItem(G: GameState, hero: CardInstance, itemId: CardId, opts: { cooldown?: number } = {}): CardInstance {
  const data = itemCard(itemId);
  if (!data) throw new Error(`not an item: ${itemId}`);
  const item = makeInstance(allocatorOf(G), itemId, seatOf(hero), 'equipment');
  if (data.type === 'spell') {
    if (data.hardCC) item.charges = HARD_CC_CHARGES;
    else if (opts.cooldown) item.cooldowns = { [itemId]: opts.cooldown };
  }
  attachItem(hero, item);
  syncVitalitySpike(hero);
  return item;
}

/**
 * Give `bearer` (left out: `pid`'s Active) the active item `itemId`, ready
 * (`giveItem`), and use it as `pid` — aimed at `targetIid` when it takes a
 * target — through the engine's front door: the bearer's one ability of the
 * turn, in the act step. Throws, naming the reason, when the engine refuses.
 * Returns the item instance (now cooling down, or a charge spent).
 */
export function useItem(G: GameState, pid: PlayerID, itemId: CardId, targetIid?: string, bearer?: CardInstance): CardInstance {
  const hero = bearer ?? G.players[pid].active;
  if (!hero) throw new Error(`P${pid} has no Active to wear ${itemId}`);
  const item = giveItem(G, hero, itemId);
  const a = { type: 'activate' as const, itemIid: item.iid, targetIid };
  const why = blocked(G, pid, a);
  if (perform(G, pid, a) === INVALID) throw new Error(`${itemId} was refused: ${why}`);
  return item;
}

/**
 * Play `card` from `pid`'s hand onto its hero `hero` through the engine's
 * front door (`pid`'s turn, souls enough for its price). Throws, naming the
 * reason, when the engine refuses. Returns the card, which the hero now wears.
 */
export function playItem(G: GameState, pid: PlayerID, card: CardInstance, hero: CardInstance, upgradeId?: CardId): CardInstance {
  const a = upgradeId ? { type: 'playCard' as const, cardIid: card.iid, heroIid: hero.iid, upgradeId } : { type: 'playCard' as const, cardIid: card.iid, heroIid: hero.iid };
  const why = blocked(G, pid, a);
  if (perform(G, pid, a) === INVALID) throw new Error(`playing ${card.cardId} on ${hero.cardId} was refused: ${why}`);
  const worn = findWornItem(G, card.iid, pid);
  if (!worn || worn.bearer.iid !== hero.iid) throw new Error(`${card.cardId} is not on ${hero.cardId} after the play`);
  return worn.item;
}

/**
 * Deal `itemId` into `pid`'s hand and play it at once onto `hero` through the
 * engine's front door, the souls its play costs (`playCost`) handed over first
 * so the side's own souls come out where they were: an item put on a hero the
 * way a player puts one on, for tests about what it does once worn. Throws,
 * naming the reason, when the engine refuses. Returns the item the hero now
 * wears.
 */
export function playNew(G: GameState, pid: PlayerID, itemId: CardId, hero: CardInstance): CardInstance {
  const card = giveCard(G, pid, itemId);
  G.players[pid].souls += playCost(hero, itemId);
  return playItem(G, pid, card, hero);
}

/**
 * Put a card of `itemId` (an item, or a hero) straight into `pid`'s hand, as
 * a draw or a Story reward puts one there. No souls, no deck. Returns the card.
 */
export function giveCard(G: GameState, pid: PlayerID, cardId: CardId): CardInstance {
  if (!CARDS_BY_ID[cardId]) throw new Error(`no such card: ${cardId}`);
  const card = makeInstance(allocatorOf(G), cardId, pid, 'hand');
  G.players[pid].hand.push(card);
  return card;
}

/** Put fresh cards of `ids` on top of `pid`'s deck, the first on top: the
 *  next draws, in order. Returns the cards. */
export function stackDeck(G: GameState, pid: PlayerID, ids: CardId[]): CardInstance[] {
  const made = ids.map((id) => makeInstance(allocatorOf(G), id, pid, 'deck'));
  G.players[pid].deck.push(...[...made].reverse());
  return made;
}

/**
 * Make the engine's `setup()` build a battle-ready match (no draft) so a
 * boardgame.io Client boots straight into turn 1 with both boards populated.
 * Uses the story branch (which bypasses the draft) with a zero stat buff so it
 * behaves like a normal match, TEST_SEED for its shuffles, and empty decks
 * with no opening hand, so nothing is drawn that a test did not put there.
 * Call in beforeAll for Client-based specs.
 */
export function configureReadyMatch(): void {
  setMatchConfig({
    heroPreferences: [null, null, null, null],
    seed: TEST_SEED,
    story: {
      playerHeroes: TEST_ROSTERS['0'],
      enemyHeroes: TEST_ROSTERS['1'],
      enemyBuff: { atk: 0, hp: 0 },
      playerDeck: [],
      enemyDeck: [],
      openingHand: 0,
    },
  });
}

/**
 * A boardgame.io Client of the ready match (`configureReadyMatch` must have
 * run), started — on seat 0's turn 1 (seat 0 moves first in a scripted match,
 * with its first income banked).
 */
export function readyClient() {
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  return client;
}

/** End the turn on `client`: the next player's turn begins. */
export function passTurn(client: ReturnType<typeof readyClient>): void {
  client.moves.endTurn();
}

/**
 * Make the turn's attack for `pid` through the engine's front door. A test that
 * means to have an attack made hears about it if the engine refuses.
 */
export function makeAttack(G: GameState, pid: PlayerID): void {
  const why = blocked(G, pid, { type: 'attack' });
  if (perform(G, pid, { type: 'attack' }) === INVALID) throw new Error(`the attack was refused: ${why}`);
}

/** Build a single hero instance directly (for tests that want a specific hero). */
export function makeHero(
  cardId: string,
  ownerId: PlayerID,
  zone: CardInstance['zone'] = 'active',
  slot: 0 | 1 | 2 | 3 = 0,
): CardInstance {
  const data = CARDS_BY_ID[cardId] as any;
  return {
    iid: nextTestIid(),
    cardId,
    ownerId,
    zone,
    slot,
    hp: data?.hp ?? 10,
    hpMax: data?.hp ?? 10,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
    level: 1,
    exp: 0,
  };
}

/**
 * Make `cardId` a bench-only hero (`flags.benchOnly`) until the returned undo is
 * called. No card is bench-only since Rem stands in the lane (Patrick,
 * 2026-11-09); the engine keeps the rule, dormant, and its tests run it on a
 * card flagged this way.
 */
export function flagBenchOnly(cardId: CardId = 'hero_rem'): () => void {
  const card = CARDS_BY_ID[cardId] as { flags?: { benchOnly?: boolean } };
  const was = card.flags;
  card.flags = { ...was, benchOnly: true };
  return () => {
    if (was === undefined) delete card.flags;
    else card.flags = was;
  };
}

/** `fn` run with `cardId` flagged bench-only (`flagBenchOnly`), undone after. */
export function withBenchOnly<T>(cardId: CardId, fn: () => T): T {
  const undo = flagBenchOnly(cardId);
  try {
    return fn();
  } finally {
    undo();
  }
}
