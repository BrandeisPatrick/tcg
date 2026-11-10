import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { attackTargets } from '@/engine/legality';
import { BOSS_HP } from '@/engine/constants';
import { effectiveAtk, kitCost, structureOf } from '@/engine/query';
import { setMatchConfig, type StorySetup } from '@/storage/matchConfig';
import type { GameState } from '@/engine/types';
import { LESSONS, LESSON_KIT, TURN_BUTTON, emptySeen, lessonById, type CoachView } from '@/tutorial/lessons';
import { mapLesson } from '@/tutorial/mapLesson';

// Lesson 5, The Map, is staged to be won in one turn of round 4: Frost
// Grenade (three of the turn's five souls) on a Lash on one point (the kill's
// push fells the rival's Guardian of 2); no rival stands and there is nothing
// to attack, so the turn is ended, and its End pushes Kelvin's bullet power,
// 1, into the empty lane, felling the rival's Patron of 1. The Mid-Boss is off
// for now (MID_BOSS_ENABLED), and the lesson's Mid-Boss part with it — the
// attack into the Mid-Boss, the End following it on its own. That part is
// kept behind the lesson's `midBoss` switch, and still wins when it is on.

function lesson(setup: StorySetup = lessonById('map')!.setup()) {
  setMatchConfig({ heroPreferences: [null, null, null, null], tutorial: setup, lesson: 'map' });
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

  it('opens in round 4 on your turn, no Mid-Boss in the pit, and the rival on a Guardian of 2 and a Patron of 1', () => {
    const { G } = state(lesson());
    expect([G.turnNumber, G.firstMover]).toEqual([7, '0']);
    expect(G.midBoss).toBe(false);
    expect(G.boss).toBeNull();
    expect(G.players['1'].structures.map((s) => [s.kind, s.hp])).toEqual([['guardian', 2], ['walker', 0], ['patron', 1]]);
    // The End's push into the empty lane is Kelvin's bullet power: enough for that Patron.
    expect(effectiveAtk(G.players['0'].active!)).toBe(1);
    expect(G.players['0'].structures.map((s) => s.hp)).toEqual([4, 6, 8]);
  });

  it('teaches no Mid-Boss: its steps are the sheet, the kill, and the turn button for the empty lane', () => {
    const map = lessonById('map')!;
    expect(map.steps.map((s) => s.id)).toEqual(['look', 'skill', 'end']);
    expect(`${map.blurb} ${map.outro}`).not.toMatch(/Mid-Boss|Rejuvenator/);
    const c = lesson();
    const v: CoachView = { G: state(c).G, me: '0', seen: emptySeen, targeting: false, attacking: false, sheetOpen: false, sheetHero: null };
    for (const step of map.steps) {
      const body = typeof step.body === 'string' ? step.body : step.body(v);
      expect(body, step.id).not.toMatch(/Mid-Boss/);
    }
    const end = map.steps[2];
    expect(end.allow!(v)).toEqual([TURN_BUTTON]);
    expect(end.task({ ...v, seen: { ...emptySeen, turnsEnded: 1 } })).toBe(true);
  });

  it('the taught line wins: the kill pushes the Guardian down, nothing is left to attack, and the End pushes the empty lane', () => {
    const c = lesson();
    const kelvin = state(c).G.players['0'].active!;
    const lash = state(c).G.players['1'].active!;
    const souls = state(c).G.players['0'].souls;
    expect(lash.hp).toBe(1);
    moves(c).useSkill(kelvin.iid);
    const G = state(c).G;
    expect(structureOf(G.players['1'], 'guardian').hp).toBe(0);
    expect(G.players['0'].souls).toBe(souls - kitCost(kelvin)); // the skill's price; a kill and a fall pay no souls
    expect(attackTargets(G, '0')).toEqual([]);
    expect(state(c).ctx.gameover).toBeUndefined();
    moves(c).endTurn();
    expect(state(c).ctx.gameover?.winner).toBe('0');
  });

  it('without the kill the lane is not empty and nothing falls', () => {
    const c = lesson();
    moves(c).endTurn();
    expect(state(c).ctx.gameover).toBeUndefined();
    expect(structureOf(state(c).G.players['1'], 'patron').hp).toBe(1);
  });

  it('with its Mid-Boss part on, it is the lesson it was: the attack goes into the Mid-Boss, then the End', () => {
    const boss = mapLesson(LESSON_KIT, true);
    expect(boss.steps.map((s) => s.id)).toEqual(['look', 'skill', 'attack', 'end']);
    const c = lesson(boss.setup());
    expect(state(c).G.boss).toMatchObject({ hp: BOSS_HP });
    moves(c).useSkill(state(c).G.players['0'].active!.iid);
    expect(attackTargets(state(c).G, '0').map((t) => t.zone)).toEqual(['pit']);
    moves(c).attack();
    const G = state(c).G;
    expect(G.boss!.hp).toBeLessThan(BOSS_HP);
    expect(G.bossDamage['0']).toBeGreaterThan(0);
    moves(c).endTurn();
    expect(state(c).ctx.gameover?.winner).toBe('0');
  });
});
