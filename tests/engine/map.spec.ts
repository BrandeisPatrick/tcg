/**
 * The map (rules.md §6): each side's structures and the pushes that take them
 * down, the flex slot, the Mid-Boss in the pit and its Rejuvenator, the
 * respawn timer by the round, and the round cap. Built on the hand-made test
 * board (`freshReadyGame`: P0's act step on engine turn 2, P1 moved first) and
 * driven through the engine's front door (`perform`) and its turn edges
 * (`beginTurn`, `endTurnEffects`).
 */
import { describe, expect, it } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { INVALID, perform } from '@/engine/engine';
import { attackBlocked, attackTargets, blocked, legalActions, skillTargets } from '@/engine/legality';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { forecastAttack } from '@/engine/forecast';
import { damageUnit } from '@/engine/damage';
import { resolve } from '@/engine/death';
import { addStatus } from '@/engine/statusOps';
import { pushStructures, riseBoss } from '@/engine/map';
import {
  checkWinner, findCardOnBoard, isRespawning, killPush, respawnTimer, slotCap, standingVerdict, structureHp, structureOf,
  targetsFor,
} from '@/engine/query';
import { MATCH_TURNS, round } from '@/engine/rounds';
import {
  BOSS_CARD_ID, BOSS_HP, BOSS_RETALIATION, MAX_ITEMS, RESPAWN_TURNS, REVIVE_CREDITS, ROUND_CAP,
} from '@/engine/constants';
import { enumerateAIMoves } from '@/ai/heuristic';
import { freshReadyGame, giveItem, makeHero, setTrack, structuresOf } from './_helpers';

const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 1, numPlayers: 2 }) as never;

/** The board at engine turn `turn`, its mover's act step: P1 moves first, so
 *  odd turns are P1's and even ones P0's. */
function at(turn: number, G: GameState = freshReadyGame()): GameState {
  G.turnNumber = turn;
  return G;
}

/** The Mid-Boss in the pit, as the engine raises it (round 4 on). P0's Haze
 *  swings for 3 (her Attack 1, raised by 2): the boss's numbers below are
 *  written against a swing of 3. */
function withBoss(G: GameState = at(8)): { G: GameState; boss: CardInstance } {
  G.players['0'].active!.atkMod = 2;
  riseBoss(G);
  return { G, boss: G.boss! };
}

/** `pid`'s Active swings at the boss (its only target). */
const shootBoss = (G: GameState, pid: PlayerID) => perform(G, pid, { type: 'attack', targetIid: G.boss!.iid });

describe('the structures: Guardian 4 → Walker 6 → Patron 8, pushed front first', () => {
  it('every side starts on the full track', () => {
    const G = freshReadyGame();
    for (const pid of ['0', '1'] as PlayerID[]) {
      expect(G.players[pid].structures).toEqual([
        { kind: 'guardian', hp: 4, max: 4 }, { kind: 'walker', hp: 6, max: 6 }, { kind: 'patron', hp: 8, max: 8 },
      ]);
    }
  });

  it('a push damages the front standing structure and carries the rest on; the felled Guardian pays no souls', () => {
    const G = freshReadyGame();
    const souls = G.players['0'].souls;
    expect(pushStructures(G, '1', 5, 'kill')).toBe(5);
    expect(G.players['1'].structures.map((s) => s.hp)).toEqual([0, 5, 8]);
    expect(G.players['0'].souls).toBe(souls);
    const fx = G.fx.filter((e) => e.kind === 'push' || e.kind === 'fall');
    expect(fx.map((e) => `${e.kind}:${e.structure}`)).toEqual(['push:guardian', 'fall:guardian', 'push:walker']);
    expect(G.record['0']).toMatchObject({ pushes: 1, pushDamage: 5 });
  });

  it('a felled Walker gives the pushing side the flex slot: every hero of it wears one item more', () => {
    const G = freshReadyGame();
    expect(slotCap(G, '0')).toBe(MAX_ITEMS);
    pushStructures(G, '1', 10, 'kill');
    expect(G.players['0'].flexSlot).toBe(true);
    expect(slotCap(G, '0')).toBe(MAX_ITEMS + 1);
    expect(slotCap(G, '1')).toBe(MAX_ITEMS);
  });

  it('a felled Patron wins at once, and what is left past it is lost', () => {
    const G = freshReadyGame();
    expect(pushStructures(G, '1', 30, 'kill')).toBe(18);
    expect(structureHp(G.players['1'])).toBe(0);
    expect(checkWinner(G)).toEqual({ winner: '0' });
  });

  it("a scripted track of the Patron alone (a Story fight's, a lesson's) has no Guardian and no flex slot", () => {
    const G = freshReadyGame();
    setTrack(G, '1', { patron: 3 });
    const souls = G.players['0'].souls;
    pushStructures(G, '1', 2, 'kill');
    expect(structureOf(G.players['1'], 'patron').hp).toBe(1);
    expect(G.players['0'].souls).toBe(souls);
    expect(G.players['0'].flexSlot).toBe(false);
  });
});

