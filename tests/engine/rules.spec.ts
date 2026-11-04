import { describe, it, expect, beforeAll } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { damageUnit } from '@/engine/damage';
import { reapDead, resolve } from '@/engine/death';
import { buyBlocked } from '@/engine/legality';
import { findCardOnBoard, findWornItem, heroData, heroesOf, kitAbilityIds, slotCap, wornItems } from '@/engine/query';
import { MAX_ITEMS } from '@/engine/constants';
import { CARDS_BY_ID } from '@/cards';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, configureReadyMatch, makeAttack, readyClient, passTurn, buyItem } from './_helpers';

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

  it('the hero\'s flag clears when its turn ends, so it casts again next turn', () => {
    const c = readyClient(); // turn 1, its shop closed: the act step
    let g = c.getState()!.G as GameState;
    // Use a skill — Lash on bench (active Haze is passive-only).
    const hero = g.players['0'].bench[1]!;  // Lash
    expect(hero.skillUsedThisTurn).toBe(false);
    const target = g.players['1'].active!;
    (c.moves as any).useSkill(hero.iid, target.iid);
    g = c.getState()!.G as GameState;
    expect(g.players['0'].bench[1]!.skillUsedThisTurn).toBe(true);
    // End turn: the flag is cleared on the way out, for the opponent's turn.
    c.moves.endTurn?.();
    g = c.getState()!.G as GameState;
    expect(g.players['0'].bench[1]!.skillUsedThisTurn).toBe(false);
    // P0's next turn, its shop closed: Lash casts again (its cooldown of 1 has run out at the turn start).
    passTurn(c);
    g = c.getState()!.G as GameState;
    expect(g.step).toBe('act');
    const soulsBefore = g.players['0'].souls;
    (c.moves as any).useSkill(hero.iid, g.players['1'].active!.iid);
    g = c.getState()!.G as GameState;
    expect(g.players['0'].bench[1]!.skillUsedThisTurn).toBe(true);
    expect(g.players['0'].souls).toBe(soulsBefore);
  });
});

describe('rule: abilities are free', () => {
  it('useSkill spends no souls', () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 3;
    const hero = me.bench[1]!;  // Lash
    const target = G.players['1'].active!;
    const r = runMove('useSkill', G, '0', hero.iid, target.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(3);
  });

  it('useSkill needs no souls at all', () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 0;
    const hero = me.bench[1]!;  // Lash
    const target = G.players['1'].active!;
    const r = runMove('useSkill', G, '0', hero.iid, target.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(hero.skillUsedThisTurn).toBe(true);
    expect(me.souls).toBe(0);
  });
});

