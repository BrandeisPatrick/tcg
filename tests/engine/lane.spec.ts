/**
 * Exp and the lane: a side's turn pays one point of exp to one of its heroes
 * on the board picked at random (Patrick, 2026-11-18), a hero's
 * ultimate (a kit ability, never a card) unlocks the moment it reaches
 * ULT_UNLOCK_LEVEL, and a fall pushes the fallen hero's level + 1 into its
 * side's structures.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, setTrack } from './_helpers';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { grantExp, totalExp, turnExpTaker } from '@/engine/expSystem';
import { INVALID, perform } from '@/engine/engine';
import { skillBlocked } from '@/engine/legality';
import { forecastAttack } from '@/engine/forecast';
import { checkWinner, killPush, kitAbilityIds, seatOf, structureHp } from '@/engine/query';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/death';
import {
  EXP_ON_KILL, EXP_PER_TURN, LEVEL_THRESHOLDS, MAX_LEVEL, ULT_UNLOCK_LEVEL,
} from '@/engine/constants';
import { CARDS_BY_ID } from '@/cards';

/** The ultimates' cards anywhere on `pid`'s side of the board — its heroes and
 *  what they wear: none ever, an ultimate being a kit ability. */
function ultCardsOnBoard(G: GameState, pid: PlayerID): string[] {
  const out: string[] = [];
  const walk = (c: CardInstance) => {
    if (CARDS_BY_ID[c.cardId]?.type === 'ultimate') out.push(c.cardId);
    for (const a of c.attached ?? []) walk(a);
  };
  for (const c of [G.players[pid].active, ...G.players[pid].bench]) if (c) walk(c);
  // …and in the hand: nothing is ever dealt into it (a card enters it only by a buy).
  for (const c of G.players[pid].hand) walk(c);
  return out;
}
/** Souls enough for any ultimate (a large one costs 12): what is checked here
 *  is the unlock, not the price. */
const SOULS = 20;

/** Why `hero` cannot use its ultimate now (null: it can). */
const ultBlock = (G: GameState, hero: CardInstance) =>
  skillBlocked(G, seatOf(hero), hero, undefined, (CARDS_BY_ID[hero.cardId] as { ult: string }).ult);

describe("a turn's exp goes to a random hero on the board (Patrick, 2026-11-18)", () => {
  /** `pid`'s heroes on the board, the Active first. */
  const board = (G: GameState, pid: PlayerID) =>
    [G.players[pid].active, ...G.players[pid].bench].filter((c): c is CardInstance => !!c);

  it('at the end of the turn one hero of that side earns EXP_PER_TURN; the other side earns nothing', () => {
    const G = freshReadyGame();
    expect(board(G, '0').length).toBeGreaterThan(2);
    endTurnEffects(G, '0');
    const earned = board(G, '0').map((c) => totalExp(c));
    expect(earned.filter((e) => e > 0)).toEqual([EXP_PER_TURN]);
    for (const c of board(G, '1')) expect(totalExp(c)).toBe(0);
  });

  it('the pick is random: over many turns every hero on the board takes some, and the board earns EXP_PER_TURN a turn', () => {
    const G = freshReadyGame();
    const heroes = board(G, '0');
    const turns = 30; // under the board's cap (heroes × 15), so no point is lost
    const takers: number[] = [];
    for (let t = 0; t < turns; t++) {
      const before = heroes.map((c) => totalExp(c));
      endTurnEffects(G, '0');
      takers.push(heroes.findIndex((c, i) => totalExp(c) > before[i]));
    }
    const earned = heroes.map((c) => totalExp(c));
    expect(earned.reduce((a, b) => a + b, 0)).toBe(turns * EXP_PER_TURN);
    for (const e of earned) expect(e).toBeGreaterThan(0);
    // Not a rotation: some hero takes the point two turns running.
    expect(takers.some((h, i) => i > 0 && h === takers[i - 1])).toBe(true);
  });

  it('a lone hero takes every point; a wider board slows each hero (a soft cost for going wide)', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.bench = ps.bench.map(() => null);
    for (let t = 0; t < LEVEL_THRESHOLDS[0]; t++) endTurnEffects(G, '0');
    expect(ps.active!.level).toBe(2);
    // A board of three earns LEVEL_THRESHOLDS[0] points in as many turns, so at most one hero has levelled.
    const G3 = freshReadyGame();
    for (let t = 0; t < LEVEL_THRESHOLDS[0]; t++) endTurnEffects(G3, '0');
    expect(board(G3, '0').filter((c) => (c.level ?? 1) >= 2).length).toBeLessThanOrEqual(1);
  });

  it('the pick skips a hero at the cap and a fallen one, and is none when no hero can earn', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    const bench = ps.bench.filter((c): c is CardInstance => !!c);
    const last = bench[bench.length - 1];
    ps.active!.level = MAX_LEVEL; ps.active!.exp = 0;
    bench[0].hp = 0; bench[0].respawnTurnsLeft = 2;
    for (const c of bench.slice(1, -1)) { c.level = MAX_LEVEL; c.exp = 0; }
    for (let i = 0; i < 20; i++) expect(turnExpTaker(G, ps)).toBe(last);
    last.level = MAX_LEVEL; last.exp = 0;
    expect(turnExpTaker(G, ps)).toBeUndefined();
  });

  it('a corpse earns nothing for the turn', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.bench[0]!.hp = 0;
    ps.bench[0]!.respawnTurnsLeft = 3;
    endTurnEffects(G, '0');
    expect(ps.bench[0]!.exp).toBe(0);
  });
});

