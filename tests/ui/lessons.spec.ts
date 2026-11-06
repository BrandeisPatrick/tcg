import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { activateBlocked, attackBlocked, buyPrice } from '@/engine/legality';
import { ACTIVE_COOLDOWN, LANE_INCOME, RETREAT_COST } from '@/engine/constants';
import { forecastAttack } from '@/engine/forecast';
import { attackPower, itemCooldown, wornActives, wornItems } from '@/engine/query';
import { itemCard } from '@/cards';
import { setMatchConfig } from '@/storage/matchConfig';
import type { CardInstance, GameState } from '@/engine/types';
import { actionRefusal } from '@/ui/board/heroActions';
import { lessonById, type LessonId } from '@/tutorial/lessons';

// Every lesson is staged so the move it teaches is the move that wins. Each
// opens on the player's turn, in its shop step (buy — the card goes to the
// hand —, then Done: `closeShop`), and then the act, where a card in the hand
// is put on a hero (`playCard`); the attack is one-way, ends the Act and is
// the player's to make, so the numbers are pinned here, played through the
// engine: the taught line wins, and the line that skips the lesson does not.
// The rival's patron has one point left, so the one kill is the win.

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

  it('Lesson 2: Extended Magazine is tier 1, two of the turn\'s four souls; bought it waits in the hand, and only once it is on Yamato is his swing at a Lash on 3 the kill', () => {
    for (const line of ['skip', 'buy only', 'buy and play'] as const) {
      const c = lesson('souls');
      expect(turn(c)).toEqual([2, 'shop']);      // Turn 2: there is an attack
      const [yamato, lash] = actives(c);
      expect(state(c).G.players['0'].souls).toBe(LANE_INCOME);              // four souls…
      expect(itemCard('extended_magazine')!.tier).toBe(1);
      expect(buyPrice(state(c).G, '0', 'extended_magazine')).toBe(LANE_INCOME / 2); // …and the item costs two of them
      expect(lash.hp).toBe(3);
      expect(attackPower(yamato, lash).total).toBe(2);
      if (line !== 'skip') {
        moves(c).buy('extended_magazine');
        const me = state(c).G.players['0'];
        expect(me.hand.map((x) => x.cardId)).toEqual(['extended_magazine']); // in the hand, on nobody yet
        expect(wornItems(me.active!)).toEqual([]);
        expect(me.souls).toBe(LANE_INCOME / 2);                             // the two not spent stay
      }
      moves(c).closeShop();
      if (line === 'buy and play') {
        const card = state(c).G.players['0'].hand[0];
        moves(c).playCard(card.iid, yamato.iid);                              // put on in the act: free
        const me = state(c).G.players['0'];
        expect(wornItems(me.active!).map((it) => it.cardId)).toEqual(['extended_magazine']);
        expect([me.hand, me.souls]).toEqual([[], LANE_INCOME / 2]);
        expect(attackPower(me.active!, lash).total).toBe(3);
      }
      expect(attackBlocked(state(c).G, '0')).toBeNull();
      moves(c).attack();
      expect(winner(c), line).toBe(line === 'buy and play' ? '0' : undefined);
    }
  });

  it('Lesson 3: Cold Front waits in the hand; put on Kelvin it starts on cooldown and cannot be the kill — Frost Grenade and the swing finish a Lash on 3, the swing alone does not', () => {
    for (const skill of [false, true]) {
      const c = lesson('level');
      expect(turn(c)).toEqual([2, 'shop']);      // Turn 2: there is an attack
      expect(state(c).G.players['0'].hand.map((x) => x.cardId)).toEqual(['cold_front']); // the gift, in the hand
      moves(c).closeShop();                      // nothing to buy: Done
      const [kelvin, lash] = actives(c);
      moves(c).playCard(state(c).G.players['0'].hand[0].iid, kelvin.iid);
      const front = wornActives(state(c).G.players['0'].active!).find((it) => it.cardId === 'cold_front')!;
      expect(itemCooldown(front)).toBe(ACTIVE_COOLDOWN.low);               // ready in two turns
      expect(activateBlocked(state(c).G, '0', front.iid, lash.iid)).toBe('cooldown');
      expect(lash.hp).toBe(3);
      expect(attackPower(kelvin, lash).total).toBe(2);
      if (skill) moves(c).useSkill(kelvin.iid, lash.iid);                   // one spirit damage
      moves(c).attack();
      expect(winner(c), skill ? 'skill, then the swing' : 'the swing alone').toBe(skill ? '0' : undefined);
    }
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