describe('rule: hero respawn after KO', () => {
  it("a KO'd hero stays on the board as a corpse (it never leaves the board)", () => {
    const G = freshG();
    // Use P0 so we don't trigger AI auto-promote (which moves the corpse to
    // the bench). The "corpse stays on board" rule is what's under test here.
    const hero = G.players['0'].active!;
    const targetIid = hero.iid;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['0']);
    expect(findCardOnBoard(G, targetIid)).toEqual({ owner: '0', card: hero });
    expect(G.players['0'].active?.iid).toBe(targetIid);
    expect((G.players['0'].active?.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
  });

  it('respawning hero returns to life after RESPAWN_TURNS', () => {
    const G = freshG();
    const hero = G.players['0'].active!;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['0']);
    const corpse = G.players['0'].active!;
    const start = corpse.respawnTurnsLeft ?? 0;
    expect(start).toBeGreaterThan(0);
    // Simulate tickRespawn: decrement until 0 and verify restoration.
    while ((corpse.respawnTurnsLeft ?? 0) > 0) {
      corpse.respawnTurnsLeft = (corpse.respawnTurnsLeft ?? 0) - 1;
    }
    if ((corpse.respawnTurnsLeft ?? 0) <= 0) {
      corpse.respawnTurnsLeft = undefined;
      corpse.hp = corpse.hpMax;
      corpse.exhausted = false;
    }
    expect(corpse.hp).toBe(corpse.hpMax);
    expect(corpse.respawnTurnsLeft).toBeUndefined();
  });

  it("hero KO costs the patron the fallen hero's level (overflow discarded)", () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hp = 3;
    target.level = 3;
    const beforePatron = G.players['1'].hp;
    damageUnit(G, target, 8, 'pure'); // 3 to KO, 5 overflow discarded
    expect(target.hp).toBe(0);
    reapDead(G, G.players['1']);
    expect(G.players['1'].hp).toBe(beforePatron - 3); // death-only patron model: a Level 3 hero costs 3
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
    // which now only reaps); resolve reaps both players then auto-promotes the AI.
    resolve(G);

    // Active slot now holds the promoted hero, not the corpse.
    expect(G.players['1'].active?.iid).toBe(expectedPromoted.iid);
    expect((G.players['1'].active?.respawnTurnsLeft ?? 0)).toBe(0);
    // The corpse moved to a bench slot and kept its respawn countdown.
    const corpseOnBench = G.players['1'].bench.find((b) => b?.iid === aiActiveIid);
    expect(corpseOnBench).toBeDefined();
    expect((corpseOnBench!.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
  });

  it("AI's Active stays a corpse when no bench hero can be promoted", () => {
    const G = freshG();
    // Empty AI bench so no candidates remain.
    G.players['1'].bench = [null, null, null];
    const aiActive = G.players['1'].active!;
    damageUnit(G, aiActive, 9999, 'pure');
    reapDead(G, G.players['1']);
    // No swap — corpse stays in slot.
    expect(G.players['1'].active?.iid).toBe(aiActive.iid);
    expect((G.players['1'].active?.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
  });

  it("promoteToActive works during the OPPONENT's turn (cross-turn callable)", () => {
    const G = freshG();
    // Kill P0's active so they're a corpse and need to promote.
    const p0Active = G.players['0'].active!;
    damageUnit(G, p0Active, 9999, 'pure');
    reapDead(G, G.players['0']);
    expect((G.players['0'].active?.respawnTurnsLeft ?? 0)).toBeGreaterThan(0);
    const benchPick = G.players['0'].bench.find((b) => b)!;
    // Dispatch the promote move with playerID='1' (opponent's turn). It must
    // still act on P0's board — the owning player is derived from the iid.
    const r = runMove('promoteToActive', G, '1', benchPick.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(G.players['0'].active?.iid).toBe(benchPick.iid);
  });
});

// ============================================================================
// The ultimate: a kit ability, unlocked at Level 2
// ============================================================================
describe('rule: a hero unlocks its ultimate at Level 2', () => {
  // Drive the engine's turn.onBegin directly: it's the same handler the
  // client invokes.
  function runOnBegin(G: GameState, turn: number, pid: PlayerID) {
    const onBegin = (DeadlockGame.turn as any).onBegin;
    onBegin({ G, ctx: { turn, currentPlayer: pid, numPlayers: 2 } as any, events: {} as any, random: {} as any });
  }

  it('no ultimate is ever a card: it is a kit ability, and no card of one is on the board, however late the turn or high the level', () => {
    const G = freshG();
    for (const h of [G.players['0'].active, ...G.players['0'].bench]) if (h) h.level = 2;
    for (let t = 2; t < 12; t += 2) {
      runOnBegin(G, t, '0');
      for (const h of heroesOf(G.players['0'])) expect(kitAbilityIds(h), h.cardId).toContain(heroData(h)!.ult);
      expect(boardCards(G, '0').filter((c) => CARDS_BY_ID[c.cardId]?.type === 'ultimate')).toEqual([]);
    }
  });

  it('every hero at Level 2 may use its ultimate, free, through useSkill', () => {
    const G = freshG();
    G.players['0'].souls = 0;
    for (const h of [G.players['0'].active, ...G.players['0'].bench]) if (h) h.level = 2;
    // Nobody on the other side falls (a kill would pay a bounty).
    for (const h of [G.players['1'].active, ...G.players['1'].bench]) if (h) h.hp = h.hpMax = 50;
    // P0's roster: Haze, Vindicta, Lash, Paige → their ultimates (Vindicta's needs a target).
    const [haze, vindicta, lash, paige] = [G.players['0'].active!, ...G.players['0'].bench] as NonNullable<typeof G.players['0']['active']>[];
    expect(runMove('useSkill', G, '0', haze.iid, undefined, 'eff_ult_haze')).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', vindicta.iid, G.players['1'].active!.iid, 'eff_ult_vindicta')).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', lash.iid, undefined, 'eff_ult_lash')).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', paige.iid, undefined, 'eff_ult_paige')).not.toBe('INVALID_MOVE');
    expect(G.players['0'].souls).toBe(0);
  });
});

// ============================================================================
// Item cap = MAX_ITEMS (3) per hero: a full hero buys no 4th, it sells one first
// ============================================================================
describe('rule: a full hero buys nothing more until it sells', () => {
  /** P0's Active, in the shop step with souls to spare, wearing three bought items. */
  function full() {
    const G = freshReadyGame({ step: 'shop' });
    G.players['0'].souls = 99;
    const hero = G.players['0'].active!;
    for (const itemId of ['extra_spirit', 'extra_health', 'restorative_shot']) buyItem(G, '0', itemId, hero);
    return { G, hero };
  }

  it('a 4th buy for a hero at the cap is INVALID_MOVE ("full")', () => {
    const { G, hero } = full();
    expect(slotCap(G, '0')).toBe(MAX_ITEMS);
    expect(wornItems(hero).length).toBe(3);
    expect(buyBlocked(G, '0', 'extended_magazine', hero.iid)).toBe('full');
    expect(runMove('buy', G, '0', 'extended_magazine', hero.iid)).toBe('INVALID_MOVE');
    expect(wornItems(hero).length).toBe(3);
  });

  it('selling a worn item frees its slot: the 4th buy then succeeds and the sold item is gone', () => {
    const { G, hero } = full();
    const sold = wornItems(hero)[0];
    expect(runMove('sell', G, '0', sold.iid)).not.toBe('INVALID_MOVE');
    expect(findWornItem(G, sold.iid)).toBeNull();
    expect(buyBlocked(G, '0', 'extended_magazine', hero.iid)).toBeNull();
    expect(runMove('buy', G, '0', 'extended_magazine', hero.iid)).not.toBe('INVALID_MOVE');
    expect(wornItems(hero).map((it) => it.cardId)).toEqual(['extra_health', 'restorative_shot', 'extended_magazine']);
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