describe('pushes: a kill pushes the victim\'s level + 1, an empty lane its pusher\'s bullet power', () => {
  it('the kill pays no souls and pushes level + 1 into the victim\'s side', () => {
    const G = freshReadyGame();
    const rival = G.players['1'].active!;
    rival.hp = 1;
    rival.level = 2;
    const souls = G.players['0'].souls;
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(isRespawning(rival)).toBe(true);
    expect(G.players['0'].souls).toBe(souls);
    expect(structuresOf(G, '1')).toBe(18 - 3);
    expect(G.record['0'].kills).toBe(1);
  });

  it('from round 9 the push is doubled', () => {
    const G = at(18); // round 9, P0's turn
    const rival = G.players['1'].active!;
    rival.hp = 1;
    expect(killPush(G, rival)).toBe(4);
    perform(G, '0', { type: 'attack' });
    expect(structuresOf(G, '1')).toBe(18 - 4);
  });

  it('at the End, with every rival hero down, the standing Active pushes its bullet power (doubled from round 9)', () => {
    for (const [turn, mult] of [[2, 1], [18, 2]] as const) {
      const G = at(turn);
      G.players['0'].active!.atkMod = 2; // Haze's Attack 1, raised to 3
      for (const c of [G.players['1'].active!, ...G.players['1'].bench]) { c!.hp = 0; c!.respawnTurnsLeft = 2; }
      endTurnEffects(G, '0');
      expect(structuresOf(G, '1'), `turn ${turn}`).toBe(18 - 3 * mult); // Haze's 3
      expect(G.record['0'].pushes).toBe(1);
    }
  });

  it('a lane with a hero standing is not pushed', () => {
    const G = freshReadyGame();
    for (const c of G.players['1'].bench) { c!.hp = 0; c!.respawnTurnsLeft = 2; }
    endTurnEffects(G, '0');
    expect(structuresOf(G, '1')).toBe(18);
  });
});

