/**
 * The deck a side brings and how a match deals it (docs/deck-plan.md;
 * src/cards/decks.ts, src/engine/deck.ts, actions/setup.ts) — what replaced
 * the market. A deck is DECK_SIZE items, at most MAX_COPIES of one; a side with
 * no legal saved deck (every AI seat, and the player until they build one) is
 * dealt one made from its heroes' builds, read across round by round. A
 * drafted match shuffles each side's four heroes into its deck, deals an
 * opening hand of OPENING_HAND with at least one hero that can stand in the
 * lane, and puts a first Active in the lane — an AI seat's at once, the human
 * seat when it chooses. A scripted match keeps its rosters on the board and
 * deals from a deck of items. Every shuffle is drawn from the match seed, so a
 * deal replays from G alone, whatever Math.random does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, HEROES, ITEMS, itemCard } from '@/cards';
import { defaultBuild } from '@/cards/builds';
import { copyCounts, deckFromBuilds, deckProblem, isLegalDeck, upgradesOf, ITEM_SLOTS, catalogueByTab } from '@/cards/decks';
import { DeadlockGame } from '@/engine/game';
import { setupGame } from '@/engine/actions/setup';
import { buildOf, nextRandom, shuffle, sideDeckIds } from '@/engine/deck';
import { INVALID, perform } from '@/engine/engine';
import { blocked, legalActions } from '@/engine/legality';
import { DECK_SIZE, MAX_COPIES, OPENING_HAND } from '@/engine/constants';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { TEST_ROSTERS } from './_helpers';

const saved = getMatchConfig();
afterEach(() => {
  setMatchConfig(saved);
  vi.restoreAllMocks();
});

const ids = (cards: CardInstance[]) => cards.map((c) => c.cardId);
const isHero = (id: CardId) => CARDS_BY_ID[id]?.type === 'hero';
const canLead = (id: CardId) => {
  const d = CARDS_BY_ID[id];
  return d?.type === 'hero' && !d.flags?.benchOnly;
};
/** Every card a side has, wherever it is: deck, hand, discard pile, board. */
const allCards = (G: GameState, pid: PlayerID) => {
  const ps = G.players[pid];
  return [...ps.deck, ...ps.hand, ...ps.discard, ...[ps.active, ...ps.bench].filter((c): c is CardInstance => !!c)];
};

/** A drafted match through a client: seat 0 picks the first four of `picks`'
 *  snake slots, seat 1 the rest. Returns the state as the first turn opens. */
function drafted(seed: number, opts: { human?: PlayerID | null; deck?: CardId[]; builds?: Record<CardId, CardId[]> } = {}) {
  setMatchConfig({
    heroPreferences: [null, null, null, null], seed,
    humanSeat: opts.human === undefined ? '0' : opts.human,
    deck: opts.deck, builds: opts.builds,
  });
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  const order = ['hero_haze', 'hero_abrams', 'hero_dynamo', 'hero_vindicta', 'hero_lash', 'hero_kelvin', 'hero_seven', 'hero_paige'];
  for (const id of order) client.moves.draftPick(id);
  const G = structuredClone(client.getState()!.G) as GameState;
  client.stop();
  // Snake: P0 at 0, 3, 4, 7; P1 at 1, 2, 5, 6.
  const picks: Record<PlayerID, CardId[]> = { '0': [order[0], order[3], order[4], order[7]], '1': [order[1], order[2], order[5], order[6]] };
  return { G, picks };
}

describe('what makes a deck', () => {
  it(`${DECK_SIZE} items, at most ${MAX_COPIES} of one, any tier — nothing that is no item`, () => {
    const four = (id: CardId) => [id, id, id, id];
    const legal = [...four('extended_magazine'), ...four('grit'), ...four('glass_cannon'), ...four('cold_front')];
    expect(deckProblem(legal)).toBeNull();
    expect(isLegalDeck(legal)).toBe(true);
    expect(deckProblem(legal.slice(1))).toBe('size');
    expect(deckProblem([...legal.slice(1), 'grit'])).toBe('copies');
    expect(deckProblem([...legal.slice(1), 'hero_haze'])).toBe('notItem');
    expect(isLegalDeck(undefined)).toBe(false);
    expect(copyCounts(['grit', 'grit', 'cold_front'])).toEqual({ grit: 2, cold_front: 1 });
  });

  it('the catalogue by tab and tier holds every item once, under its own tab and tier', () => {
    const cat = catalogueByTab();
    const seen: CardId[] = [];
    for (const slot of ITEM_SLOTS) for (const [tier, list] of Object.entries(cat[slot])) {
      for (const id of list) {
        expect(itemCard(id)).toMatchObject({ slot, tier: Number(tier) });
        seen.push(id);
      }
    }
    expect(seen.sort()).toEqual(ITEMS.map((i) => i.id).sort());
  });

  it('upgradesOf reads upgradesFrom backwards, in catalogue order: Extra Health makes Fortitude or Colossus', () => {
    let links = 0;
    for (const item of ITEMS) {
      for (const up of upgradesOf(item.id)) {
        expect(itemCard(up)!.upgradesFrom).toBe(item.id);
        links++;
      }
    }
    expect(links).toBe(ITEMS.filter((i) => i.upgradesFrom).length);
    expect([...upgradesOf('extra_health')].sort()).toEqual(['colossus', 'fortitude']);
    expect(upgradesOf('improved_cooldown')).toEqual(['superior_cooldown']);
    expect(upgradesOf('superior_cooldown')).toEqual(['transcendent_cooldown']);
    expect(upgradesOf('glass_cannon')).toEqual([]);
  });
});