describe('a hero unlocks its ultimate at Level 3 (2 until 2026-11-16)', () => {
  it('no ultimate is open while every hero is Level 1, however late the turn', () => {
    const G = freshReadyGame();
    for (let t = 2; t <= 20; t += 2) {
      beginTurn(G, '0', t);
      expect(ultBlock(G, G.players['0'].active!)).toBe('locked');
      expect(ultCardsOnBoard(G, '0')).toEqual([]);
    }
  });

  it("reaching Level 3 unlocks that hero's ultimate at once — and only that hero's; nothing is dealt", () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.souls = SOULS;
    grantExp(G, ps.active!, LEVEL_THRESHOLDS[0]);
    expect(ps.active!.level).toBe(2);
    expect(ultBlock(G, ps.active!)).toBe('locked'); // Level 2 unlocks nothing
    grantExp(G, ps.active!, LEVEL_THRESHOLDS[1]);
    expect(ps.active!.level).toBe(ULT_UNLOCK_LEVEL);
    expect(ultBlock(G, ps.active!)).toBeNull();
    expect(ultBlock(G, ps.bench[1]!)).toBe('locked');
    expect(G.log.some((l) => l.text === 'Haze unlocked Bullet Dance.')).toBe(true);
    // Nothing is dealt: the ultimate is one of Haze's kit abilities, and no card of it is in the hand or on the board.
    expect(kitAbilityIds(ps.active!)).toContain('eff_ult_haze');
    expect(ultCardsOnBoard(G, '0')).toEqual([]);
    expect(ps.hand).toEqual([]);
  });

  it('a kill blow that levels the attacker unlocks its ultimate mid-turn, and the turn goes on: it may use it at once', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.souls = SOULS;
    ps.active!.level = 2;
    ps.active!.exp = LEVEL_THRESHOLDS[1] - EXP_ON_KILL;
    G.players['1'].active!.hp = 1;
    expect(ultBlock(G, ps.active!)).toBe('locked');
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(ps.active!.level).toBe(ULT_UNLOCK_LEVEL);
    expect(ultBlock(G, ps.active!)).toBeNull();
  });

  it('a hero that levels on the bench unlocks its ultimate too, and may use it from there', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.souls = SOULS;
    const lash = ps.bench[1]!;
    grantExp(G, lash, LEVEL_THRESHOLDS[0] + LEVEL_THRESHOLDS[1]);
    expect(ultBlock(G, lash)).toBeNull();
    // Death Slam is aimed at an enemy hero (2026-11-17: it lifts one back to its player's hand).
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid, targetIid: G.players['1'].active!.iid, skillId: 'eff_ult_lash' })).not.toBe(INVALID);
  });
});

describe("a fall pushes the fallen hero's level + 1 into its side's structures", () => {
  it('killPush is the level + 1', () => {
    const G = freshReadyGame();
    const h = G.players['1'].active!;
    expect(killPush(G, h)).toBe(2);
    h.level = 3;
    expect(killPush(G, h)).toBe(4);
  });

  it('a Level 2 hero reaped pushes 3; a Level 1 hero 2', () => {
    const G = freshReadyGame();
    const ps = G.players['1'];
    ps.active!.level = 2;
    ps.active!.hp = 1;
    ps.bench[0]!.hp = 1;
    const before = structureHp(ps);
    damageUnit(G, ps.active!, 5, 'pure');
    damageUnit(G, ps.bench[0]!, 5, 'pure');
    reapDead(G, ps);
    expect(before - structureHp(ps)).toBe(5);
  });

  it('the attack forecast promises the push and the attack delivers it', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    t.level = 2;
    t.hp = 1;
    const plan = forecastAttack(G, '0');
    expect(plan.defenderActiveKO).toBe(t.iid);
    expect(plan.pushDamage).toBe(3);
    const before = structureHp(G.players['1']);
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(before - structureHp(G.players['1'])).toBe(3);
  });

  it('a fall whose push fells the Patron ends the match', () => {
    const G = freshReadyGame();
    const t = G.players['1'].active!;
    t.level = 2;
    t.hp = 1;
    setTrack(G, '1', { patron: 3 });
    expect(checkWinner(G)).toBeUndefined();
    perform(G, '0', { type: 'attack' });
    expect(checkWinner(G)?.winner).toBe('0');
  });
});