describe('the wait before a fallen hero goes back to the hand', () => {
  it('RESPAWN_TURNS (2) own turns, in every round, whatever the hero wears', () => {
    expect(RESPAWN_TURNS).toBe(2);
    for (const t of [1, 7, 10, 18, 30]) expect(respawnTimer(at(t), at(t).players['1'].active!), `turn ${t}`).toBe(RESPAWN_TURNS);
    const G = at(10); // round 5
    const rival = G.players['1'].active!;
    giveItem(G, rival, 'extra_spirit');
    expect(respawnTimer(G, rival)).toBe(RESPAWN_TURNS);
  });

  it('a fall arms it; when it runs out the hero is in its owner\'s hand at full HP, its level and items kept, its slot empty', () => {
    const G = at(10);
    const p1 = G.players['1'];
    const rival = p1.active!;
    rival.level = 3;
    const worn = giveItem(G, rival, 'extra_spirit');
    rival.hp = 1;
    perform(G, '0', { type: 'attack' });
    expect(rival.respawnTurnsLeft).toBe(RESPAWN_TURNS);
    // The AI seat promoted a bench hero; the corpse waits on the bench.
    expect(p1.active).not.toBe(rival);
    const slot = p1.bench.indexOf(rival);
    expect(slot).toBeGreaterThanOrEqual(0);
    endTurnEffects(G, '0');
    beginTurn(G, '1', 11);
    expect(rival.respawnTurnsLeft).toBe(1);
    endTurnEffects(G, '1');
    beginTurn(G, '0', 12);
    endTurnEffects(G, '0');
    beginTurn(G, '1', 13);
    expect(p1.bench[slot]).toBeNull();
    expect(p1.hand).toContain(rival);
    expect(rival).toMatchObject({ zone: 'hand', hp: rival.hpMax, level: 3 });
    expect(rival.respawnTurnsLeft).toBeUndefined();
    expect(rival.attached).toContain(worn);
    expect(G.fx.some((e) => e.kind === 'deck' && e.what === 'toHand' && e.iid === rival.iid)).toBe(true);
  });
});

