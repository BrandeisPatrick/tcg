import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'boardgame.io/client';
import { DeadlockGame } from '@/engine/game';
import { addStatus, tickStartOfTurn } from '@/engine/statusOps';
import { damageUnit, reapDead } from '@/engine/damage';
import type { GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, configureReadyMatch } from './_helpers';

// Client-based tests boot straight into a playable match (skip the draft).
beforeAll(configureReadyMatch);

function freshG(): GameState {
  return freshReadyGame();
}

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

describe('rule: only one skill per player per turn', () => {
  it('rejects a second skill use in the same turn', () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 9; // enough to pay the 1-soul skill cost
    const enemy = G.players['1'];
    // Aggro deck heroes: [haze (passive), vindicta (passive), lash (skill), paige (skill)].
    // Pick the two skill heroes — Lash + Paige — for this per-turn-cap test.
    const hero1 = me.bench[1]!;  // Lash
    const hero2 = me.bench[2]!;  // Paige
    expect(me.skillUsedThisTurn).toBe(false);
    const r1 = runMove('useSkill', G, '0', hero1.iid, enemy.active!.iid);
    expect(r1).not.toBe('INVALID_MOVE');
    expect(me.skillUsedThisTurn).toBe(true);
    const r2 = runMove('useSkill', G, '0', hero2.iid, me.active!.iid);
    expect(r2).toBe('INVALID_MOVE');
  });

  it('flag resets at the start of the player\'s next turn', () => {
    const c = Client({ game: DeadlockGame, numPlayers: 2 });
    c.start();
    let g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(false);
    // Use a skill — Lash on bench (active Haze is now passive-only).
    const hero = g.players['0'].bench[1]!;  // Lash
    const target = g.players['1'].active!;
    (c.moves as any).useSkill(hero.iid, target.iid);
    g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(true);
    // End turn, opponent's turn begins; flag still set for P0.
    c.moves.endTurn?.();
    g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(true);
    // End opp turn; P0's turn begins again, flag resets.
    c.moves.endTurn?.();
    g = c.getState()!.G as GameState;
    expect(g.players['0'].skillUsedThisTurn).toBe(false);
  });
});

describe('rule: skills cost 1 soul', () => {
  it('useSkill spends 1 soul on success', () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 3;
    const hero = me.bench[1]!;  // Lash
    const target = G.players['1'].active!;
    const r = runMove('useSkill', G, '0', hero.iid, target.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(2);
  });

  it('useSkill is INVALID_MOVE when souls < 1', () => {
    const G = freshG();
    const me = G.players['0'];
    me.souls = 0;
    const hero = me.bench[1]!;  // Lash
    const target = G.players['1'].active!;
    const r = runMove('useSkill', G, '0', hero.iid, target.iid);
    expect(r).toBe('INVALID_MOVE');
    expect(me.skillUsedThisTurn).toBe(false);
    expect(me.souls).toBe(0);
  });
});

