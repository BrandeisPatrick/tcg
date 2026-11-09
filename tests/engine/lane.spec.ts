/**
 * "Earn it in the lane": the Active earns more exp than the bench, a hero's
 * ultimate (a kit ability, never a card) unlocks the moment it reaches
 * ULT_UNLOCK_LEVEL, and a fall pushes the fallen hero's level + 1 into its
 * side's structures.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, setTrack } from './_helpers';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { grantExp } from '@/engine/expSystem';
import { INVALID, perform } from '@/engine/engine';
import { skillBlocked } from '@/engine/legality';
import { forecastAttack } from '@/engine/forecast';
import { checkWinner, killPush, kitAbilityIds, seatOf, structureHp } from '@/engine/query';
import { damageUnit } from '@/engine/damage';
import { reapDead } from '@/engine/death';
import {
  EXP_ON_KILL, EXP_PER_TURN_ACTIVE, EXP_PER_TURN_BENCH, LEVEL_THRESHOLDS, ULT_UNLOCK_LEVEL,
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

describe('exp comes from the lane', () => {
  it('at the end of the turn the Active earns EXP_PER_TURN_ACTIVE and each bench hero EXP_PER_TURN_BENCH', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    endTurnEffects(G, '0');
    expect(ps.active!.exp).toBe(EXP_PER_TURN_ACTIVE);
    for (const b of ps.bench) expect(b!.exp).toBe(EXP_PER_TURN_BENCH);
    // The other side earned nothing: it was not its turn.
    expect(G.players['1'].active!.exp).toBe(0);
    for (const b of G.players['1'].bench) expect(b!.exp).toBe(0);
  });

  it('the Active reaches Level 2 before a bench hero does', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    const turnsToLevel = (c: CardInstance) => {
      let n = 0;
      while ((c.level ?? 1) < 2 && n < 20) { endTurnEffects(G, '0'); n++; }
      return n;
    };
    const active = turnsToLevel(ps.active!);
    expect(active).toBe(Math.ceil(LEVEL_THRESHOLDS[0] / EXP_PER_TURN_ACTIVE));
    const bench = turnsToLevel(ps.bench[0]!);
    expect(active + bench).toBe(Math.ceil(LEVEL_THRESHOLDS[0] / EXP_PER_TURN_BENCH));
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

describe('a hero unlocks its ultimate at Level 2', () => {
  it('no ultimate is open while every hero is Level 1, however late the turn', () => {
    const G = freshReadyGame();
    for (let t = 2; t <= 20; t += 2) {
      beginTurn(G, '0', t);
      expect(ultBlock(G, G.players['0'].active!)).toBe('locked');
      expect(ultCardsOnBoard(G, '0')).toEqual([]);
    }
  });

  it("reaching Level 2 unlocks that hero's ultimate at once — and only that hero's; nothing is dealt", () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.souls = SOULS;
    grantExp(G, ps.active!, LEVEL_THRESHOLDS[0]);
    expect(ps.active!.level).toBe(ULT_UNLOCK_LEVEL);
    expect(ultBlock(G, ps.active!)).toBeNull();
    expect(ultBlock(G, ps.bench[1]!)).toBe('locked');
    expect(G.log.some((l) => l.text === 'Haze unlocked Bullet Dance.')).toBe(true);
    // Nothing is dealt: the ultimate is one of Haze's kit abilities, and no card of it is in the hand or on the board.
    expect(kitAbilityIds(ps.active!)).toContain('eff_ult_haze');
    expect(ultCardsOnBoard(G, '0')).toEqual([]);
    expect(ps.hand).toEqual([]);
  });

  it('a kill blow that levels the attacker unlocks its ultimate mid-turn; the attack has ended the Act, so it waits a turn', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.souls = SOULS;
    ps.active!.exp = LEVEL_THRESHOLDS[0] - EXP_ON_KILL;
    G.players['1'].active!.hp = 1;
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    expect(ps.active!.level).toBe(2);
    expect(ultBlock(G, ps.active!)).toBe('actOver');
    G.attackUsed = false; // the next turn
    expect(ultBlock(G, ps.active!)).toBeNull();
  });

  it('a hero that levels on the bench unlocks its ultimate too, and may use it from there', () => {
    const G = freshReadyGame();
    const ps = G.players['0'];
    ps.souls = SOULS;
    const lash = ps.bench[1]!;
    grantExp(G, lash, LEVEL_THRESHOLDS[0]);
    expect(ultBlock(G, lash)).toBeNull();
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid, skillId: 'eff_ult_lash' })).not.toBe(INVALID);
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
