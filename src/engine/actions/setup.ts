/**
 * Building a game: the rosters and decks, the opening state, the pre-match
 * snake draft and the opening mulligan. boardgame.io's `setup` and the
 * `draftPick` / `mulligan` moves call these (game.ts).
 */
import type { CardInstance, GameState, PlayerID, PlayerState } from '../types';
import { CARDS_BY_ID, HEROES } from '@/cards';
import { getMatchConfig, scriptedSetup, type HeroStatOverride } from '@/storage/matchConfig';
import { getAIDeckTagged } from '@/decks/aiDecks';
import { allocatorFor, allocatorOf, newCounters, type IidAllocator } from '../ids';
import { makeInstance } from '../deckOps';
import { pushLog } from '../log';
import { INITIAL_DRAW, PATRON_HP, SOULS_START } from '../constants';
import { soulRefillForTurn, unlockUltimates } from './turn';

/** Empty PlayerState used while the pre-match draft is running — no heroes,
 *  no deck. Replaced via `buildPlayer()` once the 8th draft pick lands. */
function makeEmptyPlayer(pid: PlayerID): PlayerState {
  return {
    id: pid,
    hp: PATRON_HP,
    hpMax: PATRON_HP,
    souls: SOULS_START,
    deck: [],
    hand: [],
    active: null,
    bench: [null, null, null],
    discard: [],
    ultsConsumed: [],
  };
}

/** Snake draft order for 4 picks per player (8 total).
 *  P0 picks at indexes 0, 3, 4, 7; P1 picks at 1, 2, 5, 6. */
const DRAFT_ORDER: PlayerID[] = ['0', '1', '1', '0', '0', '1', '1', '0'];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface RosterOpts {
  /** Flat stat buff applied to every hero (Story mode enemy scaling). */
  buff?: { atk: number; hp: number };
  /** Patron-HP override for this match (Story pacing). */
  patronHp?: number;
  /** Deal the deck top-down instead of shuffling (the coached tutorial, which
   *  names the cards it asks you to play). */
  ordered?: boolean;
}

/** Build a PlayerState from a 1-4 hero roster + deck. Heroes beyond the first
 *  fill the bench (length 3, padded with null). Used by both the draft path
 *  (exactly 4 heroes) and Story mode (1-4 heroes, optional buff/patron HP).
 *  `ids` names every card it makes (see ids.ts). */
export function buildPlayer(ids: IidAllocator, pid: PlayerID, heroes: string[], deckCards: string[], opts: RosterOpts = {}): PlayerState {
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

  // `deck.pop()` draws from the END, so an ordered deck is reversed on the
  // way in — deckCards[0] is then the first card dealt.
  const instances = deckCards.map((id) => makeInstance(ids, id, pid, 'deck'));
  const deck = opts.ordered ? instances.reverse() : shuffle(instances);
  const hand: CardInstance[] = [];
  for (let i = 0; i < INITIAL_DRAW && deck.length > 0; i++) {
    const card = deck.pop()!;
    card.zone = 'hand';
    hand.push(card);
  }

  const patronHp = opts.patronHp ?? PATRON_HP;
  return {
    id: pid,
    hp: patronHp,
    hpMax: patronHp,
    souls: SOULS_START,
    deck,
    hand,
    active,
    bench,
    discard: [],
    ultsConsumed: [],
  };
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
 *  given roster and deck. */
export function setupGame(): GameState {
  const counters = newCounters();
  // Scripted match (Story node or tutorial lesson): skip the draft entirely
  // and build both players from the given roster/deck. Enemy heroes carry
  // the setup's scaling buff.
  const story = scriptedSetup();

  if (story) {
    const ids = allocatorFor(counters);
    // A lesson may open mid-match: the turn counter starts at `startTurn`,
    // so the first refill and the ultimate unlock see the right turn.
    const startTurn = Math.max(1, Math.floor(story.startTurn ?? 1));
    const G: GameState = {
      counters,
      players: {
        '0': buildPlayer(ids, '0', story.playerHeroes, story.playerDeck, { patronHp: story.patronHp, ordered: story.orderedPlayerDeck }),
        '1': buildPlayer(ids, '1', story.enemyHeroes, story.enemyDeck, { buff: story.enemyBuff, patronHp: story.enemyPatronHp ?? story.patronHp }),
      },
      turnNumber: startTurn,
      log: [{ turn: startTurn, text: 'Battle begins.' }],
      draft: null,
      // realTurn = ctx.turn - offset, and ctx.turn starts at 1.
      draftTurnsOffset: 1 - startTurn,
      mulliganPending: false,
      attackUsed: false,
      action: null,
      fx: [],
    };
    // A lesson builds the exact situation it teaches: custom attack,
    // health and experience per hero, by roster position.
    applyHeroStats(G.players['0'], story.playerHeroStats);
    applyHeroStats(G.players['1'], story.enemyHeroStats);
    G.players['0'].archetype = 'story';
    G.players['1'].archetype = 'story-enemy';
    return G;
  }

  return {
    counters,
    players: {
      '0': makeEmptyPlayer('0'),
      '1': makeEmptyPlayer('1'),
    },
    turnNumber: 1,
    log: [{ turn: 1, text: 'Draft begins.' }],
    draft: {
      pool: HEROES.map((h) => h.id),
      order: [...DRAFT_ORDER],
      currentIndex: 0,
      picks: { '0': [], '1': [] },
    },
    draftTurnsOffset: 0,  // set in draftPick when draft completes
    mulliganPending: false,
    attackUsed: false,
    action: null,
    fx: [],
  };
}

/**
 * Pre-match hero draft pick (`draftPickBlocked` has checked it is the player's
 * pick from the pool). Removes the hero from the pool and says whether the
 * boardgame.io turn ends — when the next pick belongs to the other player —
 * or stays (consecutive snake picks). On the final pick, finalizes both
 * players' PlayerStates with the drafted heroes and flips `mulliganPending`
 * so the MulliganOverlay takes over.
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
    const p0Heroes = draft.picks['0'] as [string, string, string, string];
    const p1Heroes = draft.picks['1'] as [string, string, string, string];
    const config = getMatchConfig();
    const p0Tag = getAIDeckTagged();
    const playerDeck = config.playerDeck.length > 0 ? config.playerDeck : p0Tag.cards;
    const aiTag = getAIDeckTagged();
    const ids = allocatorOf(G);
    G.players['0'] = buildPlayer(ids, '0', p0Heroes, playerDeck);
    G.players['1'] = buildPlayer(ids, '1', p1Heroes, aiTag.cards);
    G.players['0'].archetype = config.playerDeck.length > 0 ? 'custom' : p0Tag.archetype;
    G.players['1'].archetype = aiTag.archetype;
    G.draft = null;
    G.mulliganPending = false;
    G.draftTurnsOffset = ctx.turn - 1;
    G.turnNumber = 1;
    const currentPs = G.players[ctx.currentPlayer as PlayerID];
    currentPs.souls = soulRefillForTurn(1);
    unlockUltimates(G, currentPs);
    pushLog(G, 'Match begins.');
    return { endTurn: ctx.currentPlayer !== '0' };
  }

  return { endTurn: draft.order[draft.currentIndex] !== ctx.currentPlayer };
}

/** Resolve the opening mulligan (`mulliganBlocked` has checked one is pending). */
export function mulligan(G: GameState) {
  G.mulliganPending = false;
}