describe('the deck made from the heroes\' builds', () => {
  it('reads the builds across — every hero\'s first item, then every hero\'s second… — until it holds DECK_SIZE', () => {
    const heroes = TEST_ROSTERS['0'];
    const deck = deckFromBuilds(heroes.map(defaultBuild));
    expect(deck).toHaveLength(DECK_SIZE);
    expect(isLegalDeck(deck)).toBe(true);
    const across: CardId[] = [];
    for (let i = 0; i < 6; i++) for (const h of heroes) across.push(defaultBuild(h)[i]);
    expect(deck).toEqual(across.slice(0, DECK_SIZE));
  });

  it('caps an item at MAX_COPIES and goes round again when the builds are short', () => {
    const deck = deckFromBuilds([['grit'], ['grit'], ['grit', 'cold_front'], ['grit']]);
    expect(copyCounts(deck).grit).toBe(MAX_COPIES);
    expect(copyCounts(deck).cold_front).toBe(MAX_COPIES);
    expect(deck).toHaveLength(2 * MAX_COPIES);  // nothing more can go in
    expect(deckFromBuilds([])).toEqual([]);
    expect(deckFromBuilds([['nope', 'hero_haze']])).toEqual([]);
  });

  it('every hero\'s default build, with any three others, makes a legal deck', () => {
    const all = HEROES.map((h) => h.id);
    for (let i = 0; i < all.length; i++) {
      const four = [all[i], all[(i + 1) % all.length], all[(i + 2) % all.length], all[(i + 3) % all.length]];
      expect(isLegalDeck(deckFromBuilds(four.map(defaultBuild))), four.join(',')).toBe(true);
    }
  });

  it('sideDeckIds: the human seat\'s saved deck when it is legal, else its builds\' deck — its own builds first; an AI seat always its heroes\' defaults', () => {
    const legal = [...Array(4).fill('grit'), ...Array(4).fill('cold_front'), ...Array(4).fill('extra_health'), ...Array(4).fill('extended_magazine')];
    const G = { humanSeat: '0' as PlayerID, playerDeck: legal, playerBuilds: { hero_haze: ['glass_cannon'] } };
    expect(sideDeckIds(G, '0', TEST_ROSTERS['0'])).toEqual(legal);
    expect(sideDeckIds(G, '1', TEST_ROSTERS['1'])).toEqual(deckFromBuilds(TEST_ROSTERS['1'].map(defaultBuild)));
    const short = { ...G, playerDeck: legal.slice(1) };
    const mine = sideDeckIds(short, '0', TEST_ROSTERS['0']);
    expect(mine).toEqual(deckFromBuilds(TEST_ROSTERS['0'].map((h) => buildOf(short, '0', h))));
    expect(mine[0]).toBe('glass_cannon');
  });
});

