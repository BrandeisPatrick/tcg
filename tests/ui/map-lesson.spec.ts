import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { attackTargets } from '@/engine/legality';
import { BOSS_HP, GUARDIAN_BOUNTY } from '@/engine/constants';
import { structureOf } from '@/engine/query';
import { setMatchConfig } from '@/storage/matchConfig';
import type { GameState } from '@/engine/types';
import { LESSONS, lessonById } from '@/tutorial/lessons';

// Lesson 5, The Map, is staged to be won in one turn of round 4: Done, Frost
// Grenade on a Lash on one point (the kill's push fells the rival's Guardian
// of 2), the attack — at the Mid-Boss, the only target left — and the End
// that follows it on its own, whose push into the empty lane fells the
// rival's Patron of 2.

function lesson() {
  setMatchConfig({ heroPreferences: [null, null, null, null], tutorial: lessonById('map')!.setup(), lesson: 'map' });
  const c = Client({ game: DeadlockGame, numPlayers: 2 });
  c.start();
  return c;
}
type LessonClient = ReturnType<typeof lesson>;
const state = (c: LessonClient) => c.getState()! as unknown as { G: GameState; ctx: Ctx };
const moves = (c: LessonClient) => c.moves as Record<string, (...a: unknown[]) => void>;

describe('Lesson 5: the map', () => {
  it('is the fifth lesson, registered after the bench', () => {
    expect(LESSONS.map((l) => l.id)).toEqual(['skill', 'souls', 'level', 'bench', 'map']);
    expect(lessonById('map')!.number).toBe(5);
  });

  it('opens in round 4 on your turn, the Mid-Boss in the pit and the rival on a Guardian of 2 and a Patron of 2', () => {
    const { G } = state(lesson());
    expect([G.turnNumber, G.step, G.firstMover]).toEqual([7, 'shop', '0']);
    expect(G.boss).toMatchObject({ hp: BOSS_HP });
    expect(G.players['1'].structures.map((s) => [s.kind, s.hp])).toEqual([['guardian', 2], ['walker', 0], ['patron', 2]]);
    expect(G.players['0'].structures.map((s) => s.hp)).toEqual([4, 6, 8]);
  });

  it('the taught line wins: the kill pushes the Guardian down, the attack goes into the Mid-Boss, the End pushes the empty lane', () => {
    const c = lesson();
    moves(c).closeShop();
    const kelvin = state(c).G.players['0'].active!;
    const lash = state(c).G.players['1'].active!;
    const souls = state(c).G.players['0'].souls;
    moves(c).useSkill(kelvin.iid, lash.iid);
    let G = state(c).G;
    expect(structureOf(G.players['1'], 'guardian').hp).toBe(0);
    expect(G.players['0'].souls).toBe(souls + 2 + GUARDIAN_BOUNTY); // Lash's bounty, then the Guardian's
    expect(attackTargets(G, '0').map((t) => t.zone)).toEqual(['pit']);
    moves(c).attack();
    G = state(c).G;
    expect(G.boss!.hp).toBeLessThan(BOSS_HP);
    expect(G.bossDamage['0']).toBeGreaterThan(0);
    expect(state(c).ctx.gameover).toBeUndefined();
    moves(c).endTurn();
    expect(state(c).ctx.gameover?.winner).toBe('0');
  });

  it('without the kill the lane is not empty and nothing falls', () => {
    const c = lesson();
    moves(c).closeShop();
    moves(c).endTurn();
    expect(state(c).ctx.gameover).toBeUndefined();
    expect(structureOf(state(c).G.players['1'], 'patron').hp).toBe(2);
  });
});
