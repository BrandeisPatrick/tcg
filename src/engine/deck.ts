/**
 * The deck, the hand and the discard pile (docs/deck-plan.md). Every card a
 * side has that is not on the board lives in one of the three: the deck (face
 * down, drawn from the top — the end of `PlayerState.deck`), the hand (heroes
 * and items, played from there) and the discard pile.
 *
 *  - A drafted match builds each side's deck from its items (the human seat's
 *    saved deck, else one made from its heroes' builds: `deckFromBuilds`) and
 *    its three heroes, shuffled; each side draws OPENING_HAND, at least one a
 *    hero (`dealOpeningHand`). A scripted match (a Story fight, a lesson) puts
 *    its rosters on the board and deals from a deck of items.
 *  - Each own turn draws DRAW_PER_TURN; a draw into a full hand (MAX_HAND) is
 *    skipped and an empty deck draws nothing.
 *  - A draw card draws, then owes a discard from anywhere in the hand
 *    (`oweDiscard`, paid by the `discard` move).
 *
 * Every random pick is drawn from the match seed (`nextRandom`, counted in
 * `G.counters.rng`), so a game replays from G alone, and a simulation on a
 * clone draws on its own copy. Every move of a card between the three is a
 * `deck` FX event the board can animate.
 */
import type { CardId, CardInstance, GameState, PlayerID, PlayerState } from './types';
import { CARDS_BY_ID, cardName, itemCard } from '@/cards';
import { defaultBuild } from '@/cards/builds';
import { deckFromBuilds, isLegalDeck } from '@/cards/decks';
import { allocatorOf } from './ids';
import { makeInstance } from './instances';
import { leaveActive } from './lane';
import { pushLog } from './log';
import { pushFx } from './fx';
import { seededRandom } from './rng';
import { MAX_HAND, OPENING_HAND } from './constants';

// ---------- Randomness ----------

/** The next random number of the match, in [0, 1): the match seed and the
 *  count of numbers drawn so far, mixed. */
export function nextRandom(G: Pick<GameState, 'seed' | 'counters'>): number {
  const counters = (G.counters ??= { iid: 1, fx: 0, action: 0 });
  const n = (counters.rng ?? 0) + 1;
  counters.rng = n;
  return seededRandom(((G.seed ?? 0) ^ Math.imul(n, 0x9e3779b1) ^ Math.imul(n >>> 16, 0x85ebca6b)) >>> 0)();
}