describe('a drafted match deals the deck', () => {
  it('each side: its DECK_SIZE items and its four heroes, an opening hand of OPENING_HAND from them, at least one a hero that can lead', () => {
    for (const seed of [1, 2, 3, 77, 4242]) {
      const { G, picks } = drafted(seed);
      for (const pid of ['0', '1'] as PlayerID[]) {
        const all = allCards(G, pid);
        expect(all, `seed ${seed} P${pid}`).toHaveLength(DECK_SIZE + 4);
        expect(ids(all).filter(isHero).sort(), `seed ${seed}`).toEqual([...picks[pid]].sort());
        expect(isLegalDeck(ids(all).filter((id) => !isHero(id))), `seed ${seed}`).toBe(true);
        for (const c of G.players[pid].deck) expect(c.zone).toBe('deck');
      }
      // The first mover has drawn its turn's card on top of the opening hand.
      const p0 = G.players['0'];
      expect(p0.hand.length + (p0.active ? 1 : 0)).toBe(OPENING_HAND);
      expect([...ids(p0.hand), ...(p0.active ? [p0.active.cardId] : [])].some(canLead), `seed ${seed}`).toBe(true);
    }
  });

  it('the human seat chooses its first Active from the opening hand; an AI seat\'s is in the lane at once', () => {
    const { G } = drafted(11);
    expect(G.players['1'].active).not.toBeNull();
    expect(G.players['1'].active!.zone).toBe('active');
    expect(G.players['0'].active).toBeNull();
    expect(G.pendingActive).toBe('0');
    // Nothing else is legal until it is chosen — the first mover's turn included.
    expect(blocked(G, '1', { type: 'endTurn' })).toBe('activeOwed');
    const options = legalActions(G, '1');
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((a) => a.type === 'chooseActive')).toBe(true);
    const pick = G.players['0'].hand.find((c) => canLead(c.cardId))!;
    expect(perform(G, '1', { type: 'chooseActive', cardIid: pick.iid })).not.toBe(INVALID); // from either seat
    expect(G.players['0'].active).toBe(pick);
    expect(G.pendingActive).toBeUndefined();
    expect(G.players['0'].hand).not.toContain(pick);
  });

  it('with no human seat both Actives are chosen at once, and the board holds nothing else', () => {
    const { G } = drafted(12, { human: null });
    expect(G.pendingActive).toBeUndefined();
    for (const pid of ['0', '1'] as PlayerID[]) {
      expect(G.players[pid].active).not.toBeNull();
      expect(G.players[pid].bench).toEqual([null, null, null]);
    }
  });

  it('the human seat\'s legal saved deck is the one dealt; a short one is not', () => {
    const legal = [...Array(4).fill('grit'), ...Array(4).fill('cold_front'), ...Array(4).fill('extra_health'), ...Array(4).fill('extended_magazine')];
    const { G } = drafted(5, { deck: legal });
    expect(ids(allCards(G, '0')).filter((id) => !isHero(id)).sort()).toEqual([...legal].sort());
    const short = drafted(5, { deck: legal.slice(2) });
    expect(ids(allCards(short.G, '0')).filter((id) => !isHero(id)).sort()).toEqual(deckFromBuilds(short.picks['0'].map(defaultBuild)).sort());
  });

  it('the opening\'s Pocket rule: a hand with no hero that can lead swaps a non-hero for one from the deck', async () => {
    const { dealOpeningHand } = await import('@/engine/deck');
    const { freshReadyGame, stackDeck } = await import('./_helpers');
    const G = freshReadyGame();
    G.players['0'].deck = [];
    stackDeck(G, '0', ['grit', 'grit', 'hero_rem', 'grit', 'grit', 'grit', 'hero_kelvin', 'grit']);
    dealOpeningHand(G, '0');
    const hand = ids(G.players['0'].hand);
    expect(hand).toHaveLength(OPENING_HAND);
    expect(hand).toContain('hero_kelvin');       // Rem cannot lead: Kelvin was swapped in
    expect(hand).toContain('hero_rem');
    expect(ids(G.players['0'].deck)).toHaveLength(3);
  });
});

describe('the deal replays from G alone', () => {
  it('the same match seed deals the same decks and hands, whatever Math.random returns', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const a = drafted(4242).G;
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const b = drafted(4242).G;
    for (const pid of ['0', '1'] as PlayerID[]) {
      expect(ids(b.players[pid].deck)).toEqual(ids(a.players[pid].deck));
      expect(ids(b.players[pid].hand)).toEqual(ids(a.players[pid].hand));
    }
    const c = drafted(4243).G;
    expect(ids(c.players['0'].deck)).not.toEqual(ids(a.players['0'].deck));
  });

  it('nextRandom counts in G: a copy draws the same numbers, and the original moves on only when it draws', () => {
    const G = { seed: 99, counters: { iid: 1, fx: 0, action: 0 } } as Pick<GameState, 'seed' | 'counters'>;
    const copy = structuredClone(G);
    const xs = [nextRandom(G), nextRandom(G), nextRandom(G)];
    expect([nextRandom(copy), nextRandom(copy), nextRandom(copy)]).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    const list = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(structuredClone(G), [...list])).toEqual(shuffle(structuredClone(G), [...list]));
    expect([...shuffle(structuredClone(G), [...list])].sort()).toEqual(list);
  });
});

describe('a scripted match deals from a deck of items', () => {
  it('its rosters stand on the board; each deck is its side\'s builds\' deck, shuffled; each draws its opening hand', () => {
    setMatchConfig({
      heroPreferences: [null, null, null, null], seed: 31,
      story: { playerHeroes: TEST_ROSTERS['0'], enemyHeroes: TEST_ROSTERS['1'], enemyBuff: { atk: 0, hp: 0 } },
    });
    const G = setupGame();
    for (const pid of ['0', '1'] as PlayerID[]) {
      const ps = G.players[pid];
      expect(ps.active).not.toBeNull();
      expect(ps.hand).toHaveLength(OPENING_HAND);
      expect(ps.deck).toHaveLength(DECK_SIZE - OPENING_HAND);
      expect([...ids(ps.hand), ...ids(ps.deck)].sort()).toEqual(deckFromBuilds(TEST_ROSTERS[pid].map(defaultBuild)).sort());
    }
  });

  it('a deck the setup names is dealt in its own order, the first on top; the opening hand may be none', () => {
    setMatchConfig({
      heroPreferences: [null, null, null, null], seed: 31,
      story: {
        playerHeroes: ['hero_yamato'], enemyHeroes: ['hero_lash'], enemyBuff: { atk: 0, hp: 0 },
        playerDeck: ['extended_magazine', 'grit', 'cold_front'], enemyDeck: [], openingHand: 0,
      },
    });
    const G = setupGame();
    expect(G.players['0'].hand).toEqual([]);
    expect(ids(G.players['0'].deck)).toEqual(['cold_front', 'grit', 'extended_magazine']); // the top is the end
    expect(G.players['1'].deck).toEqual([]);
  });
});