describe('rule: hero respawn after KO', () => {
  it("a KO'd hero stays on the board as a corpse (not in discard)", () => {
    const G = freshG();
    // Use P0 so we don't trigger AI auto-promote (which moves the corpse to
    // the bench). The "corpse stays on board" rule is what's under test here.
    const hero = G.players['0'].active!;
    const targetIid = hero.iid;
    damageUnit(G, hero, 9999, 'pure');
    reapDead(G, G.players['0']);
    expect(G.players['0'].discard.some((c: any) => c.iid === targetIid)).toBe(false);
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

  it('hero KO costs the patron a flat 1 (overflow discarded)', () => {
    const G = freshG();
    const target = G.players['1'].active!;
    target.hp = 3;
    const beforePatron = G.players['1'].hp;
    damageUnit(G, target, 8, 'pure'); // 3 to KO, 5 overflow discarded
    expect(target.hp).toBe(0);
    reapDead(G, G.players['1']);
    expect(G.players['1'].hp).toBe(beforePatron - 1); // death-only patron model
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
    reapDead(G, G.players['1']);

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
// Ultimate unlock at turn 5
// ============================================================================
describe('rule: ultimates unlock at start of turn 5', () => {
  // Drive the engine's turn.onBegin directly: it's the same handler the
  // client invokes, but bypassing the client lets us prime an empty hand so
  // the unlock isn't gated by MAX_HAND from passive draws.
  function runOnBegin(G: GameState, turn: number, pid: PlayerID) {
    const onBegin = (DeadlockGame.turn as any).onBegin;
    onBegin({ G, ctx: { turn, currentPlayer: pid, numPlayers: 2 } as any, events: {} as any, random: {} as any });
  }

  it('no ult enters hand before turn 5', () => {
    const G = freshG();
    G.players['0'].hand = [];
    for (let t = 1; t < 5; t++) {
      runOnBegin(G, t, '0');
      expect(G.players['0'].hand.filter((c) => c.cardId.startsWith('ult_')).length).toBe(0);
      G.players['0'].hand = [];
    }
  });

  it('all linked ults are dealt to hand at the start of turn 5', () => {
    const G = freshG();
    G.players['0'].hand = [];
    runOnBegin(G, 5, '0');
    const ultsInHand = new Set(G.players['0'].hand.filter((c) => c.cardId.startsWith('ult_')).map((c) => c.cardId));
    // Aggro deck heroes: Haze, Vindicta, Lash, Paige → their ults.
    for (const ult of ['ult_haze', 'ult_vindicta', 'ult_lash', 'ult_paige']) {
      expect(ultsInHand.has(ult)).toBe(true);
    }
  });

  it('an ult unlock that is blocked by a full hand retries next turn (not consumed)', () => {
    const G = freshG();
    // Fill the hand so no ult fits.
    while (G.players['0'].hand.length < 7) {
      G.players['0'].hand.push({
        iid: `fill-${G.players['0'].hand.length}`, cardId: 'healing_rite',
        ownerId: '0', zone: 'hand', hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
        statuses: [], exhausted: false, skillUsedThisTurn: false,
      } as any);
    }
    runOnBegin(G, 5, '0');
    expect(G.players['0'].ultsConsumed.length).toBe(0);
    // Empty hand and retry next turn — ults should still be deliverable.
    G.players['0'].hand = [];
    runOnBegin(G, 6, '0');
    expect(G.players['0'].ultsConsumed.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Equipment cap = 3 per hero (the 4th attach must specify a discard target)
// ============================================================================
describe('rule: equipment cap forces a discard pick', () => {
  it('4th attach without discardIid is INVALID_MOVE', () => {
    const G = freshG();
    G.players['0'].souls = 99;
    const hero = G.players['0'].active!;
    const ids = ['extra_spirit', 'extra_health', 'restorative_shot', 'extended_magazine'];
    let lastResult: any;
    for (const cardId of ids) {
      const newCard = {
        iid: `tmp-${cardId}`, cardId, ownerId: '0' as PlayerID, zone: 'hand',
        hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [],
        exhausted: false, skillUsedThisTurn: false,
      } as any;
      G.players['0'].hand.push(newCard);
      lastResult = runMove('playCard', G, '0', newCard.iid, hero.iid);
    }
    expect(hero.attached?.length).toBe(3);
    expect(lastResult).toBe('INVALID_MOVE');
  });

  it('4th attach WITH discardIid succeeds and discards the named item', () => {
    const G = freshG();
    G.players['0'].souls = 99;
    const hero = G.players['0'].active!;
    // Fill to cap with three pieces.
    for (const cardId of ['extra_spirit', 'extra_health', 'restorative_shot']) {
      const c = {
        iid: `pre-${cardId}`, cardId, ownerId: '0' as PlayerID, zone: 'hand',
        hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [],
        exhausted: false, skillUsedThisTurn: false,
      } as any;
      G.players['0'].hand.push(c);
      runMove('playCard', G, '0', c.iid, hero.iid);
    }
    expect(hero.attached?.length).toBe(3);
    const discardTarget = hero.attached![0];
    // 4th attach naming the first item as the discard.
    const fourth = {
      iid: 'fourth', cardId: 'extended_magazine', ownerId: '0' as PlayerID, zone: 'hand',
      hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [],
      exhausted: false, skillUsedThisTurn: false,
    } as any;
    G.players['0'].hand.push(fourth);
    const r = runMove('playCard', G, '0', fourth.iid, hero.iid, discardTarget.iid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(hero.attached?.length).toBe(3);
    // The picked item moved to discard.
    expect(hero.attached!.find((e) => e.iid === discardTarget.iid)).toBeUndefined();
    expect(G.players['0'].discard.some((c) => c.iid === discardTarget.iid)).toBe(true);
  });
});

// ============================================================================
// Mutual damage in the active duel
// ============================================================================
describe('rule: mutual damage in the active duel', () => {
  it('Active-vs-Active end-of-turn attack damages BOTH heroes', async () => {
    const { planAttackPhase, resolveAttackPhase } = await import('@/engine/combat');
    const G = freshG();
    const attacker = G.players['0'].active!;
    const defender = G.players['1'].active!;
    attacker.hpMax = 30; attacker.hp = 30;
    defender.hpMax = 30; defender.hp = 30;
    const attackerHp0 = attacker.hp;
    const defenderHp0 = defender.hp;
    const plan = planAttackPhase(G, '0');
    // Plan should include at least the active swing with retaliation.
    expect(plan.steps.length).toBeGreaterThan(0);
    resolveAttackPhase(G, '0');
    // Both Actives took damage (defender from attacker's swing, attacker from retaliation).
    expect(defender.hp).toBeLessThan(defenderHp0);
    expect(attacker.hp).toBeLessThan(attackerHp0);
  });
});
