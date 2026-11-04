import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { activateBlocked, attackBlocked, buyPrice } from '@/engine/legality';
import { LANE_INCOME, RETREAT_COST } from '@/engine/constants';
import { forecastAttack } from '@/engine/forecast';
import { attackPower, wornActives, wornItems } from '@/engine/query';
import { itemCard } from '@/cards';
import { setMatchConfig } from '@/storage/matchConfig';
import type { CardInstance, GameState } from '@/engine/types';
import { actionRefusal } from '@/ui/board/heroActions';
import { lessonById, type LessonId } from '@/tutorial/lessons';

// Every lesson is staged so the move it teaches is the move that wins. Each
// opens on the player's turn, in its shop step (buy, then Done: `closeShop`),
// and then the act; the attack is one-way, ends the Act and is the player's to
// make, so the numbers are pinned here, played through the engine: the taught
// line wins, and the line that skips the lesson does not. The rival's patron
// has one point left, so the one kill is the win.

function lesson(id: LessonId) {
  setMatchConfig({ heroPreferences: [null, null, null, null], tutorial: lessonById(id)!.setup(), lesson: id });
  const c = Client({ game: DeadlockGame, numPlayers: 2 });
  c.start();
  return c;
}
type LessonClient = ReturnType<typeof lesson>;
const state = (c: LessonClient) => c.getState()! as unknown as { G: GameState; ctx: Ctx };
const moves = (c: LessonClient) => c.moves as Record<string, (...a: unknown[]) => void>;
const winner = (c: LessonClient) => state(c).ctx.gameover?.winner;
/** Your Active and the rival's, as the match stands. */
const actives = (c: LessonClient): [CardInstance, CardInstance] => [state(c).G.players['0'].active!, state(c).G.players['1'].active!];
/** The turn and the step it is in. */
const turn = (c: LessonClient) => [state(c).G.turnNumber, state(c).G.step];
const NO_ATTACK_ON_TURN_1 = { code: 'turn1', text: 'No attacks on Turn 1' };

describe('the tutorial is staged so the taught move wins', () => {
  it('Lesson 1: Turn 1 has no attack, so Kelvin\'s skill is the kill of a Lash on 1', () => {
    for (const taught of [false, true]) {
      const c = lesson('skill');
      expect(turn(c)).toEqual([1, 'shop']);
      moves(c).closeShop();                      // nothing to buy: Done
      const [kelvin, lash] = actives(c);
      expect(lash.hp).toBe(1);
      // Kelvin moves first: the first mover forgoes first strike.
      expect(actionRefusal(state(c).G, '0', { type: 'attack' })).toEqual(NO_ATTACK_ON_TURN_1);
      if (taught) moves(c).useSkill(kelvin.iid, lash.iid);
      else moves(c).endTurn();
      expect(winner(c), taught ? 'the skill' : 'no skill').toBe(taught ? '0' : undefined);
    }
  });

  it('Lesson 2: Extended Magazine is tier 1, two of the turn\'s four souls; Yamato swings for 2 at a Lash on 3, and the item is the kill', () => {
    for (const bought of [false, true]) {
      const c = lesson('souls');
      expect(turn(c)).toEqual([2, 'shop']);      // Turn 2: there is an attack
      const [yamato, lash] = actives(c);
      expect(state(c).G.players['0'].souls).toBe(LANE_INCOME);              // four souls…
      expect(itemCard('extended_magazine')!.tier).toBe(1);
      expect(buyPrice(yamato, 'extended_magazine')).toBe(LANE_INCOME / 2);  // …and the item costs two of them
      expect(lash.hp).toBe(3);
      expect(attackPower(yamato, lash).total).toBe(2);
      if (bought) {
        moves(c).buy('extended_magazine', yamato.iid);
        const me = state(c).G.players['0'];
        expect(wornItems(me.active!).map((it) => it.cardId)).toEqual(['extended_magazine']);
        expect(me.souls).toBe(LANE_INCOME / 2);                             // the two not spent stay
        expect(attackPower(me.active!, lash).total).toBe(3);
      }
      moves(c).closeShop();
      expect(attackBlocked(state(c).G, '0')).toBeNull();
      moves(c).attack();
      expect(winner(c), bought ? 'with the magazine' : 'without it').toBe(bought ? '0' : undefined);
    }
  });

  it('Lesson 3: Kelvin wears Cold Front; on Turn 1 he has no attack, and his swing of 2 would not finish a Lash on 4 anyway', () => {
    const c = lesson('level');
    expect(turn(c)).toEqual([1, 'shop']);
    const [kelvin, lash] = actives(c);
    expect(wornActives(kelvin).map((it) => it.cardId)).toEqual(['cold_front']);
    expect(lash.hp).toBe(4);
    moves(c).closeShop();                        // nothing to buy: Done
    expect(actionRefusal(state(c).G, '0', { type: 'attack' })).toEqual(NO_ATTACK_ON_TURN_1);
    expect(attackPower(kelvin, lash).total).toBeLessThan(lash.hp);
    moves(c).endTurn();                          // the turn ends without the item: no kill
    expect(winner(c)).toBeUndefined();
  });

  // Fails today, on the first expect: the lesson hands Cold Front over through
  // `StorySetup.playerItems`, and setup's `giveItems` (src/engine/actions/setup.ts)
  // starts an active item on its full cooldown — 2 for a tier 2 — which Turn 1's
  // start ticks only to 1, so `activateBlocked` answers 'cooldown' and the taught
  // move cannot be made. Flip to `it` once the lesson's Cold Front starts ready.
  it.fails('Lesson 3: Cold Front is ready on Turn 1, and using it on Lash (four spirit damage on a Lash on 4) is the kill', () => {
    const c = lesson('level');
    moves(c).closeShop();
    const [kelvin, lash] = actives(c);
    const front = wornActives(kelvin).find((it) => it.cardId === 'cold_front')!;
    expect(activateBlocked(state(c).G, '0', front.iid, lash.iid)).toBeNull();
    moves(c).activate(front.iid, lash.iid);
    expect(winner(c)).toBe('0');
  });

  it('Lesson 4: Kelvin cannot finish Lash and would fall to its attack; Yamato, sent in for a soul, can', () => {
    for (const retreat of [false, true]) {
      const c = lesson('bench');
      expect(turn(c)).toEqual([3, 'shop']);
      moves(c).closeShop();                      // keep the souls: Done
      const { G } = state(c);
      const [kelvin, lash] = actives(c);
      expect(kelvin.hp).toBe(1);
      expect(lash.hp).toBe(3);
      expect(forecastAttack(G, '0').defenderActiveKO).toBeNull();      // Kelvin's swing
      expect(forecastAttack(G, '1').defenderActiveKO).toBe(kelvin.iid); // Lash's, next turn
      if (retreat) {
        moves(c).moveHero(1, 0);                 // retreat: Yamato in, for a soul of the turn's income
        expect(state(c).G.players['0'].active!.cardId).toBe('hero_yamato');
        expect(state(c).G.players['0'].souls).toBe(LANE_INCOME - RETREAT_COST);
      }
      moves(c).attack();
      expect(winner(c), retreat ? 'Yamato' : 'Kelvin').toBe(retreat ? '0' : undefined);
    }
  });
});
