import { describe, it, expect, beforeAll } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { damageUnit } from '@/engine/damage';
import { reapDead, resolve } from '@/engine/death';
import { playBlocked } from '@/engine/legality';
import { findCardOnBoard, findWornItem, heroData, heroesOf, itemPrice, kitAbilityIds, kitCost, slotCap, structureHp, wornItems } from '@/engine/query';
import { MAX_ITEMS } from '@/engine/constants';
import { CARDS_BY_ID } from '@/cards';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, configureReadyMatch, giveCard, giveItem, makeAttack, readyClient, passTurn, playNew } from './_helpers';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';

// Client-based tests boot straight into a playable match (skip the draft).
beforeAll(configureReadyMatch);

function freshG(): GameState {
  return freshReadyGame();
}

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

/** Every card on `pid`'s side of the board: its heroes and, worn by them, what they carry. */
function boardCards(G: GameState, pid: PlayerID): CardInstance[] {
  const out: CardInstance[] = [];
  const walk = (c: CardInstance) => { out.push(c); for (const a of c.attached ?? []) walk(a); };
  for (const c of [G.players[pid].active, ...G.players[pid].bench]) if (c) walk(c);
  return out;
}

describe('rule: each hero uses its skill once per turn', () => {
  it('rejects a second use by the same hero, but not a different hero', () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 10; // enough for Lash twice and Paige: the refusal is the once-a-turn rule
    const enemy = G.players['1'];
    // P0's roster (TEST_ROSTERS): [haze (passive), vindicta (passive), lash (skill), paige (skill)].
    // Pick the two skill heroes — Lash + Paige — for this per-turn-cap test.
    const hero1 = me.bench[1]!;  // Lash
    const hero2 = me.bench[2]!;  // Paige
    expect(hero1.skillUsedThisTurn).toBe(false);
    const r1 = runMove('useSkill', G, '0', hero1.iid, enemy.active!.iid);
    expect(r1).not.toBe('INVALID_MOVE');
    expect(hero1.skillUsedThisTurn).toBe(true);
    expect(runMove('useSkill', G, '0', hero1.iid, enemy.active!.iid)).toBe('INVALID_MOVE');
    const r2 = runMove('useSkill', G, '0', hero2.iid, me.active!.iid);
    expect(r2).not.toBe('INVALID_MOVE');
    expect(hero2.skillUsedThisTurn).toBe(true);
  });

  it('the hero\'s flag clears when its turn ends; the skill then waits its turns, and is used again once they have run', () => {
    const c = readyClient(); // turn 1, its shop closed: the act step
    let g = c.getState()!.G as GameState;
    // Use a skill — Paige on the bench (active Haze is passive-only). Until 2026-11-17 this
    // was Lash's Ground Strike; his skill is now Grapple, which swings him off the bench.
    const hero = g.players['0'].bench[2]!;  // Paige
    expect(hero.skillUsedThisTurn).toBe(false);
    (c.moves as any).useSkill(hero.iid, g.players['0'].active!.iid);
    g = c.getState()!.G as GameState;
    expect(g.players['0'].bench[2]!.skillUsedThisTurn).toBe(true);
    // End turn: the flag is cleared on the way out, for the opponent's turn.
    c.moves.endTurn?.();
    g = c.getState()!.G as GameState;
    expect(g.players['0'].bench[2]!.skillUsedThisTurn).toBe(false);
    // P0's next two turns Plot Armor waits (3 turns): the flag is clear,
    // and the move is refused all the same.
    passTurn(c);
    for (const left of [2, 1]) {
      g = c.getState()!.G as GameState;
      expect(g.players['0'].bench[2]!.cooldowns?.skill_paige).toBe(left);
      (c.moves as any).useSkill(hero.iid, g.players['0'].active!.iid);
      g = c.getState()!.G as GameState;
      expect(g.players['0'].bench[2]!.skillUsedThisTurn).toBe(false);
      c.moves.endTurn?.();
      passTurn(c);
    }
    // The third: it is ready, and costs no souls.
    g = c.getState()!.G as GameState;
    const soulsBefore = g.players['0'].souls;
    expect(kitCost(g.players['0'].bench[2]!)).toBe(0);
    (c.moves as any).useSkill(hero.iid, g.players['0'].active!.iid);
    g = c.getState()!.G as GameState;
    expect(g.players['0'].bench[2]!.skillUsedThisTurn).toBe(true);
    expect(g.players['0'].souls).toBe(soulsBefore);
  });
});