describe('the Mid-Boss', () => {
  it('rises at the start of round 4 — the first mover\'s own turn 4 — and not before', () => {
    const G = at(6); // P0's own turn 3 (round 3)
    beginTurn(G, '1', 7);
    expect(round(G)).toBe(4);
    expect(G.boss).toMatchObject({ cardId: BOSS_CARD_ID, zone: 'pit', ownerId: 'none', hp: BOSS_HP, hpMax: BOSS_HP });
    expect(G.fx.some((e) => e.kind === 'boss' && e.what === 'spawn')).toBe(true);
    const early = at(5);
    beginTurn(early, '0', 6);
    expect(early.boss).toBeNull();
  });

  it('is offered to the Active after the enemy heroes, and a bare attack swings at it when no enemy can be hit', () => {
    const { G, boss } = withBoss();
    expect(attackTargets(G, '0').map((t) => t.iid)).toEqual([G.players['1'].active!.iid, boss.iid]);
    expect(legalActions(G, '0').filter((a) => a.type === 'attack')).toEqual([{ type: 'attack' }, { type: 'attack', targetIid: boss.iid }]);
    addStatus(G, G.players['1'].active!, 'dome', 1, 1);
    expect(attackTargets(G, '0')).toEqual([boss]);
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(boss.hp).toBe(BOSS_HP - 3);
    expect(G.bossAttacker).toBe(G.players['0'].active!.iid);
  });

  it('keeps the attack\'s own rules: none on the first mover\'s first turn, one a turn, and it ends the Act', () => {
    const first = at(1);
    first.bossRespawnRound = 1; // a boss up from the first turn: still no attack on it
    riseBoss(first);
    expect(attackBlocked(first, '1', first.boss!.iid)).toBe('turn1');
    const { G } = withBoss();
    expect(shootBoss(G, '0')).not.toBe(INVALID);
    expect(blocked(G, '0', { type: 'attack', targetIid: G.boss!.iid })).toBe('used');
    expect(legalActions(G, '0')).toEqual([{ type: 'endTurn' }]);
  });

  it('only basic attacks reach it: no status lands, no ability or item is aimed at it, no other damage counts', () => {
    const { G, boss } = withBoss();
    addStatus(G, boss, 'bleed', 2, 3);
    expect(boss.statuses).toEqual([]);
    expect(damageUnit(G, boss, 5, 'spirit', 'test')).toBe(0);
    expect(damageUnit(G, boss, 5, 'attack', 'test')).toBe(0); // not inside a swing
    expect(boss.hp).toBe(BOSS_HP);
    for (const filter of ['enemyAny', 'enemyHero', 'anyBoard', 'enemyActive'] as const) {
      expect(targetsFor(G, '0', filter).some((t) => t.iid === boss.iid), filter).toBe(false);
    }
    const lash = G.players['0'].bench[1]!;
    const aimed = skillTargets(G, '0', lash);
    expect(aimed === 'none' || !aimed.some((t) => t.iid === boss.iid)).toBe(true);
  });

  it('a swing at it is bullets alone: nothing the attacker carries reacts, and it does not ricochet', () => {
    const { G, boss } = withBoss();
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'toxic_bullets');
    giveItem(G, haze, 'ricochet');
    const bench = G.players['1'].bench.map((b) => b!.hp);
    shootBoss(G, '0');
    expect(boss.statuses).toEqual([]);
    expect(G.players['1'].bench.map((b) => b!.hp)).toEqual(bench);
    expect(G.bossDamage).toEqual({ '0': BOSS_HP - boss.hp, '1': 0 });
  });

  it('hits back at the End step for 2 pure damage', () => {
    const { G } = withBoss();
    const haze = G.players['0'].active!;
    addStatus(G, haze, 'shield', 5, 99);
    shootBoss(G, '0');
    const hp = haze.hp;
    endTurnEffects(G, '0');
    expect(haze.hp).toBe(hp - BOSS_RETALIATION);
    expect(G.fx.some((e) => e.kind === 'hit' && e.iid === haze.iid && e.source?.iid === G.boss!.iid)).toBe(true);
  });

  it('a hero its blow fells pays no bounty and pushes nothing', () => {
    const { G } = withBoss();
    const haze = G.players['0'].active!;
    shootBoss(G, '0');
    haze.hp = BOSS_RETALIATION;
    const souls = G.players['1'].souls;
    endTurnEffects(G, '0');
    expect(isRespawning(haze)).toBe(true);
    expect(G.players['1'].souls).toBe(souls);
    expect(structuresOf(G, '0')).toBe(18);
    expect(G.record['1'].kills).toBe(0);
  });

  it('falls to the side that dealt it more: the Rejuvenator (no souls), and rises again 4 rounds on', () => {
    const { G, boss } = withBoss();
    G.bossDamage = { '0': 4, '1': 3 };
    boss.hp = 3; // P0's swing of 3 finishes it
    const souls = G.players['0'].souls;
    shootBoss(G, '0');
    expect(G.boss).toBeNull();
    expect(G.players['0'].souls).toBe(souls);
    expect(G.players['0']).toMatchObject({ reviveCredits: REVIVE_CREDITS, reviveUntilRound: 6 });
    expect(G.bossRespawnRound).toBe(8);
    expect(G.record['0'].bossKills).toBe(1);
    expect(G.fx.filter((e) => e.kind === 'boss').map((e) => (e.kind === 'boss' ? e.what : ''))).toEqual(['spawn', 'death', 'award']);
    // No blow at the End from a boss that has fallen.
    const hp = G.players['0'].active!.hp;
    endTurnEffects(G, '0');
    expect(G.players['0'].active!.hp).toBe(hp);
    // It rises again as round 8 opens (the first mover's own turn 8, engine turn 15).
    beginTurn(G, '1', 13);
    expect(round(G)).toBe(7);
    expect(G.boss).toBeNull();
    beginTurn(G, '1', 15);
    expect(round(G)).toBe(8);
    expect(G.boss).toMatchObject({ hp: BOSS_HP });
    expect(G.bossDamage).toEqual({ '0': 0, '1': 0 });
  });

  it('the side with more damage takes it even when the other lands the last hit', () => {
    const { G, boss } = withBoss();
    G.bossDamage = { '0': 0, '1': 8 };
    boss.hp = 2;
    shootBoss(G, '0');
    expect(G.boss).toBeNull();
    expect(G.players['1'].reviveCredits).toBe(REVIVE_CREDITS);
    expect(G.players['0'].reviveCredits).toBe(0);
  });

  it('a tie goes to the side behind on net worth; still tied, to the last hit', () => {
    const behind = withBoss();
    behind.G.bossDamage = { '0': 4, '1': 7 };
    behind.boss.hp = 3; // P0's 3 ties it 7–7
    behind.G.players['1'].souls = 10; // P0 is behind
    shootBoss(behind.G, '0');
    expect(behind.G.players['0'].reviveCredits).toBe(REVIVE_CREDITS);
    expect(behind.G.record['0'].bossKillsBehind).toBe(1);
    const ahead = withBoss();
    ahead.G.bossDamage = { '0': 4, '1': 7 };
    ahead.boss.hp = 3;
    ahead.G.players['0'].souls = 10; // P0 is ahead: P1 takes it
    shootBoss(ahead.G, '0');
    expect(ahead.G.players['1'].reviveCredits).toBe(REVIVE_CREDITS);
    const even = withBoss();
    even.G.bossDamage = { '0': 4, '1': 7 };
    even.boss.hp = 3;
    shootBoss(even.G, '0'); // level net worth: the last hit's
    expect(even.G.players['0'].reviveCredits).toBe(REVIVE_CREDITS);
  });

  it('the forecast walks a swing at it, and a swing that fells it', () => {
    const { G, boss } = withBoss();
    const plan = forecastAttack(G, '0', boss.iid);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ targetIid: boss.iid, finalDamage: 3, predictedHpAfter: BOSS_HP - 3 });
    boss.hp = 2;
    const kill = forecastAttack(G, '0', boss.iid);
    expect(kill).toMatchObject({ damageToActive: 2, defenderActiveKO: boss.iid, pushDamage: 0 });
  });
});

