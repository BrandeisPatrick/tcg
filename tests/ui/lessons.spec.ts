import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked, playBlocked, playCost, retreatCost, skillBlocked } from '@/engine/legality';
import { LANE_INCOME, PRICE } from '@/engine/constants';
import { forecastAttack } from '@/engine/forecast';
import { attackPower, heroRetreat, kitCharges, kitCost, wornItems } from '@/engine/query';
import { itemCard } from '@/cards';
import { setMatchConfig } from '@/storage/matchConfig';
import type { CardInstance, GameState } from '@/engine/types';
import { actionRefusal } from '@/ui/board/heroActions';
import { lessonById, type LessonId } from '@/tutorial/lessons';

// Every lesson is staged so the move it teaches is the move that wins. Each
// opens on the player's turn, its income paid and its card drawn (a lesson's
// deck is empty or names its one card), where a card in the hand is put on a
// hero for its price (`playCard`); the attack is one-way, ends the Act and is
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
/** The turn, and the cards in your hand. */
const turn = (c: LessonClient) => [state(c).G.turnNumber, state(c).G.players['0'].hand.map((x) => x.cardId)];
const NO_ATTACK_ON_TURN_1 = { code: 'turn1', text: 'No attacks on Turn 1' };

describe('the tutorial is staged so the taught move wins', () => {
  it('Lesson 1: Turn 1 has no attack, so Kelvin\'s skill — no souls, the first of its two charges — is the kill of a Lash on 1', () => {
    for (const taught of [false, true]) {
      const c = lesson('skill');
      expect(turn(c)).toEqual([1, []]);          // nothing in the hand: an empty deck
      const [kelvin, lash] = actives(c);
      expect(lash.hp).toBe(1);
      // Kelvin moves first: the first mover forgoes first strike.
      expect(actionRefusal(state(c).G, '0', { type: 'attack' })).toEqual(NO_ATTACK_ON_TURN_1);
      // Frost Grenade hits the enemy Active and heals Kelvin, and costs no souls: the turn's two stay banked. It holds two charges.
      expect(kitCost(kelvin)).toBe(0);
      expect(state(c).G.players['0'].souls).toBe(LANE_INCOME);
      expect(kitCharges(kelvin, 'skill_kelvin')).toEqual({ max: 2, left: 2 });
      expect(skillBlocked(state(c).G, '0', kelvin)).toBeNull();
      if (taught) moves(c).useSkill(kelvin.iid, lash.iid);
      else moves(c).endTurn();
      expect(winner(c), taught ? 'the skill' : 'no skill').toBe(taught ? '0' : undefined);
    }
  });

  it('Lesson 2: Extended Magazine is drawn as the turn opens, tier 1 for one of the turn\'s two souls; only once it is on Yamato is his swing at a Lash on 2 the kill', () => {
    for (const line of ['skip', 'play'] as const) {
      const c = lesson('souls');
      expect(turn(c)).toEqual([2, ['extended_magazine']]); // Turn 2: there is an attack; the one card drawn
      const [yamato, lash] = actives(c);
      expect(state(c).G.players['0'].souls).toBe(LANE_INCOME);              // two souls…
      expect(state(c).G.players['0'].deck).toEqual([]);
      expect(itemCard('extended_magazine')!.tier).toBe(1);
      expect(playCost(yamato, 'extended_magazine')).toBe(PRICE[1]);         // …and the item costs one (prices halved, 2026-11-16)
      expect(lash.hp).toBe(2);
      expect(attackPower(yamato, lash).total).toBe(1);
      if (line === 'play') {
        const card = state(c).G.players['0'].hand[0];
        moves(c).playCard(card.iid, yamato.iid);
        const me = state(c).G.players['0'];
        expect(wornItems(me.active!).map((it) => it.cardId)).toEqual(['extended_magazine']);
        expect([me.hand, me.souls]).toEqual([[], LANE_INCOME - PRICE[1]]);  // a soul of the turn's income left
        expect(attackPower(me.active!, lash).total).toBe(2);
      }
      expect(attackBlocked(state(c).G, '0')).toBeNull();
      moves(c).attack();
      expect(winner(c), line).toBe(line === 'play' ? '0' : undefined);
    }
  });

  it('Lesson 3: Cold Front waits in the hand, a spell; played on a Lash on 3 it hits for 2 and is discarded, and the swing finishes him — the swing alone does not', () => {
    for (const spell of [false, true]) {
      const c = lesson('level');
      expect(turn(c)).toEqual([2, ['cold_front']]); // Turn 2: there is an attack; the gift, in the hand
      const [kelvin, lash] = actives(c);
      // Two souls brought in and the turn's two; Cold Front costs two since prices halved.
      expect(state(c).G.players['0'].souls).toBe(2 + LANE_INCOME);
      expect(playCost(undefined, 'cold_front')).toBe(PRICE[2]);
      expect(lash.hp).toBe(3);
      expect(attackPower(kelvin, lash).total).toBe(1);
      if (spell) {
        const card = state(c).G.players['0'].hand[0];
        expect(playBlocked(state(c).G, '0', card.iid, lash.iid)).toBeNull();
        moves(c).playCard(card.iid, lash.iid);                              // two spirit damage to the rival Active
        const me = state(c).G.players['0'];
        expect(me.souls).toBe(2 + LANE_INCOME - PRICE[2]);                  // the spell's price went; the rest stays
        expect(me.hand).toEqual([]);
        expect(me.discard.map((x) => x.cardId)).toEqual(['cold_front']);    // played once, then discarded
        expect(wornItems(me.active!)).toEqual([]);                          // never worn
        expect(state(c).G.players['1'].active!.hp).toBe(1);
        expect(me.active!.skillUsedThisTurn ?? false).toBe(false);          // no ability of Kelvin's was spent
      }
      moves(c).attack();
      expect(winner(c), spell ? 'the spell, then the swing' : 'the swing alone').toBe(spell ? '0' : undefined);
    }
  });

  it('Lesson 4: Kelvin cannot finish Lash and would fall to its attack; Yamato, sent in for Kelvin\'s printed soul, can', () => {
    for (const retreat of [false, true]) {
      const c = lesson('bench');
      expect(turn(c)).toEqual([3, []]);
      const { G } = state(c);
      const [kelvin, lash] = actives(c);
      expect(kelvin.hp).toBe(1);
      expect(lash.hp).toBe(3);
      expect(forecastAttack(G, '0').defenderActiveKO).toBeNull();      // Kelvin's swing
      expect(forecastAttack(G, '1').defenderActiveKO).toBe(kelvin.iid); // Lash's, next turn
      if (retreat) {
        // The Retreat costs the leaving hero's printed price: Kelvin's is one soul.
        expect(heroRetreat(kelvin)).toBe(1);
        expect(retreatCost(G, '0')).toBe(1);
        moves(c).moveHero(1, 0);                 // retreat: Yamato in, for a soul of the turn's income
        expect(state(c).G.players['0'].active!.cardId).toBe('hero_yamato');
        expect(state(c).G.players['0'].souls).toBe(LANE_INCOME - heroRetreat(kelvin));
      }
      moves(c).attack();
      expect(winner(c), retreat ? 'Yamato' : 'Kelvin').toBe(retreat ? '0' : undefined);
    }
  });
});
