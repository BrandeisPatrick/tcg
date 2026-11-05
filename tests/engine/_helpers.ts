import { Client } from 'boardgame.io/client';
import type { CardId, GameState, CardInstance, PlayerID, TrackHp } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { buildPlayer, freshMap } from '@/engine/actions/setup';
import { allocatorFor, allocatorOf, newCounters } from '@/engine/ids';
import { INVALID, perform } from '@/engine/engine';
import { blocked } from '@/engine/legality';
import { findWornItem, seatOf, structureHp } from '@/engine/query';
import { newTrack } from '@/engine/map';
import { addSignatures, openingMarket } from '@/engine/market';
import { attachItem, makeInstance, syncVitalitySpike } from '@/engine/instances';
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

/** The seed the test games draw their market from: its random slice sells
 *  what the tests buy beside the rosters' signatures (Titanic Magazine,
 *  Improved Spirit, Heroic Aura, Alchemical Fire, Boundless Spirit) and Haze's
 *  build item Intensifying Magazine, so no build of the rosters asks for a
 *  stand-in. Seed 1 did until the catalogue grew to the full shop, and 120238
 *  until the slice drew a tier-5 item a tab (both 2026-11-05). */
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
 * Battle-ready GameState with both rosters already on the board (no draft),
 * in the act step of P0's first turn as the second mover (the pie rule: P1
 * took engine turn 1), so P0 may attack, use abilities and items, and retreat.
 * Nobody wears anything, both hands are empty and nobody has souls. The market
 * is TEST_SEED's with both rosters' signature items on sale — signatures only:
 * this is a hand-built state, so unlike a drafted or scripted match
 * (`addHero`, market.ts) the heroes' builds are not added, which leaves the
 * tests that need an item off sale plenty to pick from.
 * `setup()` itself returns empty players + a pending draft, so tests that read
 * `players['0'].active` must build a ready state via this helper instead. Pass
 * `{ step: 'shop' }` for the shop step.
 */
export function freshReadyGame(opts: { step?: GameState['step'] } = {}): GameState {
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
    market: openingMarket(TEST_SEED),
    step: opts.step ?? 'act',
    attackUsed: false,
    retreatUsed: false,
    ...freshMap(),
    action: null,
    fx: [],
  };
  for (const id of [...TEST_ROSTERS['0'], ...TEST_ROSTERS['1']]) addSignatures(G, id);
  return G;
}

/**
 * Put the item `itemId` on `hero` directly, as if bought earlier: its bonus on
 * the hero, the Vitality spike synced, an active ready to use (no cooldown) —
 * or, with `cooldown`, cooling for that many own turns — and a hard crowd-control
 * active with its full charges. No souls, no market, no step: for tests that
 * need a hero wearing something. Returns the item instance.
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
 * Buy `itemId` as `pid` through the engine's front door (the shop step of
 * `pid`'s turn, souls enough): the price is paid and the card goes to the
 * hand. Throws, naming the reason, when the engine refuses. Returns the card,
 * now the last of `pid`'s hand.
 */
export function buyToHand(G: GameState, pid: PlayerID, itemId: CardId): CardInstance {
  const a = { type: 'buy' as const, itemId };
  const why = blocked(G, pid, a);
  if (perform(G, pid, a) === INVALID) throw new Error(`buying ${itemId} was refused: ${why}`);
  const card = G.players[pid].hand.at(-1);
  if (!card || card.cardId !== itemId) throw new Error(`${itemId} is not in the hand after the buy`);
  return card;
}

/**
 * Play `card` from `pid`'s hand onto its hero `hero` through the engine's
 * front door (either step of `pid`'s turn). Throws, naming the reason, when
 * the engine refuses. Returns the card, which the hero now wears.
 */
export function playItem(G: GameState, pid: PlayerID, card: CardInstance, hero: CardInstance): CardInstance {
  const a = { type: 'playCard' as const, cardIid: card.iid, heroIid: hero.iid };
  const why = blocked(G, pid, a);
  if (perform(G, pid, a) === INVALID) throw new Error(`playing ${card.cardId} on ${hero.cardId} was refused: ${why}`);
  const worn = findWornItem(G, card.iid, pid);
  if (!worn || worn.bearer.iid !== hero.iid) throw new Error(`${card.cardId} is not on ${hero.cardId} after the play`);
  return worn.item;
}

/**
 * Buy `itemId` as `pid` and play it at once onto `hero` (`buyToHand`, then
 * `playItem`): what a purchase for one hero takes now that a card goes to the
 * hand first. Throws, naming the reason, when either is refused. Returns the
 * item the hero now wears.
 */
export function buyItem(G: GameState, pid: PlayerID, itemId: CardId, hero: CardInstance): CardInstance {
  return playItem(G, pid, buyToHand(G, pid, itemId), hero);
}

/**
 * Put a card of `itemId` straight into `pid`'s hand, as a Story reward is
 * given (no purchase recorded) — or, with `bought`, as if it had been bought on
 * that engine turn for that many souls. No souls, no market, no step. Returns
 * the card.
 */
export function giveCard(G: GameState, pid: PlayerID, itemId: CardId, bought?: { turn: number; paid: number }): CardInstance {
  if (!itemCard(itemId)) throw new Error(`not an item: ${itemId}`);
  const card = makeInstance(allocatorOf(G), itemId, pid, 'hand');
  if (bought) {
    card.boughtOnTurn = bought.turn;
    card.paid = bought.paid;
  }
  G.players[pid].hand.push(card);
  return card;
}

/**
 * Make the engine's `setup()` build a battle-ready match (no draft) so a
 * boardgame.io Client boots straight into turn 1 with both boards populated.
 * Uses the story branch (which bypasses the draft) with a zero stat buff so it
 * behaves like a normal match, and TEST_SEED for the market. The first turn
 * opens in its shop step. Call in beforeAll for Client-based specs.
 */
export function configureReadyMatch(): void {
  setMatchConfig({
    heroPreferences: [null, null, null, null],
    seed: TEST_SEED,
    story: {
      playerHeroes: TEST_ROSTERS['0'],
      enemyHeroes: TEST_ROSTERS['1'],
      enemyBuff: { atk: 0, hp: 0 },
    },
  });
}

/**
 * A boardgame.io Client of the ready match (`configureReadyMatch` must have
 * run), started — on seat 0's turn 1 (seat 0 moves first in a scripted match,
 * with its first income banked) — and, unless `shop` is asked for, past that
 * turn's shop step into its act step.
 */
export function readyClient(opts: { shop?: boolean } = {}) {
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  if (!opts.shop) client.moves.closeShop();
  return client;
}

/** End the turn on `client` and close the next turn's shop: the next player
 *  stands in its act step. */
export function passTurn(client: ReturnType<typeof readyClient>): void {
  client.moves.endTurn();
  client.moves.closeShop();
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