describe('the Rejuvenator', () => {
  it('a hero that falls with a credit live is pushed, then back in place at full HP, a credit spent', () => {
    const G = at(10);
    const p1 = G.players['1'];
    p1.reviveCredits = 2;
    p1.reviveUntilRound = 6;
    const rival = p1.active!;
    rival.hp = 1;
    const souls = G.players['0'].souls;
    perform(G, '0', { type: 'attack' });
    expect(isRespawning(rival)).toBe(false);
    expect(rival.hp).toBe(rival.hpMax);
    expect(p1.active).toBe(rival);
    expect(p1.reviveCredits).toBe(1);
    expect(G.players['0'].souls).toBe(souls);
    expect(structuresOf(G, '1')).toBe(16);
    expect(G.record['1'].revives).toBe(1);
    expect(G.fx.some((e) => e.kind === 'revive' && e.iid === rival.iid && e.credit)).toBe(true);
    // The forecast says it fell all the same.
    rival.hp = 1;
    expect(forecastAttack({ ...G, attackUsed: false }, '0')).toMatchObject({ defenderActiveKO: rival.iid, damageToActive: 1 });
  });

  it('lapses as the last round it is good through ends — the second mover\'s turn of it', () => {
    const G = at(11); // round 6, P1's (the first mover's) turn
    G.players['1'].reviveCredits = 1;
    G.players['1'].reviveUntilRound = 6;
    endTurnEffects(G, '1');
    expect(G.players['1'].reviveCredits).toBe(1);
    at(12, G);
    endTurnEffects(G, '0');
    expect(G.players['1'].reviveCredits).toBe(0);
  });

  it('a credit brings back a hero the boss\'s blow fells too', () => {
    const { G } = withBoss();
    G.players['0'].reviveCredits = 1;
    G.players['0'].reviveUntilRound = 5;
    const haze = G.players['0'].active!;
    shootBoss(G, '0');
    haze.hp = 1;
    endTurnEffects(G, '0');
    expect(isRespawning(haze)).toBe(false);
    expect(haze.hp).toBe(haze.hpMax);
    expect(G.players['0'].reviveCredits).toBe(0);
  });
});