describe('rule: a skill costs no souls; it waits', () => {
  it("useSkill spends no souls (Lash's Grapple), and puts the skill on its wait", () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 3;
    const hero = me.bench[1]!;  // Lash
    const r = runMove('useSkill', G, '0', hero.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(3);
    expect(me.active).toBe(hero); // Grapple (2026-11-17): he leaps in from the bench
    expect(hero.cooldowns?.skill_lash).toBe(2);
  });

  it('useSkill while the skill waits is refused: nothing happens and the hero has not used its skill', () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 2;
    const hero = me.bench[1]!;  // Lash
    hero.cooldowns = { skill_lash: 2 };
    const target = G.players['1'].active!;
    const hp = target.hp;
    const r = runMove('useSkill', G, '0', hero.iid, target.iid);
    expect(r).toBe('INVALID_MOVE');
    expect(hero.skillUsedThisTurn).toBe(false);
    expect(target.hp).toBe(hp);
    expect(me.souls).toBe(2);
  });
});

describe('rule: hero respawn after KO', () => {
  it("a KO'd hero leaves the board for its deck: its slot empty, full HP, its level kept", () => {
    const G = freshG();
    // P0, so no AI promotion fills the slot: the empty lane is what is under test.
    const hero = G.players['0'].active!;
    hero.level = 2;
    const iid = hero.iid;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['0']);
    expect(findCardOnBoard(G, iid)).toBeNull();
    expect(G.players['0'].active).toBeNull();
    const inDeck = G.players['0'].deck.find((c) => c.iid === iid)!;
    expect(inDeck).toBeDefined();
    expect([inDeck.zone, inDeck.hp, inDeck.level, inDeck.respawnTurnsLeft]).toEqual(['deck', inDeck.hpMax, 2, undefined]);
    expect(G.fx.some((e) => e.kind === 'deck' && e.what === 'toDeck' && e.iid === iid)).toBe(true);
  });

  it('what the fallen hero wore stays on it in the deck (Patrick, 2026-11-18: it keeps its exp and equipment)', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    const worn = giveItem(G, hero, 'extra_health');
    const max = hero.hpMax;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['0']);
    const deck = G.players['0'].deck;
    expect(deck.find((c) => c.iid === hero.iid)?.attached).toEqual([worn]);
    expect(deck.some((c) => c.iid === worn.iid)).toBe(false);          // not a card of its own
    expect([worn.zone, worn.attachedTo]).toEqual(['equipment', hero.iid]);
    expect([hero.hpMax, hero.hp]).toEqual([max, max]);                    // its +2 HP stays, and it is at full HP
  });

  it("hero KO pushes the fallen hero's level + 1 into its structures (overflow discarded)", () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hp = 3;
    target.level = 3;
    const before = structureHp(G.players['1']);
    damageUnit(G, target, 8, 'pure'); // 3 to KO, 5 overflow discarded
    expect(target.hp).toBe(0);
    reapDead(G, G.players['1']);
    expect(structureHp(G.players['1'])).toBe(before - 4); // a Level 3 hero pushes 4
  });

  it("AI auto-promotes the strongest bench hero when its Active dies", () => {
    const G = freshG();
    const aiActive = G.players['1'].active!;
    const aiActiveIid = aiActive.iid;
    // Pick the strongest bench hero by HP for verification.
    const benchAlive = G.players['1'].bench.filter(Boolean) as any[];
    benchAlive.sort((a, b) => b.hp - a.hp);
    const expectedPromoted = benchAlive[0];
    expect(expectedPromoted).toBeDefined();

    damageUnit(G, aiActive, 9999, 'pure');
    // Auto-promotion is part of the `resolve` state-based pass (not `reapDead`,
    // which only reaps); resolve reaps both players then auto-promotes the AI.
    resolve(G);

    // The Active slot holds the promoted hero; the fallen one is in the deck, not on the bench.
    expect(G.players['1'].active?.iid).toBe(expectedPromoted.iid);
    expect(G.players['1'].bench.some((b) => b?.iid === aiActiveIid)).toBe(false);
    expect(G.players['1'].deck.some((c) => c.iid === aiActiveIid)).toBe(true);
  });

  it("AI's Active slot stays empty when no bench hero can be promoted", () => {
    const G = freshG();
    // Empty AI bench so no candidates remain.
    G.players['1'].bench = [null, null, null];
    const aiActive = G.players['1'].active!;
    damageUnit(G, aiActive, 9999, 'pure');
    resolve(G);
    expect(G.players['1'].active).toBeNull();
    expect(G.players['1'].deck.some((c) => c.iid === aiActive.iid)).toBe(true);
  });

  it("promoteToActive works during the OPPONENT's turn (cross-turn callable)", () => {
    const G = freshG();
    // Kill P0's active: its slot is empty and a bench hero must step up.
    const p0Active = G.players['0'].active!;
    damageUnit(G, p0Active, 9999, 'pure');
    reapDead(G, G.players['0']);
    expect(G.players['0'].active).toBeNull();
    const benchPick = G.players['0'].bench.find((b) => b)!;
    // Dispatch the promote move with playerID='1' (opponent's turn). It must
    // still act on P0's board — the owning player is derived from the iid.
    const r = runMove('promoteToActive', G, '1', benchPick.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].active?.iid).toBe(benchPick.iid);
  });
});