/** Shuffle `cards` in place (Fisher–Yates on the match's stream). */
export function shuffle<T>(G: Pick<GameState, 'seed' | 'counters'>, cards: T[]): T[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(G) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ---------- What a side brings ----------

/** The build `pid` follows for its hero `heroId`, in order: the human seat's
 *  own (`G.playerBuilds`, the player's saved builds), else the hero's default
 *  (cards/builds.ts) — every AI seat's. */
export function buildOf(G: Pick<GameState, 'playerBuilds' | 'humanSeat'>, pid: PlayerID, heroId: CardId): CardId[] {
  const own = pid === G.humanSeat ? G.playerBuilds?.[heroId] : undefined;
  return own && own.length > 0 ? [...own] : defaultBuild(heroId);
}

/** The items `pid` brings to a match with the heroes `heroIds`: the human
 *  seat's saved deck when it is a legal one, else the deck its heroes' builds
 *  make (`deckFromBuilds`). */
export function sideDeckIds(G: Pick<GameState, 'playerBuilds' | 'humanSeat' | 'playerDeck'>, pid: PlayerID, heroIds: readonly CardId[]): CardId[] {
  const own = pid === G.humanSeat ? G.playerDeck : undefined;
  if (isLegalDeck(own)) return [...own];
  return deckFromBuilds(heroIds.map((h) => buildOf(G, pid, h)));
}

/** Put fresh cards of `ids` into `pid`'s deck and shuffle it — or, `ordered`,
 *  keep them in the order given, the first on top (a lesson's script). */
export function fillDeck(G: GameState, pid: PlayerID, ids: readonly CardId[], opts: { ordered?: boolean } = {}) {
  const ps = G.players[pid];
  const ids2 = ids.filter((id) => !!CARDS_BY_ID[id]);
  const made = ids2.map((id) => makeInstance(allocatorOf(G), id, pid, 'deck'));
  if (opts.ordered) {
    ps.deck.push(...made.reverse());
    return;
  }
  ps.deck.push(...made);
  shuffle(G, ps.deck);
  pushFx(G, { kind: 'deck', what: 'shuffle', pid });
}

/** Put fresh cards of `ids` into `pid`'s deck as they are, unshuffled and
 *  unannounced: a drafted match stocks its decks at the last pick and
 *  shuffles them, with the motion, once the first Actives are chosen
 *  (`shuffleDeck`). */
export function stockDeck(G: GameState, pid: PlayerID, ids: readonly CardId[]) {
  const ps = G.players[pid];
  for (const id of ids) if (CARDS_BY_ID[id]) ps.deck.push(makeInstance(allocatorOf(G), id, pid, 'deck'));
}

/** Shuffle `pid`'s deck, and say so (the board riffles it). */
export function shuffleDeck(G: GameState, pid: PlayerID) {
  shuffle(G, G.players[pid].deck);
  pushFx(G, { kind: 'deck', what: 'shuffle', pid });
}

// ---------- Drawing ----------

/** True when `ps` may draw now: a card in the deck and room in the hand. */
export function canDraw(ps: PlayerState): boolean {
  return ps.deck.length > 0 && ps.hand.length < MAX_HAND;
}

/**
 * Draw up to `n` cards from the top of `pid`'s deck into its hand. A draw into
 * a full hand (MAX_HAND) is skipped — the card stays in the deck — and an
 * empty deck draws nothing; nothing else happens. Returns the cards drawn.
 */
export function drawCards(G: GameState, pid: PlayerID, n: number): CardInstance[] {
  const ps = G.players[pid];
  const drawn: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    if (!canDraw(ps)) break;
    const card = ps.deck.pop()!;
    card.zone = 'hand';
    ps.hand.push(card);
    drawn.push(card);
    pushFx(G, { kind: 'deck', what: 'draw', pid, iid: card.iid, cardId: card.cardId });
  }
  const skipped = n - drawn.length;
  if (drawn.length > 0) pushLog(G, `P${pid} drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
  if (skipped > 0 && ps.deck.length > 0) pushLog(G, `P${pid}'s hand is full: ${skipped} draw${skipped === 1 ? '' : 's'} skipped.`);
  else if (skipped > 0) pushLog(G, `P${pid}'s deck is empty.`);
  return drawn;
}

/**
 * The opening hand: `n` cards (OPENING_HAND) from the top of the shuffled
 * deck, at least one a hero that can stand in the lane when the deck holds
 * one — the Pocket rule: a hand with none swaps a random non-hero of it for a
 * random such hero of the deck (which takes the card's place in the deck, and
 * the deck is shuffled again). A bench-only hero (`flags.benchOnly`, which
 * no card sets now) does not count: the opening needs an Active.
 */
export function dealOpeningHand(G: GameState, pid: PlayerID, n: number = OPENING_HAND) {
  const ps = G.players[pid];
  drawCards(G, pid, n);
  const isHero = (c: CardInstance) => CARDS_BY_ID[c.cardId]?.type === 'hero';
  const canLead = (c: CardInstance) => {
    const d = CARDS_BY_ID[c.cardId];
    return d?.type === 'hero' && !d.flags?.benchOnly;
  };
  if (ps.hand.length === 0 || ps.hand.some(canLead)) return;
  const heroes = ps.deck.filter(canLead);
  const others = ps.hand.filter((c) => !isHero(c));
  if (heroes.length === 0 || others.length === 0) return;
  const out = others[Math.floor(nextRandom(G) * others.length)];
  const hero = heroes[Math.floor(nextRandom(G) * heroes.length)];
  ps.hand[ps.hand.indexOf(out)] = hero;
  ps.deck[ps.deck.indexOf(hero)] = out;
  hero.zone = 'hand';
  out.zone = 'deck';
  shuffle(G, ps.deck);
  pushLog(G, `P${pid}'s opening hand had no hero: ${cardName(out.cardId)} went back for one.`);
  pushFx(G, { kind: 'deck', what: 'shuffle', pid });
}

// ---------- The discard pile ----------

/** Put `card` on `pid`'s discard pile, out of whatever it was in (its owner
 *  takes it off the hero or out of the hand first). A hero card carries no
 *  items there: what it wore goes to the pile beside it. */
export function toDiscard(G: GameState, pid: PlayerID, card: CardInstance) {
  card.zone = 'discard';
  card.attachedTo = undefined;
  card.slot = undefined;
  card.cooldowns = undefined;
  G.players[pid].discard.push(card);
  pushFx(G, { kind: 'deck', what: 'discard', pid, iid: card.iid, cardId: card.cardId });
  const worn = (card.attached ?? []).filter((a) => !!itemCard(a.cardId));
  if (worn.length > 0) {
    card.attached = (card.attached ?? []).filter((a) => !itemCard(a.cardId));
    for (const it of worn) toDiscard(G, pid, it);
  }
}

/** A draw card's discard: `pid` owes `count` cards from its hand (fewer when
 *  the hand holds fewer; none owed when it is empty). */
export function oweDiscard(G: GameState, pid: PlayerID, count: number, cardId: CardId) {
  const n = Math.min(count, G.players[pid].hand.length);
  if (n > 0) G.pendingDiscard = { pid, count: n, cardId };
}

/** True for a hero card proper (not a unit): one that is never lost to a discard. */
function isHeroProper(card: CardInstance): boolean {
  const data = CARDS_BY_ID[card.cardId];
  return data?.type === 'hero' && !data.unit;
}

/** A hero that would be discarded goes back into its owner's deck instead,
 *  and the deck is shuffled (Patrick, 2026-11-16: a side must not lose a hero
 *  to a discard). A deck card carries nothing, so the items a hero back from a
 *  fall still wears in the hand are discarded: the hero is saved, its gear is
 *  not. */
function heroBackIntoDeck(G: GameState, pid: PlayerID, hero: CardInstance) {
  const ps = G.players[pid];
  const worn = (hero.attached ?? []).filter((a) => !!itemCard(a.cardId));
  if (worn.length > 0) {
    hero.attached = (hero.attached ?? []).filter((a) => !itemCard(a.cardId));
    for (const it of worn) toDiscard(G, pid, it);
    pushLog(G, `${cardName(hero.cardId)}'s items are discarded.`);
  }
  hero.zone = 'deck';
  hero.slot = undefined;
  ps.deck.push(hero);
  shuffle(G, ps.deck);
  pushLog(G, `${cardName(hero.cardId)} is a hero: it goes back into P${pid}'s deck, and the deck is shuffled.`);
  pushFx(G, { kind: 'deck', what: 'shuffle', pid });
}

/**
 * Discard the top `n` cards of `pid`'s deck (a Ghoul's death does it to the
 * rival). Fewer when the deck runs out. A hero among them is not discarded:
 * it goes back in and the deck is shuffled (`heroBackIntoDeck`); that card's
 * discard is spent all the same. Returns the cards discarded.
 */
export function millDeck(G: GameState, pid: PlayerID, n: number, source: string): CardInstance[] {
  const ps = G.players[pid];
  const gone: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    const card = ps.deck.pop();
    if (!card) break;
    if (isHeroProper(card)) { heroBackIntoDeck(G, pid, card); continue; }
    card.zone = 'discard';
    ps.discard.push(card);
    gone.push(card);
    pushFx(G, { kind: 'deck', what: 'mill', pid, iid: card.iid, cardId: card.cardId });
  }
  if (gone.length > 0) pushLog(G, `${source}: P${pid} discards ${gone.map((c) => cardName(c.cardId)).join(', ')} from the top of its deck.`);
  else if (ps.deck.length === 0) pushLog(G, `${source}: P${pid}'s deck is empty.`);
  return gone;
}