describe('the round cap', () => {
  it('as the second mover\'s own turn 12 ends, the side with more structure HP wins', () => {
    const G = at(2 * ROUND_CAP); // P0 is the second mover
    pushStructures(G, '0', 3, 'kill');
    expect(checkWinner(G)).toBeUndefined();
    endTurnEffects(G, '0');
    expect(G.capped).toBe(true);
    expect(checkWinner(G)).toEqual({ winner: '1' });
    expect(MATCH_TURNS).toBe(2 * ROUND_CAP);
  });

  it('not as the first mover\'s own turn 12 ends', () => {
    const G = at(2 * ROUND_CAP - 1);
    endTurnEffects(G, '1');
    expect(G.capped).toBe(false);
    expect(checkWinner(G)).toBeUndefined();
  });

  it('a tie on structure HP goes to more net worth, then to the second mover', () => {
    const G = at(2 * ROUND_CAP);
    endTurnEffects(G, '0');
    expect(standingVerdict(G)).toEqual({ winner: '0', by: 'secondMover' });
    G.players['1'].souls += 3;
    expect(standingVerdict(G)).toEqual({ winner: '1', by: 'netWorth' });
    expect(checkWinner(G)).toEqual({ winner: '1' });
  });
});

describe('the AI and the Mid-Boss', () => {
  /** P1's act step in round 4 with the boss up: Dynamo (a swing of 3) in the lane, its
   *  skill spent and its bench down, so the choice is where the attack goes — or none. */
  function aiBoard(): { G: GameState; boss: CardInstance; attacker: CardInstance } {
    const G = at(7);
    riseBoss(G);
    const attacker = G.players['1'].active = makeHero('hero_dynamo', '1', 'active', 0);
    attacker.atkMod = 2; // Dynamo's Attack 1, raised to 3
    attacker.hp = attacker.hpMax = 20;
    attacker.skillUsedThisTurn = true;
    for (const b of G.players['1'].bench) { b!.hp = 0; b!.respawnTurnsLeft = 2; }
    G.players['0'].active!.hp = G.players['0'].active!.hpMax = 30;
    return { G, boss: G.boss!, attacker };
  }
  const aimsAtBoss = (G: GameState, boss: CardInstance, lookahead = true) => {
    const t = enumerateAIMoves(G, ctx('1'), lookahead)[0];
    return t.move === 'attack' && (t.args[0] === boss.iid || (t.args.length === 0 && attackTargets(G, '1')[0]?.iid === boss.iid));
  };

  for (const lookahead of [true, false]) {
    const how = lookahead ? 'with lookahead' : 'by its crude scores';
    it(`${how}: finishes the boss when its swing fells it and the tally gives it to its side`, () => {
      const { G, boss } = aiBoard();
      boss.hp = 3;
      G.bossDamage = { '0': 0, '1': 7 };
      expect(aimsAtBoss(G, boss, lookahead)).toBe(true);
    });

    it(`${how}: never hands the boss to the rival`, () => {
      const { G, boss } = aiBoard();
      boss.hp = 3;
      G.bossDamage = { '0': 7, '1': 0 };
      expect(aimsAtBoss(G, boss, lookahead)).toBe(false);
    });

    it(`${how}: leaves a fresh boss be while the rival Active is a fair target`, () => {
      const { G, boss } = aiBoard();
      expect(aimsAtBoss(G, boss, lookahead)).toBe(false);
      expect(enumerateAIMoves(G, ctx('1'), lookahead)[0].move).toBe('attack');
    });

    it(`${how}: chips the boss when no enemy hero can be hit (a Dome on the rival Active)`, () => {
      const { G, boss } = aiBoard();
      addStatus(G, G.players['0'].active!, 'dome', 1, 1);
      expect(aimsAtBoss(G, boss, lookahead)).toBe(true);
    });
  }
});

describe('the board finds the boss', () => {
  it('findCardOnBoard knows it, owned by nobody', () => {
    const { G, boss } = withBoss();
    expect(findCardOnBoard(G, boss.iid)).toEqual({ owner: 'none', card: boss });
  });

  it('the state-based pass takes a boss at 0 HP', () => {
    const { G, boss } = withBoss();
    G.bossDamage = { '0': 10, '1': 0 };
    G.bossLastHit = '0';
    boss.hp = 0;
    resolve(G);
    expect(G.boss).toBeNull();
    expect(G.players['0'].reviveCredits).toBe(REVIVE_CREDITS);
  });
});