// ============================================================================
// The ultimate: a kit ability, unlocked at Level 3 (2 until 2026-11-16)
// ============================================================================
describe('rule: a hero unlocks its ultimate at Level 3', () => {
  // Drive the engine's turn.onBegin directly: it's the same handler the
  // client invokes.
  function runOnBegin(G: GameState, turn: number, pid: PlayerID) {
    const onBegin = (DeadlockGame.turn as any).onBegin;
    onBegin({ G, ctx: { turn, currentPlayer: pid, numPlayers: 2 } as any, events: {} as any, random: {} as any });
  }

  it('no ultimate is ever a card: it is a kit ability, and no card of one is in the hand or on the board, however late the turn or high the level', () => {
    const G = freshG();
    for (const h of [G.players['0'].active, ...G.players['0'].bench]) if (h) h.level = ULT_UNLOCK_LEVEL;
    for (let t = 2; t < 12; t += 2) {
      runOnBegin(G, t, '0');
      for (const h of heroesOf(G.players['0'])) expect(kitAbilityIds(h), h.cardId).toContain(heroData(h)!.ult);
      expect(boardCards(G, '0').filter((c) => CARDS_BY_ID[c.cardId]?.type === 'ultimate')).toEqual([]);
      expect(G.players['0'].hand).toEqual([]); // nothing is drawn: a card enters the hand only by a buy
    }
  });

  it('every hero at Level 3 may use its ultimate through useSkill, for no souls — one a turn for its side', () => {
    const G = freshG();
    for (const h of [G.players['0'].active, ...G.players['0'].bench]) if (h) h.level = ULT_UNLOCK_LEVEL;
    // Nobody on the other side falls (a kill would pay a bounty).
    for (const h of [G.players['1'].active, ...G.players['1'].bench]) if (h) h.hp = h.hpMax = 50;
    // P0's roster: Haze, Vindicta, Lash, Paige → their ultimates (Vindicta's and, since
    // 2026-11-17, Lash's Death Slam need a target; since 2026-11-18 the Slam's is the enemy Active).
    const [haze, vindicta, lash, paige] = [G.players['0'].active!, ...G.players['0'].bench] as NonNullable<typeof G.players['0']['active']>[];
    // No ultimate costs souls.
    expect([haze, vindicta, lash, paige].map((h) => kitCost(h, heroData(h)!.ult))).toEqual([0, 0, 0, 0]);
    G.players['0'].souls = 0;
    expect(runMove('useSkill', G, '0', haze.iid, undefined, 'eff_ult_haze')).not.toBe('INVALID_MOVE');
    // One ultimate a turn for a side: the next hero's waits for the next turn.
    expect(runMove('useSkill', G, '0', vindicta.iid, G.players['1'].active!.iid, 'eff_ult_vindicta')).toBe('INVALID_MOVE');
    G.ultUsed = undefined; // a new turn
    expect(runMove('useSkill', G, '0', vindicta.iid, G.players['1'].active!.iid, 'eff_ult_vindicta')).not.toBe('INVALID_MOVE');
    G.ultUsed = undefined;
    expect(runMove('useSkill', G, '0', lash.iid, G.players['1'].active!.iid, 'eff_ult_lash')).not.toBe('INVALID_MOVE');
    G.ultUsed = undefined;
    expect(runMove('useSkill', G, '0', paige.iid, undefined, 'eff_ult_paige')).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(0);
  });
});