/**
 * A card's effect makes `n` new cards of `cardId` and shuffles each into
 * `pid`'s deck, at a place drawn from the match's own stream (Graves' Ghouls).
 * Returns the cards made.
 */
export function raiseIntoDeck(G: GameState, pid: PlayerID, cardId: CardId, n: number, source: string): CardInstance[] {
  const ps = G.players[pid];
  const made: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    const card = makeInstance(allocatorOf(G), cardId, pid, 'deck');
    ps.deck.splice(Math.floor(nextRandom(G) * (ps.deck.length + 1)), 0, card);
    made.push(card);
    pushFx(G, { kind: 'deck', what: 'raise', pid, iid: card.iid, cardId });
  }
  if (n > 0) pushLog(G, `${source}: ${n} ${cardName(cardId)}${n === 1 ? '' : 's'} shuffled into P${pid}'s deck.`);
  return made;
}

/** Discard the hand cards `iids` of `pid` (the `discard` move: legality has
 *  checked them), paying that much of the discard owed. A hero discarded goes
 *  back into the deck instead (`heroBackIntoDeck`). */
export function discardFromHand(G: GameState, pid: PlayerID, iids: readonly string[]) {
  const ps = G.players[pid];
  for (const iid of iids) {
    const card = ps.hand.find((c) => c.iid === iid);
    if (!card) continue;
    ps.hand = ps.hand.filter((c) => c !== card);
    if (isHeroProper(card)) { heroBackIntoDeck(G, pid, card); continue; }
    toDiscard(G, pid, card);
    pushLog(G, `P${pid} discarded ${cardName(card.cardId)}.`);
  }
  const owed = G.pendingDiscard;
  if (owed && owed.pid === pid) {
    const left = Math.min(owed.count - iids.length, ps.hand.length);
    G.pendingDiscard = left > 0 ? { ...owed, count: left } : undefined;
  }
}

