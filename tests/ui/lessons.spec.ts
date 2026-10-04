import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked, planAttackPhase } from '@/engine/combat';
import { enumerateAIMoves } from '@/ai/heuristic';
import { setMatchConfig } from '@/storage/matchConfig';
import type { GameState } from '@/engine/types';
import { lessonById, type LessonId } from '@/tutorial/lessons';

// Every lesson is staged so the move it teaches is the move that wins. The
// attack is one-way and is the player's to make, so the numbers are pinned
// here, played through the engine: the taught line wins, and the line that
// skips the lesson does not.

function lesson(id: LessonId) {
  setMatchConfig({ playerDeck: [], heroPreferences: [null, null, null, null], tutorial: lessonById(id)!.setup(), lesson: id });
  const c = Client({ game: DeadlockGame, numPlayers: 2 });
  c.start();
  return c;
}
type LessonClient = ReturnType<typeof lesson>;
const state = (c: LessonClient) => c.getState()! as unknown as { G: GameState; ctx: Ctx };
const moves = (c: LessonClient) => c.moves as Record<string, (...a: unknown[]) => void>;
const card = (c: LessonClient, id: string) => state(c).G.players['0'].hand.find((h) => h.cardId === id)!;

/** The rival's turn, played by the AI the board uses. */
function rivalTurn(c: LessonClient) {
  for (let guard = 0; guard < 40 && state(c).ctx.currentPlayer === '1' && !state(c).ctx.gameover; guard++) {
    const before = c.getState()!._stateID;
    const best = enumerateAIMoves(state(c).G, state(c).ctx)[0];
    if (!best || best.move === 'endTurn') moves(c).endTurn();
    else moves(c)[best.move](...best.args);
    if (c.getState()!._stateID === before) moves(c).endTurn();
  }
}

describe('the tutorial is staged so the taught move wins', () => {
  it('Lesson 2: Kelvin swings for 2 at a Lash on 3; the magazine is the kill', () => {
    for (const geared of [false, true]) {
      const c = lesson('souls');
      moves(c).endTurn();           // Turn 1: nobody attacks
      rivalTurn(c);                 // Turn 2: the rival's move cannot heal Lash
      const { G } = state(c);
      expect(G.turnNumber).toBe(3);
      expect(G.players['1'].active!.hp).toBe(3);
      if (geared) moves(c).playCard(card(c, 'extended_magazine').iid, G.players['0'].active!.iid);
      expect(attackBlocked(state(c).G, '0')).toBeNull();
      moves(c).attack();
      expect(state(c).ctx.gameover?.winner, geared ? 'with the magazine' : 'without it').toBe(geared ? '0' : undefined);
    }
  });

  it('Lesson 3: the levelled swing is the kill, the plain one is not', () => {
    for (const geared of [false, true]) {
      const c = lesson('level');
      const { G } = state(c);
      expect(G.turnNumber).toBe(2);
      if (geared) moves(c).playCard(card(c, 'extra_health').iid, G.players['0'].active!.iid);
      expect(state(c).G.players['0'].active!.level ?? 1).toBe(geared ? 2 : 1);
      moves(c).attack();
      expect(state(c).ctx.gameover?.winner, geared ? 'levelled' : 'not levelled').toBe(geared ? '0' : undefined);
    }
  });

  it('Lesson 4: Kelvin cannot finish Lash and would fall to its attack; Yamato, sent in, can', () => {
    const c = lesson('bench');
    const { G } = state(c);
    const [kelvin, lash] = [G.players['0'].active!, G.players['1'].active!];
    expect(kelvin.hp).toBe(1);
    expect(planAttackPhase(G, '0').defenderActiveKO).toBeNull();      // Kelvin's swing
    expect(planAttackPhase(G, '1').defenderActiveKO).toBe(kelvin.iid); // Lash's, next turn
    expect(lash.hp).toBe(3);
    moves(c).moveHero(1, 0);        // retreat: Yamato in, for the two souls turn 3 brings
    expect(state(c).G.players['0'].active!.cardId).toBe('hero_yamato');
    expect(state(c).G.players['0'].souls).toBe(0);
    moves(c).attack();
    expect(state(c).ctx.gameover?.winner).toBe('0');
  });
});