// ============================================================================
// Item cap = MAX_ITEMS (3) per hero: a card played onto a full hero goes on only in
// place of a worn item the play names (`replaceIid`, to the discard pile; Patrick,
// 2026-11-09) — bare, it is refused; an upgrade of an item it wears goes on in its place
// ============================================================================
describe('rule: a full hero takes a card from the hand only in place of what it wears', () => {
  /** P0's Active, with souls to spare, wearing three items, and a fourth card in the hand. */
  function full() {
    const G = freshReadyGame();
    G.players['0'].souls = 99;
    const hero = G.players['0'].active!;
    for (const itemId of ['extra_spirit', 'extra_health', 'restorative_shot']) playNew(G, '0', itemId, hero);
    const card = giveCard(G, '0', 'extended_magazine');
    return { G, hero, card };
  }

  it('a 4th card played bare onto a hero at the cap is INVALID_MOVE ("full"), and stays in the hand', () => {
    const { G, hero, card } = full();
    expect(slotCap(G, '0')).toBe(MAX_ITEMS);
    expect(wornItems(hero).length).toBe(3);
    expect(playBlocked(G, '0', card.iid, hero.iid)).toBe('full');
    expect(runMove('playCard', G, '0', card.iid, hero.iid)).toBe('INVALID_MOVE');
    expect(wornItems(hero).length).toBe(3);
    expect(G.players['0'].hand).toEqual([card]);
    // Another hero with room takes it.
    expect(runMove('playCard', G, '0', card.iid, G.players['0'].bench[0]!.iid)).not.toBe('INVALID_MOVE');
  });

  it('naming a worn item it replaces, the 4th card goes on and that item goes to the discard pile', () => {
    const { G, hero, card } = full();
    const out = wornItems(hero)[0];
    expect(runMove('playCard', G, '0', card.iid, hero.iid, out.iid)).not.toBe('INVALID_MOVE');
    expect(wornItems(hero).map((it) => it.cardId)).toEqual(['extra_health', 'restorative_shot', 'extended_magazine']);
    expect(G.players['0'].discard).toEqual([out]);
  });

  it('an upgrade of a worn item evolves it on a full hero: it takes the slot, for the difference, and its part goes to the discard pile', () => {
    const { G, hero } = full();
    const part = wornItems(hero).find((it) => it.cardId === 'extra_health')!;
    const up = giveCard(G, '0', 'fortitude');
    const souls = G.players['0'].souls;
    expect(playBlocked(G, '0', up.iid, hero.iid)).toBeNull();
    expect(runMove('playCard', G, '0', up.iid, hero.iid, 'colossus')).toBe('INVALID_MOVE'); // Fortitude makes nothing of that name
    expect(runMove('playCard', G, '0', up.iid, hero.iid)).not.toBe('INVALID_MOVE');
    expect(wornItems(hero).map((it) => it.cardId)).toEqual(['extra_spirit', 'restorative_shot', 'fortitude']);
    expect(findWornItem(G, part.iid)).toBeNull();
    expect(G.players['0'].discard).toContain(part);
    expect(G.players['0'].souls).toBe(souls - (itemPrice('fortitude') - itemPrice('extra_health')));
  });
});

// ============================================================================
// The attack is one-way
// ============================================================================
describe('rule: the attack is one-way', () => {
  it('the Active-vs-Active attack damages only the defender', async () => {
    const { forecastAttack } = await import('@/engine/forecast');
        const G = freshG();
    const attacker = G.players['0'].active!;
    const defender = G.players['1'].active!;
    attacker.hpMax = 30; attacker.hp = 30;
    defender.hpMax = 30; defender.hp = 30;
    const attackerHp0 = attacker.hp;
    const defenderHp0 = defender.hp;
    const plan = forecastAttack(G, '0');
    // Plan should include at least the active swing.
    expect(plan.steps.length).toBeGreaterThan(0);
    makeAttack(G, '0');
    // The defender took the swing; the attacker took nothing back.
    expect(defender.hp).toBe(defenderHp0 - plan.damageToActive);
    expect(attacker.hp).toBe(attackerHp0);
  });
});
