/**
 * The harness checks itself: a clean state passes every invariant, and each
 * invariant (and transition rule) fires on a state built to break it — so a quiet
 * run of the fuzz specs means "nothing found", not "nothing could be found".
 * Most transition cases start from a REAL move made on a clone (`made`): the pair
 * it leaves must be clean, and the same pair with the rule broken by hand must not.
 * Also pins the driver's contract (reproducible, accepts / rejects as the engine
 * does) and the rules oracles against hand-built boards.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Ctx } from 'boardgame.io';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { resolve } from '@/engine/death';
import { DeadlockGame } from '@/engine/game';
import * as query from '@/engine/query';
import { ITEMS } from '@/cards';
import {
  BOSS_CARD_ID, BOSS_HP, HARD_CC_CHARGES, LANE_INCOME, MAX_HAND, PRICE, RESPAWN_TURNS, REVIVE_CREDITS, ROUND_CAP, ULT_COOLDOWN, ULT_COST,
} from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, makeHero, nextTestIid, setTrack, stackDeck } from '../_helpers';
import { SOULS_ON_USE, checkInvariants, checkTransition, collectInvariantViolations, collectTransitionViolations } from './invariants';
import { chaosMove, marketSeedFor, mulberry32, playGame } from './driver';
import {
  DRAW_CARDS, activateBlockedOracle, activateTargetsOracle, activeCooldownOracle, callMove, chooseActiveBlockedOracle, diffPaths,
  discardBlockedOracle, everyCard, filterForItem, filterForSkill, freeBenchSlotOracle, heroesOfSide, itemData, itemPriceOracle,
  netWorthOracle, netWorthOracleWithoutHand, placeHeroBlockedOracle, playBlockedOracle, playCostOracle, slotCapOracle, targetLegal,
  upgradeComponentOracle, upgradeMadeOracle, upgradesOfOracle, wornWorth,
} from './oracle';
import { splitKnown, type Hit } from './hits';

const ctx = (over: Partial<Ctx> = {}): Ctx => ({ currentPlayer: '0', turn: 2, numPlayers: 2, ...over }) as unknown as Ctx;
const clean = (): GameState => freshReadyGame();
const ids = (G: GameState, c: Ctx = ctx()) => collectInvariantViolations(G, c).map((v) => v.id);

/** A loose item instance (worn by nobody yet). */
const loose = (G: GameState, cardId: string, owner: PlayerID): CardInstance => {
  const host = makeHero('hero_shiv', owner, 'bench', 1);
  const it = giveItem(G, host, cardId);
  it.attachedTo = undefined;
  return it;
};
/** `pid` has felled the enemy Guardian and Walker: the flex slot is its, as the rules give it. */
const flex = (G: GameState, pid: PlayerID) => {
  G.players[pid].flexSlot = true;
  for (const s of G.players[pid === '0' ? '1' : '0'].structures) if (s.kind !== 'patron') s.hp = 0;
};
/** Push `n` off `pid`'s structures, front first, as the engine does. */
const pushOff = (G: GameState, pid: PlayerID, n: number) => {
  for (const s of G.players[pid].structures) { const k = Math.min(s.hp, n); s.hp -= k; n -= k; }
};
/** The Mid-Boss in the pit, at `hp`, as the engine raises it (round 4 on). */
const raiseBoss = (G: GameState, hp = BOSS_HP): CardInstance => {
  G.turnNumber = 8; G.draftTurnsOffset = 0; // round 4, P0's turn (P1 moved first): read with ctx turn 8
  const boss: CardInstance = {
    iid: 'boss1', cardId: BOSS_CARD_ID, ownerId: 'none', zone: 'pit', attached: [], hp, hpMax: BOSS_HP,
    atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  G.boss = boss;
  G.bossDamage = { '0': BOSS_HP - hp, '1': 0 };
  G.bossRespawnRound = 4;
  return boss;
};
/** P0's heroes on the clean board: Haze (Active), Vindicta, Lash, Paige. */
const p0 = (G: GameState) => ({ haze: G.players['0'].active!, vindicta: G.players['0'].bench[0]!, lash: G.players['0'].bench[1]!, paige: G.players['0'].bench[2]! });
/** A merged Rem, built by hand: she sits on P0's bench slot 3 in place of Paige, then merges
 *  into `bearer` as the old Lil Helpers did — out of her slot (left empty), into the bearer's
 *  `attached`, the max HP she grants on it, for 3 of her owner's turns. No card merges Rem since
 *  the hero rebuild (her skill is Tag Along, a heal); the engine's merge machinery remains, and
 *  the oracles and invariants still read a merged Rem. */
function mergeRem(G: GameState, bearer: CardInstance): CardInstance {
  const rem = makeHero('hero_rem', '0', 'bench', 3);
  G.players['0'].bench[2] = null;
  rem.zone = 'equipment';
  rem.attachedTo = bearer.iid;
  rem.remMergeTurnsLeft = 3;
  rem.remMergeHpBuff = 1;
  bearer.hpMax += 1;
  bearer.hp += 1;
  (bearer.attached ??= []).push(rem);
  return rem;
}
/** The drafted match's opening, as the engine deals it: engine turn 1, the first mover (P1)
 *  on turn, P0's heroes all back in its deck, its hand empty and its first Active owed. Read
 *  with `OPENING`. */
function opening(): GameState {
  const G = clean();
  const ps = G.players['0'];
  for (const h of [ps.active!, ...ps.bench.filter((b): b is CardInstance => !!b)]) {
    h.zone = 'deck';
    h.slot = undefined;
    ps.deck.push(h);
  }
  ps.active = null;
  ps.bench = [null, null, null];
  ps.hand = [];
  G.turnNumber = 1;
  G.pendingActive = '0';
  return G;
}
const OPENING = ctx({ currentPlayer: '1', turn: 1 });

describe('the invariants fire on states built to break them', () => {
  it('a fresh ready game is clean, and so is the opening', () => {
    expect(checkInvariants(clean(), ctx())).toEqual([]);
    expect(checkInvariants(opening(), OPENING)).toEqual([]);
  });

  const cases: [string, (G: GameState) => void][] = [
    ['hero-hp-range', (G) => { G.players['0'].active!.hp = G.players['0'].active!.hpMax + 1; }],
    ['hero-hp-range', (G) => { G.players['0'].active!.hpMax = 0; G.players['0'].active!.hp = 0; }],
    ['corpse-state', (G) => { const h = G.players['1'].bench[0]!; h.respawnTurnsLeft = 2; h.hp = 0; h.statuses.push({ id: 'shield', value: 1, duration: 9 }); }],
    ['corpse-state', (G) => { const h = G.players['1'].bench[0]!; h.respawnTurnsLeft = 2; h.hp = 3; }],
    ['corpse-state', (G) => { G.players['1'].bench[0]!.respawnTurnsLeft = -1; }],
    ['living-hero-zero-hp', (G) => { G.players['1'].bench[0]!.hp = 0; }],
    // one item worn in two places
    ['iid-unique', (G) => { const it = giveItem(G, p0(G).haze, 'extra_spirit'); const v = p0(G).vindicta; v.attached = [{ ...it, attachedTo: v.iid }]; }],
    ['owner-matches', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').ownerId = '1'; }],
    ['bench-length', (G) => { G.players['0'].bench.push(null); }],
    ['bench-length', (G) => { (G.players['0'].bench as unknown[])[1] = undefined; }],
    ['zone-slot-match', (G) => { G.players['0'].bench[0]!.slot = 3; }],
    ['zone-slot-match', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').attachedTo = p0(G).vindicta.iid; }],
    ['zone-slot-match', (G) => { giveItem(G, p0(G).haze, 'grit').zone = 'bench'; }],
    ['item-slot-cap', (G) => { for (const id of ['extra_spirit', 'extra_health', 'extended_magazine', 'grit']) giveItem(G, p0(G).haze, id); }],
    ['item-duplicate', (G) => { giveItem(G, p0(G).haze, 'extra_spirit'); giveItem(G, p0(G).haze, 'extra_spirit'); }],
    ['attached-foreign', (G) => { p0(G).haze.attached = [{ ...G.players['1'].bench[0]!, ownerId: '0' }]; }],
    ['attached-foreign', (G) => { const it = giveItem(G, p0(G).haze, 'extra_spirit'); it.attached = [loose(G, 'grit', '0')]; }],
    ['souls-range', (G) => { G.players['0'].souls = 1.5; }],
    ['souls-range', (G) => { G.players['0'].souls = -1; }],
    // ---- the map ----
    ['structure-range', (G) => { G.players['0'].structures[0].hp = G.players['0'].structures[0].max + 1; }],
    ['structure-range', (G) => { G.players['0'].structures[1].hp = -1; }],
    ['structures-shape', (G) => { G.players['0'].structures.reverse(); }],
    ['structures-shape', (G) => { G.players['1'].structures.pop(); }],
    // the Walker scratched while the Guardian in front of it stands
    ['structure-order', (G) => { G.players['1'].structures[1].hp -= 1; }],
    ['patron-dead-no-gameover', (G) => { for (const s of G.players['1'].structures) s.hp = 0; }],
    // the flex slot without the enemy Walker felled, and the Walker felled without it
    ['flex-slot-walker', (G) => { G.players['0'].flexSlot = true; }],
    ['flex-slot-walker', (G) => { for (const s of G.players['1'].structures) if (s.kind !== 'patron') s.hp = 0; }],
    ['revive-credits', (G) => { G.players['0'].reviveCredits = REVIVE_CREDITS + 1; G.players['0'].reviveUntilRound = 9; }],
    // credits good through round 0, still held in round 1
    ['revive-lapsed', (G) => { G.players['0'].reviveCredits = 1; G.players['0'].reviveUntilRound = 0; }],
    ['boss-early', (G) => { raiseBoss(G); G.turnNumber = 2; }],
    ['boss-state', (G) => { raiseBoss(G).statuses.push({ id: 'bleed', value: 1, duration: 2 }); }],
    ['boss-state', (G) => { raiseBoss(G).ownerId = '1'; }],
    ['boss-state', (G) => { raiseBoss(G).hp = 0; }],
    ['boss-tally', (G) => { raiseBoss(G, 6); G.bossDamage = { '0': 1, '1': 1 }; }],
    ['boss-tally', (G) => { raiseBoss(G); G.bossDamage = { '0': -1, '1': 1 }; }],
    // round 4 has begun and no boss is up
    ['boss-due', (G) => { raiseBoss(G); G.boss = null; }],
    ['round-cap', (G) => { G.capped = true; }],
    ['round-cap', (G) => { G.turnNumber = 2 * ROUND_CAP + 2; }],
    // An empty Active slot with a hero on the bench to step up: an AI seat is promoted at once…
    ['active-corpse-unresolved', (G) => { G.players['1'].active = null; }],
    // …and the human seat is asked.
    ['active-corpse-unresolved', (G) => { G.players['0'].active = null; }],
    ['active-not-bench-only', (G) => { G.players['0'].active = makeHero('hero_rem', '0', 'active', 0); }],
    ['active-corpse-unresolved', (G) => { const a = G.players['1'].active!; a.hp = 0; a.respawnTurnsLeft = 3; }],
    ['pending-promotion-stale', (G) => { G.pendingPromotion = '0'; }],
    ['status-sanity', (G) => { G.players['0'].active!.statuses.push({ id: 'stun', value: 1, duration: 0 }); }],
    ['status-sanity', (G) => { G.players['0'].active!.statuses.push({ id: 'made_up', value: 1, duration: 1 }); }],
    ['status-duplicate', (G) => { G.players['0'].active!.statuses.push({ id: 'shield', value: 1, duration: 9 }, { id: 'shield', value: 2, duration: 9 }); }],
    ['level-exp', (G) => { G.players['0'].active!.level = 2; G.players['0'].active!.exp = 7; }],
    ['level-exp', (G) => { G.players['0'].active!.level = 4; G.players['0'].active!.exp = 2; }],
    ['level-range', (G) => { G.players['0'].active!.level = 5 as 4; }],
    ['stale-turn-flag', (G) => { G.players['1'].active!.skillUsedThisTurn = true; }],
    ['turn-number-sync', (G) => { G.turnNumber = 9; }],
    // Engine turn 2 is the second mover's: with P0 moving first it is not P0's.
    ['turn-owner-parity', (G) => { G.firstMover = '0'; }],
    // An AI seat is promoted on the spot; with no human seat, P0 is one too.
    ['active-corpse-unresolved', (G) => { G.humanSeat = null; const a = G.players['0'].active!; a.hp = 0; a.respawnTurnsLeft = 3; G.pendingPromotion = '0'; }],
    ['log-cap', (G) => { for (let i = 0; i < 201; i++) G.log.push({ turn: 1, text: 'x' }); }],
    ['fx-seq-monotonic', (G) => { G.fx = [{ kind: 'revive', iid: 'a', seq: 5 }, { kind: 'revive', iid: 'b', seq: 5 }]; }],
    ['roster-duplicate', (G) => { G.players['1'].bench[0] = makeHero('hero_haze', '1', 'bench', 1); }],
    // …a hero is one card, wherever it is: one in the hand that is also on the board is two
    ['roster-duplicate', (G) => { giveCard(G, '0', 'hero_haze'); }],
    ['draft-picks', (G) => { G.draft = { pool: ['hero_haze'], order: [], currentIndex: 0, picks: { '0': ['hero_haze'], '1': [] } }; }],
    ['rem-merge-turns', (G) => { const b = G.players['0'].active!; const rem = makeHero('hero_rem', '0', 'equipment', 0); rem.attachedTo = b.iid; rem.remMergeTurnsLeft = 0; b.attached = [rem]; }],
    ['rem-on-corpse', (G) => { const b = G.players['0'].bench[0]!; b.hp = 0; b.respawnTurnsLeft = 2; const rem = makeHero('hero_rem', '0', 'equipment', 0); rem.attachedTo = b.iid; rem.remMergeTurnsLeft = 2; b.attached = [rem]; }],
    // hard crowd control holds 0..2 charges; nothing else holds any
    ['item-charges', (G) => { giveItem(G, p0(G).haze, 'knockdown').charges = HARD_CC_CHARGES + 1; }],
    ['item-charges', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').charges = 1; }],
    // Cold Front is tier 2: its full cooldown is 2; a draw card's own is 2 at any tier
    ['cooldown-range', (G) => { giveItem(G, p0(G).haze, 'cold_front').cooldowns = { cold_front: 3 }; }],
    ['cooldown-range', (G) => { giveItem(G, p0(G).haze, 'superior_cooldown').cooldowns = { superior_cooldown: 3 }; }],
    ['cooldown-range', (G) => { p0(G).lash.cooldowns = { skill_lash: 1.5 }; }],
    ['cooldown-range', (G) => { p0(G).lash.cooldowns = { skill_lash: -1 }; }],
    ['item-cooldown-key', (G) => { giveItem(G, p0(G).haze, 'extra_spirit').cooldowns = { extra_spirit: 1 }; }],
    ['item-cooldown-key', (G) => { giveItem(G, p0(G).haze, 'knockdown').cooldowns = { knockdown: 1 }; }],
    ['item-cooldown-key', (G) => { giveItem(G, p0(G).haze, 'cold_front').cooldowns = { grit: 1 }; }],
    ['vitality-spike-sync', (G) => { for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(G, p0(G).haze, id); p0(G).haze.vitalitySpike = undefined; }],
    ['vitality-spike-sync', (G) => { p0(G).haze.vitalitySpike = true; }],
    // ---- the hands ----
    // a card in P0's hand that is P1's
    ['hand-owner', (G) => { giveCard(G, '0', 'extra_spirit').ownerId = '1'; }],
    // one card both held and worn
    ['iid-unique', (G) => { const it = giveItem(G, p0(G).haze, 'extra_spirit'); G.players['0'].hand.push({ ...it, zone: 'hand', attachedTo: undefined }); }],
    // one card both in the deck and in the hand
    ['iid-unique', (G) => { const [c] = stackDeck(G, '0', ['grit']); G.players['0'].hand.push({ ...c, zone: 'hand' }); }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'extra_spirit').zone = 'equipment'; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'extra_spirit').attachedTo = p0(G).haze.iid; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'extra_spirit').attached = [loose(G, 'grit', '0')]; }],
    // an item in the hand is set going by nothing: its cooldown starts when it is played, and it
    // carries no charges (it never comes back from a hero)
    ['hand-card-state', (G) => { giveCard(G, '0', 'cold_front').cooldowns = { cold_front: 2 }; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'knockdown').charges = 1; }],
    // a hero in the hand is clean: full HP, no status, no wait, in no slot, carrying items only
    ['hand-card-state', (G) => { const h = giveCard(G, '0', 'hero_yamato'); h.hp = h.hpMax - 1; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'hero_yamato').statuses.push({ id: 'shield', value: 1, duration: 9 }); }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'hero_yamato').respawnTurnsLeft = 1; }],
    ['hand-card-state', (G) => { giveCard(G, '0', 'hero_yamato').slot = 2; }],
    ['hand-card-state', (G) => { const h = giveCard(G, '0', 'hero_yamato'); h.attached = [{ ...makeHero('hero_rem', '0', 'equipment', 0), attachedTo: h.iid }]; }],
    // more items in hand than a draw ever brings
    ['hand-cap', (G) => { for (let i = 0; i <= MAX_HAND; i++) giveCard(G, '0', 'grit'); }],
    // ---- the decks and the discard piles ----
    ['deck-card-state', (G) => { stackDeck(G, '0', ['grit'])[0].zone = 'hand'; }],
    ['deck-card-state', (G) => { stackDeck(G, '0', ['cold_front'])[0].cooldowns = { cold_front: 1 }; }],
    ['deck-card-state', (G) => { stackDeck(G, '1', ['hero_yamato'])[0].hp = 1; }],
    ['discard-card-state', (G) => { const c = giveCard(G, '0', 'grit'); G.players['0'].hand.pop(); G.players['0'].discard.push(c); }],
    ['discard-card-state', (G) => { const c = giveCard(G, '0', 'cold_front'); G.players['0'].hand.pop(); c.zone = 'discard'; c.cooldowns = { cold_front: 1 }; G.players['0'].discard.push(c); }],
    ['owner-matches', (G) => { stackDeck(G, '1', ['grit'])[0].ownerId = '0'; }],
    // ---- the choices owed ----
    // the first Active owed while the seat has one, or past the opening, or by an AI seat
    ['pending-active', (G) => { G.pendingActive = '0'; }],
    ['pending-active', (G) => { giveCard(G, '1', 'hero_yamato'); G.players['1'].active = null; G.players['1'].bench = [null, null, null]; G.pendingActive = '1'; }],
    // a discard owed by the seat not on turn, or of more cards than its hand holds
    ['pending-discard', (G) => { giveCard(G, '1', 'grit'); G.pendingDiscard = { pid: '1', count: 1, cardId: 'improved_cooldown' }; }],
    ['pending-discard', (G) => { giveCard(G, '0', 'grit'); G.pendingDiscard = { pid: '0', count: 2, cardId: 'superior_cooldown' }; }],
    ['pending-discard', (G) => { giveCard(G, '0', 'grit'); G.pendingDiscard = { pid: '0', count: 1, cardId: 'grit' }; }],
  ];
  it.each(cases.map((c, i) => [`${c[0]} #${i}`, c] as const))('%s', (_label, [id, mutate]) => {
    const G = clean();
    mutate(G);
    expect(ids(G)).toContain(id);
  });

  it('what the rules allow is not reported: the flex slot\'s fourth item, a merged Rem beside three items, cards in the deck, the hand and the discard pile, a discard owed', () => {
    const G = clean();
    flex(G, '0');
    for (const id of ['extra_spirit', 'extra_health', 'extended_magazine', 'grit']) giveItem(G, p0(G).haze, id);
    expect(ids(G)).toEqual([]);
    const H = clean();
    for (const id of ['extra_spirit', 'extra_health', 'extended_magazine']) giveItem(H, p0(H).vindicta, id);
    mergeRem(H, p0(H).vindicta);
    expect(ids(H)).toEqual([]);
    // Cards held — items, duplicates, the rival's, a hero back from a fall carrying what it wore —,
    // cards in the deck (items and a hero), the discard pile (an item, a hero with its items), and
    // a discard owed by the player on turn.
    const K = clean();
    giveCard(K, '0', 'extra_spirit');
    giveCard(K, '0', 'titanic_magazine');
    giveCard(K, '0', 'titanic_magazine');
    giveCard(K, '1', 'cold_front');
    const back = giveCard(K, '0', 'hero_yamato');
    back.level = 2;
    giveItem(K, back, 'extra_health');
    stackDeck(K, '0', ['grit', 'hero_mirage', 'cold_front']);
    stackDeck(K, '1', ['knockdown']);
    const gone = giveCard(K, '0', 'grit');
    K.players['0'].hand.pop();
    gone.zone = 'discard';
    K.players['0'].discard.push(gone);
    const fallen = giveCard(K, '1', 'hero_wraith');
    K.players['1'].hand.pop();
    giveItem(K, fallen, 'extra_spirit');
    fallen.zone = 'discard';
    K.players['1'].discard.push(fallen);
    K.pendingDiscard = { pid: '0', count: 2, cardId: 'superior_cooldown' };
    expect(ids(K)).toEqual([]);
    // A fallen hero back in a hand may take it past MAX_HAND: it is no draw.
    const F = clean();
    for (let i = 0; i < MAX_HAND; i++) giveCard(F, '0', 'grit');
    giveCard(F, '0', 'hero_yamato');
    expect(ids(F)).toEqual([]);
    // An empty Active slot with nobody on the bench to step up owes nothing.
    const E = clean();
    E.players['1'].active = null;
    E.players['1'].bench = [null, null, null];
    giveCard(E, '1', 'hero_abrams');
    expect(ids(E)).toEqual([]);
  });

  it('net worth counts the hand: an engine reading that leaves the hand out is reported', () => {
    const G = clean();
    giveCard(G, '0', 'glass_cannon');
    giveCard(G, '0', 'hero_yamato'); // a hero card lists at 0
    expect(netWorthOracle(G, '0')).toBe(PRICE[4]);
    expect(netWorthOracleWithoutHand(G, '0')).toBe(0);
    expect(ids(G)).not.toContain('net-worth-hand');
    const spy = vi.spyOn(query, 'netWorth').mockImplementation((g, pid) => netWorthOracleWithoutHand(g, pid));
    try {
      expect(ids(G)).toContain('net-worth-hand');
    } finally {
      spy.mockRestore();
    }
  });

  it('a state that is merely finished (game over) is not reported for the winner\'s patron or a corpse Active', () => {
    const G = clean();
    for (const s of G.players['1'].structures) s.hp = 0;
    expect(ids(G, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('patron-dead-no-gameover');
  });

  it('a match over names the winner the rules give: the side whose Patron stands, or — the round cap — what stands', () => {
    const G = clean();
    for (const s of G.players['1'].structures) s.hp = 0;
    expect(ids(G, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('game-over-winner');
    expect(ids(G, ctx({ gameover: { winner: '1' } } as Partial<Ctx>))).toContain('game-over-winner');
    // No Patron fell and no cap: no reason for a result.
    expect(ids(clean(), ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).toContain('game-over-winner');
    // The cap: more structure HP wins; a tie, more net worth; still tied, the second mover (P0 here).
    const C = clean();
    C.capped = true;
    pushOff(C, '0', 3);
    expect(ids(C, ctx({ gameover: { winner: '1' } } as Partial<Ctx>))).not.toContain('game-over-winner');
    expect(ids(C, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).toContain('game-over-winner');
    const T = clean();
    T.capped = true;
    expect(ids(T, ctx({ gameover: { winner: '0' } } as Partial<Ctx>))).not.toContain('game-over-winner');
    T.players['1'].souls = 5;
    expect(ids(T, ctx({ gameover: { winner: '1' } } as Partial<Ctx>))).not.toContain('game-over-winner');
  });

  it('the map as the rules leave it is not reported: a felled Guardian, a Mid-Boss chipped by both, a live Rejuvenator, a Patron-only track', () => {
    const G = clean();
    pushOff(G, '1', 5); // the Guardian down, the Walker scratched
    G.players['0'].reviveCredits = 2; G.players['0'].reviveUntilRound = 6;
    const boss = raiseBoss(G, 7);
    G.bossDamage = { '0': 2, '1': 1 };
    expect(boss.hp).toBe(7);
    expect(ids(G, ctx({ turn: 8 }))).toEqual([]);
    const S = clean();
    setTrack(S, '0', { patron: 4 });
    setTrack(S, '1', { patron: 1 });
    expect(ids(S)).toEqual([]);
  });
});

describe('the transition rules fire', () => {
  const pair = (mutate: (after: GameState) => void, base: GameState = clean()) => {
    const before = base;
    const after = structuredClone(before) as GameState;
    mutate(after);
    return { before: { G: before, ctx: ctx() }, after: { G: after, ctx: ctx() } };
  };
  type Pair = ReturnType<typeof pair>;
  const ids2 = (p: Pair, move = 'useSkill', accepted = true, c?: Ctx) =>
    collectTransitionViolations(p.before, c ? { G: p.after.G, ctx: c } : p.after, { name: move, args: [] }, accepted).map((v) => v.id);
  const moveIds = (p: Pair, name: string, args: unknown[], c?: Ctx) =>
    collectTransitionViolations(p.before, c ? { G: p.after.G, ctx: c } : p.after, { name, args }, true).map((v) => v.id);
  const heroIid = (p: Pair) => p.before.G.players['0'].active!.iid;

  /** A real move made by P0 (or `as`, with `c`) on a clone of `G`: the pair it leaves, and a way to break it. */
  function made(G: GameState, name: string, args: unknown[], c: Ctx = ctx(), as: PlayerID = '0') {
    const r = callMove(G, c, as, name, args);
    expect(r.outcome, `${name}(${JSON.stringify(args)})`).toBe('accepted');
    const p = { before: { G, ctx: c }, after: { G: r.G, ctx: c } };
    const check = (mutate?: (after: GameState) => void) => {
      const after = structuredClone(r.G) as GameState;
      mutate?.(after);
      return collectTransitionViolations(p.before, { G: after, ctx: c }, { name, args }, true).map((v) => v.id);
    };
    return { ...p, check };
  }
  /** Where a card is after a move. */
  const at = (A: GameState, iid: string) => everyCard(A).find((x) => x.card.iid === iid)!;

  it('structures lose HP with no hero falling', () => {
    expect(ids2(pair((G) => { pushOff(G, '1', 1); }))).toContain('structure-delta');
  });
  it('a hero falls and pushes nothing', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = RESPAWN_TURNS; }))).toContain('structure-delta');
  });
  it('a hero falls and pushes its level + 1 (2 for a fresh one): fine; the old 1 is not', () => {
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = RESPAWN_TURNS; pushOff(G, '1', 2); }))).not.toContain('structure-delta');
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = RESPAWN_TURNS; pushOff(G, '1', 1); }))).toContain('structure-delta');
  });
  it('a fallen hero waits RESPAWN_TURNS of its owner\'s turns, whatever the round — not the old one turn of round 1', () => {
    expect(RESPAWN_TURNS).toBe(2);
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 2; pushOff(G, '1', 2); }))).not.toContain('respawn-timer-start');
    expect(ids2(pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = 1; pushOff(G, '1', 2); }))).toContain('respawn-timer-start');
    // …and with no wait it would be off the board, in the hand: with a wait of 2, that is a breach.
    expect(ids2(pair((G) => {
      const ps = G.players['1'];
      const h = ps.bench[0]!;
      ps.bench[0] = null;
      h.zone = 'hand'; h.slot = undefined;
      ps.hand.push(h);
      pushOff(G, '1', 2);
    }))).toContain('respawn-timer-start');
  });
  it('a side with a live Rejuvenator has its fallen hero back in place, a credit spent', () => {
    const base = clean();
    base.players['1'].reviveCredits = 2; base.players['1'].reviveUntilRound = 3;
    const stayedDown = pair((G) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = RESPAWN_TURNS; pushOff(G, '1', 2); }, base);
    expect(ids2(stayedDown)).toContain('revive-owed');
    const kept = pair((G) => { G.players['1'].reviveCredits = 1; }, base);
    expect(ids2(kept)).toContain('revive-spend');
  });
  it('an item vanishes from the board; one appears from nowhere', () => {
    const base = clean();
    giveItem(base, p0(base).haze, 'extra_spirit');
    expect(ids2(pair((G) => { G.players['0'].active!.attached = []; G.players['0'].active!.spiritMod -= 1; }, base))).toContain('card-vanished');
    expect(ids2(pair((G) => { giveItem(G, G.players['0'].bench[0]!, 'grit'); }))).toContain('card-appeared');
  });
  it('a card vanishes from the hand, the deck or the discard pile; one appears in them from nowhere', () => {
    const base = clean();
    giveCard(base, '0', 'extra_spirit');
    stackDeck(base, '1', ['grit']);
    expect(ids2(pair((G) => { G.players['0'].hand = []; }, base))).toContain('card-vanished');
    expect(ids2(pair((G) => { G.players['1'].deck = []; }, base))).toContain('card-vanished');
    expect(ids2(pair((G) => { giveCard(G, '1', 'grit'); }))).toContain('card-appeared');
    expect(ids2(pair((G) => { stackDeck(G, '0', ['grit']); }))).toContain('card-appeared');
  });
  it('a play makes the upgrade its item builds into, shuffled into the deck — one, and the one named; an upgrade onto the hero wearing its component evolves it, the component to the discard pile', () => {
    const G = clean();
    G.players['0'].souls = 30;
    // Extended Magazine builds into Titanic Magazine and Escalating Resilience: the first, unless one is named.
    expect(upgradesOfOracle('extended_magazine')).toEqual(['titanic_magazine', 'escalating_resilience']);
    const mag = giveCard(G, '0', 'extended_magazine');
    const play = made(G, 'playCard', [mag.iid, p0(G).vindicta.iid]);
    expect(play.after.G.players['0'].deck.map((c) => c.cardId)).toEqual(['titanic_magazine']);
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { A.players['0'].deck = []; })).toContain('played-card-state'); // no upgrade made
    expect(play.check((A) => { A.players['0'].deck[0].cardId = 'escalating_resilience'; })).toContain('card-appeared'); // the wrong one
    expect(play.check((A) => { stackDeck(A, '0', ['titanic_magazine']); })).toContain('card-appeared'); // two of it
    const named = made(G, 'playCard', [mag.iid, p0(G).vindicta.iid, 'escalating_resilience']);
    expect(named.after.G.players['0'].deck.map((c) => c.cardId)).toEqual(['escalating_resilience']);
    expect(named.check()).toEqual([]);
    expect(named.check((A) => { A.players['0'].deck[0].cardId = 'titanic_magazine'; })).toContain('card-appeared');
    // Titanic Magazine onto the hero wearing Extended Magazine: it evolves, the magazine to the discard pile.
    const E = clean();
    E.players['0'].souls = 30;
    const worn = giveItem(E, p0(E).haze, 'extended_magazine');
    const titanic = giveCard(E, '0', 'titanic_magazine');
    const evolve = made(E, 'playCard', [titanic.iid, p0(E).haze.iid]);
    expect(at(evolve.after.G, worn.iid).place).toBe('discard');
    expect(evolve.check()).toEqual([]);
    expect(evolve.check((A) => { A.players['0'].discard = []; })).toContain('card-vanished');
    expect(evolve.check((A) => {
      const m = A.players['0'].discard.pop()!;
      const h = A.players['0'].active!;
      h.attached!.push({ ...m, zone: 'equipment', attachedTo: h.iid });
      h.atkMod += 1;
    })).toContain('played-card-state');
  });
  it('a non-endTurn move hands the turn over / endTurn does not', () => {
    expect(ids2(pair(() => undefined), 'useSkill', true, ctx({ currentPlayer: '1' }))).toContain('turn-owner');
    expect(ids2(pair(() => undefined), 'endTurn', true)).toContain('turn-owner');
  });
  it('turn flags survive an endTurn', () => {
    const p = pair((G) => { G.players['0'].active!.skillUsedThisTurn = true; G.turnNumber = 3; G.players['1'].souls = LANE_INCOME; });
    expect(ids2(p, 'endTurn', true, ctx({ currentPlayer: '1' }))).toContain('end-turn-flags');
  });
  it('a hero\'s level never goes down — in the hand too', () => {
    const base = clean();
    p0(base).lash.level = 2;
    expect(ids2(pair((G) => { G.players['0'].bench[1]!.level = 1; }, base))).toContain('level-monotonic');
    const H = clean();
    giveCard(H, '0', 'hero_yamato').level = 3;
    expect(ids2(pair((G) => { G.players['0'].hand[0].level = 1; }, H))).toContain('level-monotonic');
  });

  it('souls: an ability charges its kit price — a skill its souls, an ultimate its size\'s —, a passive-only hero nothing, and nothing pays the rival', () => {
    const base = clean();
    base.players['0'].souls = 20;
    const lash = p0(base).lash.iid; // Ground Strike: 3 souls; Death Slam, large: 12
    const paid = (n: number) => pair((G) => { G.players['0'].souls -= n; }, base);
    expect(moveIds(paid(3), 'useSkill', [lash])).not.toContain('souls-delta');
    expect(moveIds(paid(0), 'useSkill', [lash])).toContain('souls-delta'); // used for free
    expect(moveIds(paid(2), 'useSkill', [lash])).toContain('souls-delta'); // short-charged
    expect(moveIds(paid(ULT_COST.large), 'useSkill', [lash, undefined, 'eff_ult_lash'])).not.toContain('souls-delta');
    expect(moveIds(paid(3), 'useSkill', [lash, undefined, 'eff_ult_lash'])).toContain('souls-delta'); // the skill's price
    // Haze has no skill (Fixation is a passive): a bare useSkill of hers charges nothing.
    const p = pair((G) => { G.players['0'].souls -= 1; });
    expect(moveIds(p, 'useSkill', [heroIid(p)])).toContain('souls-delta');
    const q = pair((G) => { G.players['1'].souls += 2; });
    expect(moveIds(q, 'useSkill', [heroIid(q)])).toContain('souls-delta'); // nothing pays the rival
    const r = pair(() => undefined);
    expect(moveIds(r, 'useSkill', [heroIid(r)])).not.toContain('souls-delta');
  });
  it('a kill pays no souls (the lane\'s income is the only souls there are): the old bounty is reported', () => {
    const fall = (G: GameState) => { const h = G.players['1'].bench[0]!; h.hp = 0; h.respawnTurnsLeft = RESPAWN_TURNS; pushOff(G, '1', 2); };
    expect(moveIds(pair((G) => { fall(G); }), 'attack', [])).not.toContain('souls-delta');
    expect(moveIds(pair((G) => { fall(G); G.players['0'].souls += 2; }), 'attack', [])).toContain('souls-delta');
  });
  it('souls: a play costs the item\'s price — the difference for an evolving upgrade —; a hero placed, a discard and a promotion are free', () => {
    const G = clean();
    G.players['0'].souls = 10;
    const mag = giveCard(G, '0', 'extended_magazine');
    const play = made(G, 'playCard', [mag.iid, p0(G).haze.iid]);
    expect(play.after.G.players['0'].souls).toBe(8);
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { A.players['0'].souls += 1; })).toContain('souls-delta');
    const titanic = giveCard(play.after.G, '0', 'titanic_magazine');
    const up = made(play.after.G, 'playCard', [titanic.iid, p0(G).haze.iid]); // 4 - 2 over the worn magazine
    expect(up.after.G.players['0'].souls).toBe(6);
    expect(up.check()).toEqual([]);
    expect(up.check((A) => { A.players['0'].souls -= 2; })).toContain('souls-delta'); // the full price
    // A hero onto the bench: free.
    const H = clean();
    H.players['0'].bench[2] = null;
    const yamato = giveCard(H, '0', 'hero_yamato');
    const place = made(H, 'placeHero', [yamato.iid]);
    expect(place.check()).toEqual([]);
    expect(place.check((A) => { A.players['0'].souls += 1; })).toContain('souls-delta');
    // A discard: free.
    const D = clean();
    const grit = giveCard(D, '0', 'grit');
    D.pendingDiscard = { pid: '0', count: 1, cardId: 'improved_cooldown' };
    const disc = made(D, 'discard', [[grit.iid]]);
    expect(disc.check()).toEqual([]);
    expect(disc.check((A) => { A.players['0'].souls = 1; })).toContain('souls-delta');
  });
  it('souls: an item used pays what its text says (Golden Goose Egg: 2), a Retreat costs the leaving hero\'s printed retreat (Haze 1, Lady Geist 2)', () => {
    const G = clean();
    const egg = giveItem(G, p0(G).vindicta, 'golden_goose_egg');
    const use = made(G, 'activate', [egg.iid]);
    expect(use.after.G.players['0'].souls).toBe(2);
    expect(use.check()).toEqual([]);
    expect(use.check((A) => { A.players['0'].souls = 3; })).toContain('souls-delta');
    const H = clean();
    H.players['0'].souls = 3;
    const retreat = made(H, 'moveHero', [1, 0]);
    expect(retreat.after.G.players['0'].souls).toBe(2);
    expect(retreat.check()).toEqual([]);
    expect(retreat.check((A) => { A.players['0'].souls = 3; })).toContain('souls-delta');
    const W = clean();
    W.players['0'].souls = 3;
    W.players['0'].active = makeHero('hero_lady_geist', '0', 'active', 0);
    const heavy = made(W, 'moveHero', [1, 0]);
    expect(heavy.after.G.players['0'].souls).toBe(1);
    expect(heavy.check()).toEqual([]);
    expect(heavy.check((A) => { A.players['0'].souls = 2; })).toContain('souls-delta'); // the old flat 1
  });
  it('the Act: after the attack only endTurn and a promotion are accepted — no card played either; one Retreat a turn; nothing around a choice owed', () => {
    const p = pair(() => undefined);
    p.before.G.attackUsed = true;
    expect(moveIds(p, 'useSkill', [heroIid(p)])).toContain('act-over');
    expect(moveIds(p, 'playCard', [])).toContain('act-over');
    expect(moveIds(p, 'placeHero', [])).toContain('act-over');
    expect(moveIds(p, 'promoteToActive', [])).not.toContain('act-over');
    const q = pair(() => undefined);
    q.before.G.retreatUsed = true;
    expect(moveIds(q, 'moveHero', [1, 0])).toContain('retreat-once');
    expect(moveIds(q, 'moveHero', [1, 2])).not.toContain('retreat-once');
    const d = pair(() => undefined);
    giveCard(d.before.G, '0', 'grit');
    d.before.G.pendingDiscard = { pid: '0', count: 1, cardId: 'improved_cooldown' };
    expect(moveIds(d, 'useSkill', [heroIid(d)])).toContain('choice-owed');
    expect(moveIds(d, 'endTurn', [])).toContain('choice-owed');
    const o = pair(() => undefined, opening());
    expect(moveIds(o, 'placeHero', [], OPENING)).toContain('choice-owed');
  });
  it('a Retreat spends the leaving hero\'s Swift', () => {
    const G = clean();
    p0(G).haze.statuses.push({ id: 'swift', value: 1, duration: 1 });
    const retreat = made(G, 'moveHero', [1, 0]);
    expect(retreat.check()).toEqual([]);
    expect(retreat.check((A) => { A.players['0'].bench[0]!.statuses.push({ id: 'swift', value: 1, duration: 1 }); })).toContain('swift-spent');
  });
  it('an ability arms its cooldown: a skill its own, an ultimate ULT_COOLDOWN; a locked ultimate is never used', () => {
    const skill = pair((G) => { G.players['0'].bench[1]!.cooldowns = { skill_lash: 1 }; });
    const lash = skill.before.G.players['0'].bench[1]!.iid;
    expect(moveIds(skill, 'useSkill', [lash])).not.toContain('ability-cooldown');
    const unarmed = pair(() => undefined);
    expect(moveIds(unarmed, 'useSkill', [lash])).toContain('ability-cooldown');
    const ult = pair((G) => { G.players['0'].bench[1]!.cooldowns = { eff_ult_lash: ULT_COOLDOWN }; });
    expect(moveIds(ult, 'useSkill', [lash, undefined, 'eff_ult_lash'])).toContain('ult-locked'); // Lash is level 1
    ult.before.G.players['0'].bench[1]!.level = 2;
    expect(moveIds(ult, 'useSkill', [lash, undefined, 'eff_ult_lash'])).not.toContain('ult-locked');
    // A real ultimate: ULT_COOLDOWN, the Cooldown items no longer cutting it (they draw cards now).
    // Death Slam is a large ultimate: 12 souls.
    const G = clean();
    G.players['0'].souls = ULT_COST.large;
    p0(G).lash.level = 2;
    giveItem(G, p0(G).lash, 'improved_cooldown');
    const used = made(G, 'useSkill', [p0(G).lash.iid, undefined, 'eff_ult_lash']);
    expect(used.after.G.players['0'].bench[1]!.cooldowns?.eff_ult_lash).toBe(ULT_COOLDOWN);
    expect(used.after.G.players['0'].souls).toBe(0);
    expect(used.check()).toEqual([]);
    expect(used.check((A) => { A.players['0'].bench[1]!.cooldowns = { eff_ult_lash: ULT_COOLDOWN - 1 }; })).toContain('ability-cooldown');
  });

  it('a draw card draws from the top of the deck and owes its discard — fewer into a nearly full hand or from a short deck, none owed from an empty hand', () => {
    const G = clean();
    giveCard(G, '0', 'grit');
    stackDeck(G, '0', ['cold_front', 'extra_spirit', 'knockdown']);
    const compress = giveItem(G, p0(G).vindicta, 'improved_cooldown');
    const use = made(G, 'activate', [compress.iid]);
    expect(use.after.G.players['0'].hand.map((c) => c.cardId)).toEqual(['grit', 'cold_front', 'extra_spirit']);
    expect(use.after.G.pendingDiscard).toEqual({ pid: '0', count: 1, cardId: 'improved_cooldown' });
    expect(use.check()).toEqual([]);
    expect(use.check((A) => { A.pendingDiscard = undefined; })).toContain('draw-card');
    expect(use.check((A) => { A.pendingDiscard!.count = 2; })).toContain('draw-card');
    expect(use.check((A) => { const ps = A.players['0']; const c = ps.hand.pop()!; c.zone = 'deck'; ps.deck.unshift(c); })).toContain('draw-card'); // one drawn, not two
    expect(use.check((A) => { const ps = A.players['0']; [ps.hand[1], ps.deck[0]] = [{ ...ps.deck[0], zone: 'hand' }, { ...ps.hand[1], zone: 'deck' }]; })).toContain('draw-card'); // not the top card
    // Into a hand one short of MAX_HAND: one card drawn, one owed.
    const F = clean();
    for (let i = 0; i < MAX_HAND - 1; i++) giveCard(F, '0', 'grit');
    stackDeck(F, '0', ['cold_front', 'extra_spirit']);
    const full = made(F, 'activate', [giveItem(F, p0(F).vindicta, 'improved_cooldown').iid]);
    expect(full.after.G.players['0'].hand).toHaveLength(MAX_HAND);
    expect(full.after.G.players['0'].deck).toHaveLength(1);
    expect(full.check()).toEqual([]);
    // An empty deck and an empty hand: nothing drawn, nothing owed.
    const Z = clean();
    const none = made(Z, 'activate', [giveItem(Z, p0(Z).vindicta, 'superior_cooldown').iid]);
    expect(none.after.G.pendingDiscard).toBeUndefined();
    expect(none.check()).toEqual([]);
    expect(none.check((A) => { giveCard(A, '0', 'grit'); A.pendingDiscard = { pid: '0', count: 1, cardId: 'superior_cooldown' }; })).toContain('draw-card');
  });
  it('a discard: the cards named go to the discard pile and that much of the debt is paid', () => {
    const G = clean();
    const [a, b] = [giveCard(G, '0', 'grit'), giveCard(G, '0', 'cold_front')];
    giveCard(G, '0', 'extra_spirit');
    G.pendingDiscard = { pid: '0', count: 2, cardId: 'superior_cooldown' };
    const one = made(G, 'discard', [[a.iid]]);
    expect(one.after.G.pendingDiscard?.count).toBe(1);
    expect(one.check()).toEqual([]);
    expect(one.check((A) => { A.pendingDiscard = undefined; })).toContain('discard-move');
    expect(one.check((A) => { const c = A.players['0'].discard.pop()!; A.players['1'].discard.push({ ...c, ownerId: '1' }); })).toContain('discard-move');
    const both = made(G, 'discard', [[a.iid, b.iid]]);
    expect(both.after.G.pendingDiscard).toBeUndefined();
    expect(both.check()).toEqual([]);
    expect(both.check((A) => { A.pendingDiscard = { pid: '0', count: 1, cardId: 'superior_cooldown' }; })).toContain('discard-move');
  });
  it('a hero from the hand: onto the bench, into an empty lane, and the opening\'s first Active', () => {
    const G = clean();
    G.players['0'].bench[2] = null;
    const yamato = giveCard(G, '0', 'hero_yamato');
    const place = made(G, 'placeHero', [yamato.iid]);
    expect(place.after.G.players['0'].bench[2]?.iid).toBe(yamato.iid);
    expect(place.check()).toEqual([]);
    expect(place.check((A) => { const ps = A.players['0']; const h = ps.bench[2]!; ps.bench[2] = null; ps.hand.push({ ...h, zone: 'hand', slot: undefined }); })).toContain('placed-hero');
    const L = clean();
    L.players['0'].active = null;
    L.players['0'].bench = [null, null, null];
    const lane = made(L, 'placeHero', [giveCard(L, '0', 'hero_yamato').iid, true]);
    expect(lane.after.G.players['0'].active?.cardId).toBe('hero_yamato');
    expect(lane.check()).toEqual([]);
    const O = opening();
    const haze = O.players['0'].deck.find((c) => c.cardId === 'hero_haze')!;
    const first = made(O, 'chooseActive', [haze.iid], OPENING, '1');
    expect(first.after.G.players['0'].active?.iid).toBe(haze.iid);
    expect(first.after.G.players['0'].deck).not.toContain(haze);
    expect(first.check()).toEqual([]);
    expect(first.check((A) => { A.pendingActive = '0'; })).toContain('placed-hero');
  });
  it('a play: the card goes from the hand onto the hero named; an active starts on its full cooldown (its own, else its tier\'s) or with its charges', () => {
    const G = clean();
    G.players['0'].souls = 40;
    const cold = giveCard(G, '0', 'cold_front');
    const play = made(G, 'playCard', [cold.iid, p0(G).haze.iid]);
    expect(at(play.after.G, cold.iid).card).toMatchObject({ zone: 'equipment', attachedTo: p0(G).haze.iid, cooldowns: { cold_front: 2 } });
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { at(A, cold.iid).card.cooldowns = { cold_front: 1 }; })).toContain('played-card-state');
    // left in the hand, or put on another hero than the one named
    expect(play.check((A) => {
      const h = A.players['0'].active!;
      const it = at(A, cold.iid).card;
      h.attached = h.attached!.filter((x) => x !== it);
      A.players['0'].hand.push({ ...it, zone: 'hand', attachedTo: undefined, cooldowns: undefined });
    })).toContain('played-card-state');
    expect(play.check((A) => {
      const it = at(A, cold.iid).card;
      A.players['0'].active!.attached = [];
      const v = A.players['0'].bench[0]!;
      v.attached = [{ ...it, attachedTo: v.iid }];
    })).toContain('played-card-state');
    const knock = giveCard(G, '0', 'knockdown');
    const k = made(G, 'playCard', [knock.iid, p0(G).lash.iid]);
    expect(at(k.after.G, knock.iid).card.charges).toBe(HARD_CC_CHARGES);
    expect(k.check()).toEqual([]);
    expect(k.check((A) => { at(A, knock.iid).card.charges = 1; })).toContain('played-card-state');
    // A tier 3 active starts on 3; Superior Cooldown, tier 3, on its own 2.
    const fire = giveCard(G, '0', 'alchemical_fire');
    const f = made(G, 'playCard', [fire.iid, p0(G).haze.iid]);
    expect(at(f.after.G, fire.iid).card.cooldowns).toEqual({ alchemical_fire: 3 });
    expect(f.check()).toEqual([]);
    const sup = giveCard(G, '0', 'superior_cooldown');
    const s = made(G, 'playCard', [sup.iid, p0(G).paige.iid]);
    expect(at(s.after.G, sup.iid).card.cooldowns).toEqual({ superior_cooldown: 2 });
    expect(s.check()).toEqual([]);
    expect(s.check((A) => { at(A, sup.iid).card.cooldowns = { superior_cooldown: 3 }; })).toContain('played-card-state');
  });
  it('a play never leaves a hero over its slot cap', () => {
    const G = clean();
    G.players['0'].souls = 10;
    for (const id of ['extra_health', 'extra_regen']) giveItem(G, p0(G).haze, id);
    const card = giveCard(G, '0', 'extra_spirit');
    const play = made(G, 'playCard', [card.iid, p0(G).haze.iid]);
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { giveItem(A, A.players['0'].active!, 'mystic_burst'); })).toContain('play-slot-cap');
    // with the flex slot a fourth is no breach
    const F = clean();
    F.players['0'].souls = 10;
    flex(F, '0');
    for (const id of ['extra_health', 'extra_regen', 'mystic_burst']) giveItem(F, p0(F).haze, id);
    const fourth = giveCard(F, '0', 'extra_spirit');
    expect(made(F, 'playCard', [fourth.iid, p0(F).haze.iid]).check()).toEqual([]);
  });
  // Items no longer move between heroes and nothing is sold: these rules went with the shop and
  // have no deck equivalent (an item comes off a hero only when an upgrade evolves it, above).
  it.skip('a move carries the item\'s cooldown, charges and purchase record, and lets an upgrade\'s component go', () => {});
  it.skip('a sale takes the card out of play — from the hand or off its hero — and a same-turn upgrade\'s sale puts its component back where the rules say', () => {});
  it('the bonus goes on with a play, and off the hero with the component an upgrade evolves', () => {
    const G = clean();
    G.players['0'].souls = 30;
    const mag = giveCard(G, '0', 'extended_magazine');
    const play = made(G, 'playCard', [mag.iid, p0(G).haze.iid]);
    expect(play.after.G.players['0'].active!.atkMod).toBe(p0(G).haze.atkMod + 1);
    expect(play.check()).toEqual([]);
    expect(play.check((A) => { A.players['0'].active!.atkMod += 1; })).toContain('equip-bonus');
    expect(play.check((A) => { A.players['0'].bench[0]!.hp -= 1; })).toContain('equip-bonus');
    // Extra Health's +2 HP: current HP rises with it (Haze at full HP, her card's 4).
    const eh = giveCard(G, '0', 'extra_health');
    const hazeHp = p0(G).haze.hpMax;
    expect(p0(G).haze.hp).toBe(hazeHp);
    const hp = made(G, 'playCard', [eh.iid, p0(G).haze.iid]);
    expect([hp.after.G.players['0'].active!.hp, hp.after.G.players['0'].active!.hpMax]).toEqual([hazeHp + 2, hazeHp + 2]);
    expect(hp.check((A) => { A.players['0'].active!.hp -= 1; })).toContain('equip-bonus');
    // the Vitality spike: a third Vitality item played adds 1 more max HP
    const V = clean();
    V.players['0'].souls = 10;
    const vBase = p0(V).haze.hpMax;
    giveItem(V, p0(V).haze, 'extra_regen');
    giveItem(V, p0(V).haze, 'sprint_boots');
    const third = giveCard(V, '0', 'extra_health');
    const spike = made(V, 'playCard', [third.iid, p0(V).haze.iid]);
    expect(spike.after.G.players['0'].active!.hpMax).toBe(vBase + 2 + 1);
    expect(spike.check()).toEqual([]);
    expect(spike.check((A) => { A.players['0'].active!.hpMax -= 1; A.players['0'].active!.hp -= 1; })).toContain('equip-bonus');
    // an evolution: Titanic's +2 on, Extended's +1 off — +1 in all
    const E = clean();
    E.players['0'].souls = 10;
    giveItem(E, p0(E).haze, 'extended_magazine');
    const titanic = giveCard(E, '0', 'titanic_magazine');
    const evolve = made(E, 'playCard', [titanic.iid, p0(E).haze.iid]);
    expect(evolve.after.G.players['0'].active!.atkMod).toBe(p0(E).haze.atkMod + 1);
    expect(evolve.check()).toEqual([]);
    expect(evolve.check((A) => { A.players['0'].active!.atkMod += 1; })).toContain('equip-bonus');
  });
  it('exp: +1 for a hero\'s first wearing of an item played onto it — not for a re-play or a corpse; a hero never forgets', () => {
    const G = clean();
    G.players['0'].souls = 10;
    const card = giveCard(G, '0', 'extra_spirit');
    const first = made(G, 'playCard', [card.iid, p0(G).haze.iid]);
    expect(first.after.G.players['0'].active!.exp).toBe(1);
    expect(first.check()).toEqual([]);
    expect(first.check((A) => { A.players['0'].active!.exp = 0; })).toContain('equip-exp');
    expect(first.check((A) => { A.players['0'].active!.equippedIds = []; })).toContain('equip-exp');
    const H = clean();
    H.players['0'].souls = 10;
    p0(H).haze.equippedIds = ['extra_spirit'];
    const again = giveCard(H, '0', 'extra_spirit');
    const replay = made(H, 'playCard', [again.iid, p0(H).haze.iid]);
    expect(replay.after.G.players['0'].active!.exp).toBe(0);
    expect(replay.check()).toEqual([]);
    expect(replay.check((A) => { A.players['0'].active!.exp = 1; })).toContain('equip-exp');
    const C = clean();
    C.players['0'].souls = 10;
    const corpse = p0(C).vindicta;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    const held = giveCard(C, '0', 'extra_spirit');
    const dead = made(C, 'playCard', [held.iid, corpse.iid]);
    expect(dead.check()).toEqual([]);
    expect(dead.check((A) => { A.players['0'].bench[0]!.exp = 1; })).toContain('equip-exp');
  });
  it('an item used spends its bearer\'s ability and arms its cooldown — its own for a draw card — or spends a charge', () => {
    const G = clean();
    const cold = giveItem(G, p0(G).vindicta, 'cold_front');
    const use = made(G, 'activate', [cold.iid, G.players['1'].active!.iid]);
    expect(use.check()).toEqual([]);
    expect(use.check((A) => { A.players['0'].bench[0]!.skillUsedThisTurn = false; })).toContain('activate-spends');
    expect(use.check((A) => { A.players['0'].bench[0]!.attached![0].cooldowns = { cold_front: 1 }; })).toContain('activate-spends');
    const knock = giveItem(G, p0(G).lash, 'knockdown');
    const k = made(G, 'activate', [knock.iid, G.players['1'].active!.iid]);
    expect(k.after.G.players['0'].bench[1]!.attached![0].charges).toBe(1);
    expect(k.check()).toEqual([]);
    expect(k.check((A) => { A.players['0'].bench[1]!.attached![0].charges = 2; })).toContain('activate-spends');
    const trans = giveItem(G, p0(G).paige, 'transcendent_cooldown');
    const t = made(G, 'activate', [trans.iid]);
    expect(t.after.G.players['0'].bench[2]!.attached![0].cooldowns).toEqual({ transcendent_cooldown: 2 });
    expect(t.check()).toEqual([]);
    expect(t.check((A) => { A.players['0'].bench[2]!.attached![0].cooldowns = { transcendent_cooldown: 3 }; })).toContain('activate-spends');
  });
  it('cooldowns: the new player\'s tick down at its turn start, the ender\'s stay; nothing else moves one but what starts it, and Refresher', () => {
    const before = clean();
    before.players['1'].active!.cooldowns = { passive_abrams_heal: 2 };
    giveItem(before, before.players['1'].bench[0]!, 'cold_front', { cooldown: 2 });
    giveItem(before, p0(before).haze, 'decay', { cooldown: 3 });
    const end = (mutate: (A: GameState) => void) => {
      const after = structuredClone(before) as GameState;
      after.turnNumber = 3; after.players['1'].souls = LANE_INCOME;
      after.players['1'].active!.cooldowns = { passive_abrams_heal: 1 };
      after.players['1'].bench[0]!.attached![0].cooldowns = { cold_front: 1 };
      mutate(after);
      return collectTransitionViolations({ G: before, ctx: ctx() }, { G: after, ctx: ctx({ currentPlayer: '1', turn: 3 }) }, { name: 'endTurn', args: [] }, true).map((v) => v.id);
    };
    expect(end(() => undefined)).toEqual([]);
    expect(end((A) => { A.players['1'].bench[0]!.attached![0].cooldowns = { cold_front: 2 }; })).toContain('cooldown-bookkeeping'); // not ticked
    // a turn handed over has begun even when its start ends the match (a Bleed tick that fells
    // a hero and the patron with it): its ticks have run
    const over = (cd: number) => {
      const after = structuredClone(before) as GameState;
      after.turnNumber = 3;
      after.players['1'].active!.cooldowns = { passive_abrams_heal: 1 };
      after.players['1'].bench[0]!.attached![0].cooldowns = { cold_front: cd };
      return collectTransitionViolations({ G: before, ctx: ctx() }, { G: after, ctx: ctx({ currentPlayer: '1', turn: 3, gameover: { winner: '0' } } as Partial<Ctx>) }, { name: 'endTurn', args: [] }, true).map((v) => v.id);
    };
    expect(over(1)).not.toContain('cooldown-bookkeeping');
    expect(over(2)).toContain('cooldown-bookkeeping');
    expect(end((A) => { A.players['0'].active!.attached![0].cooldowns = { decay: 2 }; })).toContain('cooldown-bookkeeping'); // the ender's ticked
    // a skill moves only its own cooldown
    const p = pair((G) => { G.players['0'].bench[1]!.cooldowns = { skill_lash: 1 }; G.players['0'].active!.cooldowns = { x: 1 }; });
    expect(moveIds(p, 'useSkill', [p.before.G.players['0'].bench[1]!.iid])).toContain('cooldown-bookkeeping');
    // Refresher takes the Active and the items it wears off cooldown
    const R = clean();
    p0(R).haze.cooldowns = { eff_ult_haze: 2 };
    giveItem(R, p0(R).haze, 'decay', { cooldown: 2 });
    const refresher = giveItem(R, p0(R).paige, 'refresher');
    const use = made(R, 'activate', [refresher.iid]);
    expect(use.after.G.players['0'].active!.cooldowns).toBeUndefined();
    expect(use.check()).toEqual([]);
    expect(use.check((A) => { A.players['0'].bench[0]!.cooldowns = { skill_vindicta: 1 }; })).toContain('cooldown-bookkeeping');
  });
  it('the wait of a fallen hero, the income and the draw at a new turn', () => {
    const before = clean();
    const corpse = before.players['1'].bench[0]!;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    const base = (mutate: (g: GameState) => void, from: GameState = before) => {
      const after = structuredClone(from) as GameState;
      mutate(after);
      return { before: { G: from, ctx: ctx() }, after: { G: after, ctx: ctx({ currentPlayer: '1', turn: 3 }) } };
    };
    const startP1 = (G: GameState) => { G.turnNumber = 3; G.players['1'].souls = LANE_INCOME; };
    // P1's turn starts: the corpse must tick to 1 — not tick, wrong
    let p = base((G) => { startP1(G); });
    let ids3 = moveIds(p, 'endTurn', [], p.after.ctx);
    expect(ids3).toContain('respawn-timer');
    expect(ids3).not.toContain('souls-income');
    // the income: LANE_INCOME on top of what was kept — no comeback, however far behind
    before.players['0'].souls = 30;
    p = base((G) => { startP1(G); G.players['1'].bench[0]!.respawnTurnsLeft = 1; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toEqual([]);
    p = base((G) => { startP1(G); G.players['1'].souls += 1; G.players['1'].bench[0]!.respawnTurnsLeft = 1; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('souls-income');
    // the side whose turn ended keeps its souls
    p = base((G) => { startP1(G); G.players['0'].souls += 1; G.players['1'].bench[0]!.respawnTurnsLeft = 1; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('souls-income');
    before.players['0'].souls = 0;
    // a wait that ends: the hero leaves its slot for the hand, at full HP
    const last = structuredClone(before) as GameState;
    last.players['1'].bench[0]!.respawnTurnsLeft = 1;
    const toHand = (G: GameState) => {
      const ps = G.players['1'];
      const h = ps.bench[0]!;
      ps.bench[0] = null;
      Object.assign(h, { zone: 'hand', slot: undefined, respawnTurnsLeft: undefined, hp: h.hpMax, exhausted: false });
      ps.hand.push(h);
    };
    p = base((G) => { startP1(G); toHand(G); }, last);
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toEqual([]);
    p = base((G) => { startP1(G); const h = G.players['1'].bench[0]!; h.respawnTurnsLeft = undefined; h.hp = h.hpMax; }, last); // revived in place, the old way
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('respawn-timer');
    // the draw: the top card of the deck, one; none into a full hand
    const deck = structuredClone(before) as GameState;
    stackDeck(deck, '1', ['grit', 'cold_front']);
    const draw = (G: GameState, n: number) => { for (let i = 0; i < n; i++) { const c = G.players['1'].deck.pop()!; c.zone = 'hand'; G.players['1'].hand.push(c); } };
    p = base((G) => { startP1(G); G.players['1'].bench[0]!.respawnTurnsLeft = 1; draw(G, 1); }, deck);
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toEqual([]);
    p = base((G) => { startP1(G); G.players['1'].bench[0]!.respawnTurnsLeft = 1; }, deck);
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('draw-per-turn');
    p = base((G) => { startP1(G); G.players['1'].bench[0]!.respawnTurnsLeft = 1; draw(G, 2); }, deck);
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('draw-per-turn');
    const full = structuredClone(deck) as GameState;
    for (let i = 0; i < MAX_HAND; i++) giveCard(full, '1', 'grit');
    p = base((G) => { startP1(G); G.players['1'].bench[0]!.respawnTurnsLeft = 1; }, full);
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toEqual([]);
    p = base((G) => { startP1(G); G.players['1'].bench[0]!.respawnTurnsLeft = 1; draw(G, 1); }, full);
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('draw-per-turn');
    // the turn counter must step by one
    p = base((G) => { G.turnNumber = 7; G.players['1'].souls = LANE_INCOME; G.players['1'].bench[0]!.respawnTurnsLeft = 1; });
    expect(moveIds(p, 'endTurn', [], p.after.ctx)).toContain('turn-number-step');
  });
  it('a card play, a hero placed, a first Active, a discard or an item use the rules refuse, accepted', () => {
    // a card played onto a rival's hero; one not in the hand; one after the attack; one a soul short
    const P = clean();
    P.players['0'].souls = 10;
    const card = giveCard(P, '0', 'extra_spirit');
    expect(moveIds(pair(() => undefined, P), 'playCard', [card.iid, P.players['0'].active!.iid])).not.toContain('accepted-illegal');
    expect(moveIds(pair(() => undefined, P), 'playCard', [card.iid, P.players['1'].active!.iid])).toContain('accepted-illegal');
    expect(moveIds(pair(() => undefined, P), 'playCard', ['ghost', P.players['0'].active!.iid])).toContain('accepted-illegal');
    expect(moveIds(pair(() => undefined, P), 'playCard', [card.iid, P.players['0'].active!.iid, 'titanic_magazine'])).toContain('accepted-illegal');
    P.attackUsed = true;
    expect(moveIds(pair(() => undefined, P), 'playCard', [card.iid, P.players['0'].active!.iid])).toContain('accepted-illegal');
    const S = clean();
    S.players['0'].souls = 1;
    const dear = giveCard(S, '0', 'extra_spirit');
    expect(moveIds(pair(() => undefined, S), 'playCard', [dear.iid, S.players['0'].active!.iid])).toContain('accepted-illegal');
    // a hero into an occupied lane
    const H = clean();
    const yam = giveCard(H, '0', 'hero_yamato');
    expect(moveIds(pair(() => undefined, H), 'placeHero', [yam.iid, true])).toContain('accepted-illegal');
    // a first Active nobody owes; a discard nobody owes
    expect(moveIds(pair(() => undefined, H), 'chooseActive', [yam.iid])).toContain('accepted-illegal');
    expect(moveIds(pair(() => undefined, H), 'discard', [[yam.iid]])).toContain('accepted-illegal');
    // an item used while it cools down
    const C = clean();
    const cold = giveItem(C, p0(C).haze, 'cold_front', { cooldown: 1 });
    expect(moveIds(pair(() => undefined, C), 'activate', [cold.iid, C.players['1'].active!.iid])).toContain('accepted-illegal');
  });
  it('a wiped board is no loss: nothing is reported while the game runs on', () => {
    const G = clean();
    for (const c of [G.players['1'].active!, ...G.players['1'].bench]) { c!.hp = 0; c!.respawnTurnsLeft = 3; }
    expect(ids(G)).toEqual([]);
  });
  it('the empty-lane push: at the end of a turn the rival\'s structures may lose the Active\'s bullet power', () => {
    const before = clean();
    for (const c of [before.players['1'].active!, ...before.players['1'].bench]) { c!.hp = 0; c!.respawnTurnsLeft = 3; }
    const after = structuredClone(before) as GameState;
    const bullet = query.effectiveAtk(p0(before).haze); // Haze's Bullet Power: her card's 1 Attack at Level 1
    expect(bullet).toBe(1);
    pushOff(after, '1', bullet);
    const end = (a: GameState, name: string) => collectTransitionViolations({ G: before, ctx: ctx() }, { G: a, ctx: ctx({ currentPlayer: '1', turn: 3 }) }, { name, args: [] }, true).map((v) => v.id);
    expect(end(after, 'endTurn')).not.toContain('structure-delta');
    expect(end(after, 'useSkill')).toContain('structure-delta');
    pushOff(after, '1', 1);
    expect(end(after, 'endTurn')).toContain('structure-delta');
  });
  it('a rejected move that replaced G', () => {
    expect(ids2(pair(() => undefined), 'useSkill', false)).toContain('rejected-move-changed-state');
    expect(checkTransition({ G: clean(), ctx: ctx() }, { G: clean(), ctx: ctx() }, { name: 'completeAction', args: [] }, true)).toEqual([]);
  });
});

describe('the driver', () => {
  const policies = { '0': 'heuristic', '1': 'randomLegal' } as const;

  it('replays a seed exactly and plays a whole game', () => {
    const a = playGame({ seed: 5, policies });
    const b = playGame({ seed: 5, policies });
    expect(b.moves.map((m) => m.name + JSON.stringify(m.args))).toEqual(a.moves.map((m) => m.name + JSON.stringify(m.args)));
    expect(a.steps).toBeGreaterThan(30);
    expect(a.accepted).toBeGreaterThan(20);
    expect(a.final.G.draft).toBeNull();
    expect(a.policyThrew).toEqual([]);
  });

  it('a seed is a deal: the match seed is drawn from it, so the same seed deals the same decks and another seed others', () => {
    /** The decks and hands as the opening deals them (the first state after the draft). */
    const dealt = (seed: number) => {
      let deal = '';
      playGame({ seed, policies, beforeMove: (snap) => {
        if (!deal && !snap.G.draft) deal = JSON.stringify((['0', '1'] as const).map((p) => [...snap.G.players[p].deck, ...snap.G.players[p].hand].map((c) => c.cardId)));
      } });
      return deal;
    };
    const a = playGame({ seed: 21, policies });
    expect(a.final.G.seed).toBe(marketSeedFor(21));
    expect(dealt(21)).toBe(dealt(21));
    expect(dealt(21)).not.toBe(dealt(22));
  });

  it('reports accepted correctly: a move the engine refuses is not accepted, and a chaos game sees both', () => {
    let refused = 0;
    let taken = 0;
    playGame({
      seed: 13, policies: { '0': 'chaos', '1': 'randomLegal' },
      afterMove: (_b, _a, m, accepted) => { if (m.chaos) (accepted ? taken++ : refused++); },
    });
    expect(refused).toBeGreaterThan(0);
    expect(taken).toBeGreaterThan(0);
  });

  it('the hooks see the state the move is made from and the one it leaves', () => {
    let seen = 0;
    playGame({
      seed: 9, policies,
      beforeMove: (snap, info) => { expect(snap.ctx.currentPlayer).toBe(info.player); seen++; },
      afterMove: (b, a, _m, accepted) => { if (accepted) expect(a.G).not.toBe(b.G); },
    });
    expect(seen).toBeGreaterThan(20);
  });

  it('the opening is answered, both seats place heroes and play items, and a random seat holds cards into later turns', () => {
    const made: Record<string, Set<string>> = { heuristic: new Set(), randomLegal: new Set() };
    const held = { heuristic: 0, randomLegal: 0 };
    let firsts = 0;
    for (const seed of [31, 32, 33]) {
      playGame({
        seed, policies,
        afterMove: (_b, a, m, accepted) => {
          if (!accepted || m.chaos) return;
          if (m.name === 'chooseActive') firsts++;
          if (!(m.policy in made)) return;
          made[m.policy].add(m.name);
          // A turn handed over with items still in the ending seat's hand.
          if (m.name === 'endTurn' && a.G.players[m.player].hand.some((c) => !!itemData(c.cardId))) held[m.policy as keyof typeof held]++;
        },
      });
    }
    expect(firsts).toBe(3); // the human seat's first Active, once a game
    for (const p of ['heuristic', 'randomLegal']) for (const n of ['placeHero', 'playCard']) expect(made[p].has(n), `${p} ${n}`).toBe(true);
    expect(held.randomLegal).toBeGreaterThan(0);
  });

  it('chaos moves name every move the engine has and nothing else, with ids from the state', () => {
    const G = clean();
    giveItem(G, G.players['0'].active!, 'cold_front');
    const held = giveCard(G, '0', 'extra_spirit');
    const rnd = mulberry32(3);
    const names = new Set<string>();
    const iids = new Set<unknown>();
    for (let i = 0; i < 600; i++) {
      const m = chaosMove(G, '0', rnd);
      names.add(m.name);
      if (m.name === 'activate' || m.name === 'playCard') iids.add(m.args[0]);
    }
    expect([...names].sort()).toEqual(Object.keys(DeadlockGame.moves!).sort());
    expect(iids.has(G.players['0'].active!.attached![0].iid)).toBe(true); // a worn item's own iid
    expect(iids.has(held.iid)).toBe(true); // a hand card's own iid
  });

  it('callMove runs on a clone', () => {
    const G = clean();
    G.players['0'].souls = 5;
    const card = giveCard(G, '0', 'extra_spirit');
    const before = JSON.stringify(G);
    const r = callMove(G, ctx(), '0', 'playCard', [card.iid, G.players['0'].active!.iid]);
    expect(r.outcome).toBe('accepted');
    expect(JSON.stringify(G)).toBe(before);
    expect(callMove(G, ctx(), '0', 'noSuchMove', []).outcome).toBe('rejected');
  });

  it('diffPaths treats undefined as missing and finds a real difference', () => {
    expect(diffPaths({ a: 1, b: undefined }, { a: 1 })).toEqual([]);
    expect(diffPaths({ a: [1, 2] }, { a: [1, 3] })).toEqual(['a[1]: 2 != 3']);
  });

  it('splitKnown honours wildcards and `when`', () => {
    const hit = (signature: string, tags: string[] = []): Hit => ({ signature, mix: 'm', seed: 1, step: 1, move: 'x', args: [], chaos: false, tags, message: '' });
    const known = [{ id: 'a:*@m', why: 'w', when: (h: Hit) => h.tags.includes('t') }, { id: 'exact@m', why: 'w' }];
    const r = splitKnown([hit('a:zzz@m', ['t']), hit('a:zzz@m'), hit('exact@m'), hit('other@m')], known);
    expect(r.expected.length).toBe(2);
    expect(r.unexpected.map((h) => h.signature)).toEqual(['a:zzz@m', 'other@m']);
  });
});

describe('the rules oracles', () => {
  it('the target oracle matches the TargetFilter doc; an item is aimed by its first ability, a passive is never used', () => {
    const G = clean();
    const me = G.players['0'];
    const foe = G.players['1'];
    const dead = foe.bench[0]!;
    dead.hp = 0; dead.respawnTurnsLeft = 3;
    expect(filterForItem(giveItem(G, me.active!, 'cold_front'))).toBe('enemyActive');
    expect(filterForItem(giveItem(G, me.active!, 'grit'))).toBe('noTarget');
    expect(filterForItem(giveItem(G, me.active!, 'extra_spirit'))).toBe('passive');
    expect(filterForItem(me.bench[0]!)).toBeNull();
    expect(filterForSkill(me.bench[2]!)).toBe('allyHero'); // Paige
    expect(targetLegal('enemyActive', foe.active!, undefined, '0')).toBe(true);
    expect(targetLegal('enemyActive', foe.bench[1]!, undefined, '0')).toBe(false);
    expect(targetLegal('enemyAny', dead, undefined, '0')).toBe(false);
    expect(targetLegal('allyHero', foe.active!, undefined, '0')).toBe(false);
    expect(targetLegal('self', me.active!, me.active!, '0')).toBe(true);
    expect(targetLegal('self', me.bench[0]!, me.active!, '0')).toBe(false);
    expect(targetLegal('noTarget', undefined, undefined, '0')).toBe(true);
    resolve(G);
  });

  it('prices: PRICE by tier; an upgrade onto the hero wearing its component costs the difference, onto another the full price; the upgrades a play makes', () => {
    const G = clean();
    expect(['extended_magazine', 'titanic_magazine', 'decay', 'curse', 'hero_haze'].map(itemPriceOracle)).toEqual([2, 4, 8, 16, 0]);
    const { haze, vindicta } = p0(G);
    expect(playCostOracle(haze, 'titanic_magazine')).toBe(4);
    const mag = giveItem(G, haze, 'extended_magazine');
    expect(upgradeComponentOracle(haze, 'titanic_magazine')).toBe(mag);
    expect(playCostOracle(haze, 'titanic_magazine')).toBe(2);
    expect(playCostOracle(vindicta, 'titanic_magazine')).toBe(4); // Haze's magazine is not Vindicta's
    expect(playCostOracle(haze, 'boundless_spirit')).toBe(16); // its component is Improved Spirit, not worn
    // A corpse wearing the component: the upgrade evolves it for the difference too.
    const corpse = p0(G).lash;
    corpse.hp = 0; corpse.respawnTurnsLeft = 2;
    giveItem(G, corpse, 'extended_magazine');
    expect(playCostOracle(corpse, 'titanic_magazine')).toBe(2);
    // What a play makes: the first upgrade, or the one named of several; nothing for an item that builds into none.
    expect(upgradesOfOracle('extra_health')).toEqual(['colossus', 'fortitude']);
    expect(upgradeMadeOracle('extra_health', undefined)).toBe('colossus');
    expect(upgradeMadeOracle('extra_health', 'fortitude')).toBe('fortitude');
    expect(upgradeMadeOracle('extra_health', 'nope')).toBe('colossus');
    expect(upgradeMadeOracle('titanic_magazine', undefined)).toBeUndefined();
    expect(upgradesOfOracle('improved_cooldown')).toEqual(['superior_cooldown']);
    expect(upgradesOfOracle('superior_cooldown')).toEqual(['transcendent_cooldown']);
  });
  it('slots and worth: three items (four with the flex slot); every worn item and every item in the hand counts, a hero card nothing; a merged Rem is a hero, not an item', () => {
    const G = clean();
    expect(slotCapOracle(G, '0')).toBe(3);
    G.players['0'].flexSlot = true;
    expect(slotCapOracle(G, '0')).toBe(4);
    const vind = p0(G).vindicta;
    giveItem(G, vind, 'grit');
    giveItem(G, vind, 'extra_health');
    const rem = mergeRem(G, G.players['0'].bench[0]!);
    expect(wornWorth(G.players['0'].bench[0]!)).toBe(4); // two tier 1 items, Rem not among them
    giveItem(G, rem, 'cold_front');
    expect(heroesOfSide(G.players['0']).map((h) => h.cardId)).toContain('hero_rem');
    expect(netWorthOracle(G, '0')).toBe(4 + 4);
    // The hand counts at list price — in net worth, not in a hero's worth; a hero card at 0.
    giveCard(G, '0', 'glass_cannon');
    giveCard(G, '0', 'hero_yamato');
    expect(netWorthOracle(G, '0')).toBe(4 + 4 + 16);
    expect(netWorthOracleWithoutHand(G, '0')).toBe(4 + 4);
  });
  it('the hand oracles: a hero onto the bench (its first free slot, not a merged Rem\'s) or into an empty lane; the first Active; a discard', () => {
    const G = clean();
    const yam = giveCard(G, '0', 'hero_yamato');
    expect(placeHeroBlockedOracle(G, '0', yam.iid, false)).toBe('bench-full');
    expect(placeHeroBlockedOracle(G, '0', yam.iid, true)).toBe('occupied');
    G.players['0'].bench[1] = null;
    expect(freeBenchSlotOracle(G, '0')).toBe(2);
    expect(placeHeroBlockedOracle(G, '0', yam.iid, false)).toBeNull();
    expect(placeHeroBlockedOracle(G, '1', yam.iid, false)).toBe('not-your-turn');
    expect(placeHeroBlockedOracle(G, '0', giveCard(G, '0', 'grit').iid, false)).toBe('not-hero');
    expect(placeHeroBlockedOracle(G, '0', 'ghost', false)).toBe('not-in-hand');
    G.players['0'].active = null;
    expect(placeHeroBlockedOracle(G, '0', yam.iid, true)).toBeNull(); // an empty lane: straight in
    expect(placeHeroBlockedOracle(G, '0', giveCard(G, '0', 'hero_rem').iid, true)).toBe('bench-only');
    // A merged Rem keeps her slot: a hero from the hand takes the next.
    const R = clean();
    mergeRem(R, p0(R).haze);
    expect(R.players['0'].bench[2]).toBeNull();
    expect(freeBenchSlotOracle(R, '0')).toBeUndefined();
    // The first Active: owed, from the owing deck (the drafted heroes), a hero that may stand
    // there; either seat makes it. A card of the hand is no candidate.
    const O = opening();
    const haze = O.players['0'].deck.find((c) => c.cardId === 'hero_haze')!;
    const intoDeck = (c: CardInstance) => { O.players['0'].hand = O.players['0'].hand.filter((x) => x !== c); c.zone = 'deck'; O.players['0'].deck.push(c); return c; };
    expect(chooseActiveBlockedOracle(O, haze.iid)).toBeNull();
    expect(chooseActiveBlockedOracle(clean(), haze.iid)).toBe('not-owed');
    expect(chooseActiveBlockedOracle(O, 'ghost')).toBe('not-in-deck');
    expect(chooseActiveBlockedOracle(O, giveCard(O, '0', 'hero_abrams').iid)).toBe('not-in-deck');
    expect(chooseActiveBlockedOracle(O, intoDeck(giveCard(O, '0', 'grit')).iid)).toBe('not-hero');
    expect(chooseActiveBlockedOracle(O, intoDeck(giveCard(O, '0', 'hero_rem')).iid)).toBe('bench-only');
    expect(placeHeroBlockedOracle(O, '0', haze.iid, true)).toBe('active-owed');
    // A discard: owed, one card up to what is owed, none twice, each in the hand.
    const D = clean();
    const [a, b, c] = ['grit', 'cold_front', 'extra_spirit'].map((id) => giveCard(D, '0', id));
    expect(discardBlockedOracle(D, '0', [a.iid])).toBe('not-owed');
    D.pendingDiscard = { pid: '0', count: 2, cardId: 'superior_cooldown' };
    expect(discardBlockedOracle(D, '0', [a.iid])).toBeNull();
    expect(discardBlockedOracle(D, '0', [a.iid, b.iid])).toBeNull();
    expect(discardBlockedOracle(D, '0', [a.iid, b.iid, c.iid])).toBe('too-many');
    expect(discardBlockedOracle(D, '0', [a.iid, a.iid])).toBe('repeat');
    expect(discardBlockedOracle(D, '0', [])).toBe('none');
    expect(discardBlockedOracle(D, '0', ['ghost'])).toBe('not-in-hand');
    expect(discardBlockedOracle(D, '1', [a.iid])).toBe('not-owed');
    expect(playBlockedOracle(D, '0', c.iid, p0(D).haze.iid)).toBe('discard-owed');
  });
  it('the play oracle: not after the attack, nor around a choice owed; an item in the hand onto a hero of the side in a slot — a corpse too — never a duplicate, never past the cap unless it evolves one worn, souls enough, an upgrade named only among its own', () => {
    const G = clean();
    G.players['0'].souls = 10;
    const { haze, vindicta, paige } = p0(G);
    const card = giveCard(G, '0', 'extra_spirit');
    expect(playBlockedOracle(G, '0', card.iid, haze.iid)).toBeNull();
    paige.hp = 0; paige.respawnTurnsLeft = 2;
    expect(playBlockedOracle(G, '0', card.iid, paige.iid)).toBeNull();
    expect(playBlockedOracle(G, '1', card.iid, haze.iid)).toBe('not-your-turn');
    expect(playBlockedOracle(G, '0', 'ghost', haze.iid)).toBe('not-in-hand');
    expect(playBlockedOracle(G, '0', giveItem(G, vindicta, 'grit').iid, haze.iid)).toBe('not-in-hand');
    expect(playBlockedOracle(G, '0', giveCard(G, '1', 'grit').iid, haze.iid)).toBe('not-in-hand');
    expect(playBlockedOracle(G, '0', giveCard(G, '0', 'hero_yamato').iid, haze.iid)).toBe('hero-card');
    expect(playBlockedOracle(G, '0', card.iid, G.players['1'].active!.iid)).toBe('no-hero');
    expect(playBlockedOracle(G, '0', card.iid, undefined)).toBe('no-hero');
    giveItem(G, vindicta, 'extra_spirit');
    expect(playBlockedOracle(G, '0', card.iid, vindicta.iid)).toBe('duplicate');
    for (const id of ['extended_magazine', 'extra_health', 'extra_regen']) giveItem(G, haze, id);
    expect(playBlockedOracle(G, '0', card.iid, haze.iid)).toBe('full');
    const titanic = giveCard(G, '0', 'titanic_magazine');
    expect(playBlockedOracle(G, '0', titanic.iid, haze.iid)).toBeNull(); // takes the magazine's place
    expect(playBlockedOracle(G, '0', titanic.iid, haze.iid, undefined, 1)).toBe('souls'); // 2, the difference
    expect(playBlockedOracle(G, '0', titanic.iid, haze.iid, 'escalating_resilience')).toBe('not-an-upgrade');
    const mag = giveCard(G, '0', 'extended_magazine');
    expect(playBlockedOracle(G, '0', mag.iid, p0(G).lash.iid, 'escalating_resilience')).toBeNull();
    G.attackUsed = true;
    expect(playBlockedOracle(G, '0', card.iid, p0(G).lash.iid)).toBe('act-over');
    G.attackUsed = false;
    G.pendingPromotion = '0';
    expect(playBlockedOracle(G, '0', card.iid, p0(G).lash.iid)).toBe('promotion-owed');
    // A merged Rem is no hero in a slot.
    const R = clean();
    R.players['0'].souls = 10;
    const rem = mergeRem(R, p0(R).haze);
    const held = giveCard(R, '0', 'extra_spirit');
    expect(playBlockedOracle(R, '0', held.iid, rem.iid)).toBe('no-hero');
  });
  // What a play consumed and what a same-turn sale put back were the shop's: a card bought for the
  // difference settled a component from the hand or another hero, and a sale undid it. The deck
  // game's only take-away is the evolution onto the hero itself (the play oracle and the
  // upgrade-and-evolve transition test above); a sale has no deck equivalent.
  it.skip('what a same-turn sale puts back: onto the hero it came from while it has room and wears no copy, else into the hand — and what that one settled, after it', () => {});
  it('the item-use oracle: an active worn by a standing bearer who has not used its ability, unlocked, ready, on a legal target — never around a choice owed', () => {
    const G = clean();
    const foeActive = G.players['1'].active!.iid;
    const lash = p0(G).lash;
    const cold = giveItem(G, lash, 'cold_front');
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBeNull(); // a bench bearer, "the enemy Active"
    expect(activateTargetsOracle(G, '0', cold, lash)).toEqual([G.players['1'].active]);
    expect(activateBlockedOracle(G, '0', cold.iid)).toBe('missing-target');
    expect(activateBlockedOracle(G, '0', cold.iid, G.players['1'].bench[0]!.iid)).toBe('bad-target');
    expect(activateBlockedOracle(G, '1', cold.iid, foeActive)).toBe('not-worn');
    expect(activateBlockedOracle(G, '0', giveItem(G, lash, 'extra_spirit').iid)).toBe('passive');
    expect(activateBlockedOracle(G, '0', giveItem(G, p0(G).paige, 'grit', { cooldown: 1 }).iid)).toBe('cooling');
    const knock = giveItem(G, p0(G).vindicta, 'knockdown');
    knock.charges = 0;
    expect(activateBlockedOracle(G, '0', knock.iid, foeActive)).toBe('no-charges');
    knock.charges = 1;
    p0(G).vindicta.statuses.push({ id: 'silenced', value: 1, duration: 1 });
    expect(activateBlockedOracle(G, '0', knock.iid, foeActive)).toBe('bearer-locked');
    lash.skillUsedThisTurn = true;
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBe('bearer-used');
    lash.skillUsedThisTurn = false;
    G.pendingDiscard = { pid: '0', count: 1, cardId: 'improved_cooldown' };
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBe('discard-owed');
    G.pendingDiscard = undefined;
    lash.hp = 0; lash.respawnTurnsLeft = 2;
    expect(activateBlockedOracle(G, '0', cold.iid, foeActive)).toBe('bearer-down');
    // the cooldowns: the tier's, or the card's own (the draw cards: 2 at every tier)
    const haze = p0(G).haze;
    expect(activeCooldownOracle(haze, 3)).toBe(3);
    expect(activeCooldownOracle(haze, itemData('alchemical_fire')!)).toBe(3);
    expect(activeCooldownOracle(haze, itemData('transcendent_cooldown')!)).toBe(2);
  });

  it('the oracles\' tables are the cards\': the draw cards\' numbers are their texts\', and the souls an item pays are its text\'s', () => {
    const drawing = Object.fromEntries(ITEMS.flatMap((i) => {
      const m = /Draw (\d+) cards?, then discard (\d+)/.exec(i.text ?? '');
      return m ? [[i.id, { draw: Number(m[1]), discard: Number(m[2]) }]] : [];
    }));
    expect(DRAW_CARDS).toEqual(drawing);
    for (const id of Object.keys(DRAW_CARDS)) expect(itemData(id)?.type, id).toBe('spell');
    const paying = Object.fromEntries(ITEMS.flatMap((i) => {
      const m = /Gain (\d+) souls/.exec(i.text ?? '');
      return m ? [[i.id, Number(m[1])]] : [];
    }));
    expect(SOULS_ON_USE).toEqual(paying);
  });

  it('an oracle answers for a hand-built iid too (the hand and the board, not a test\'s own counter)', () => {
    const G = clean();
    G.players['0'].souls = 10;
    const stray = makeHero('hero_shiv', '0', 'bench', 1);
    expect(stray.iid).toMatch(/^t/);
    const card = giveCard(G, '0', 'extra_spirit');
    expect(playBlockedOracle(G, '0', card.iid, stray.iid)).toBe('no-hero');
    expect(playBlockedOracle(G, '0', card.iid, nextTestIid())).toBe('no-hero');
    expect(placeHeroBlockedOracle(G, '0', nextTestIid(), false)).toBe('not-in-hand');
  });
});