// ---------- A fallen hero comes back ----------

/**
 * `hero`, a corpse in one of `ps`'s slots whose wait is over (or, with
 * RESPAWN_TURNS 0, one that has just fallen), leaves the board for its
 * owner's hand: at full HP, its level, exp and items kept, its slot left
 * empty. A hero comes back even into a full hand (MAX_HAND limits draws).
 * `lifted`: no fall at all, but Lash's Death Slam (`bounceToHand`), which has
 * taken its items off first; the event says so.
 */
export function heroToHand(G: GameState, ps: PlayerState, hero: CardInstance, opts: { lifted?: boolean } = {}) {
  if (ps.active === hero) {
    leaveActive(G, hero);
    ps.active = null;
  } else {
    const i = ps.bench.indexOf(hero);
    if (i >= 0) ps.bench[i] = null;
  }
  hero.zone = 'hand';
  hero.slot = undefined;
  hero.respawnTurnsLeft = undefined;
  hero.exhausted = false;
  hero.statuses = [];
  hero.skillUsedThisTurn = false;
  if (hero.lastSkillUsed !== undefined) hero.lastSkillUsed = undefined;
  hero.hp = hero.hpMax;
  ps.hand.push(hero);
  pushLog(G, `${cardName(hero.cardId)} is back in P${ps.id}'s hand.`);
  pushFx(G, { kind: 'deck', what: 'toHand', pid: ps.id, iid: hero.iid, cardId: hero.cardId, ...(opts.lifted ? { lifted: true as const } : {}) });
}
