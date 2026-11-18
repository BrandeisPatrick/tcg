import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked, placeHeroBlocked, playBlocked, playCost, retreatCost, skillBlocked } from '@/engine/legality';
import { EXP_ON_EQUIP, LANE_INCOME, LEVEL_THRESHOLDS, PRICE, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { forecastAttack } from '@/engine/forecast';
import { attackPower, effectiveAtk, heroRetreat, kitCost, kitWaiting, structureOf, wornItems } from '@/engine/query';
import { itemCard } from '@/cards';
import { setMatchConfig } from '@/storage/matchConfig';
import type { CardInstance, GameState } from '@/engine/types';
import { actionRefusal } from '@/ui/board/heroActions';
import { LESSONS, emptySeen, lessonById, type CoachView, type LessonId } from '@/tutorial/lessons';

// Every lesson is staged so the move it teaches is the move that wins. Each
// opens on the player's turn, its income paid and its card drawn (a lesson's
// deck is empty or names its one card), where a card in the hand is put on a
// hero for its price (`playCard`); the attack is one-way and is the player's
// to make, so the numbers are pinned here, played through the engine: the
// taught line wins, and the line that skips the lesson does not. The rival's
// patron has one point left, so the one kill is the win.

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

describe('the tutorial is step by step', () => {
  it('is eight lessons, in the order they build on each other', () => {
    expect(LESSONS.map((l) => [l.number, l.id])).toEqual([
      [1, 'attack'], [2, 'skill'], [3, 'souls'], [4, 'spells'], [5, 'bench'], [6, 'levelup'], [7, 'fallen'], [8, 'map'],
    ]);
  });

  it('every step is one tap named in its heading, with one short line; a lesson keeps three lines at most', () => {
    for (const l of LESSONS) {
      const c = lesson(l.id);
      const v: CoachView = { G: state(c).G, me: '0', seen: emptySeen, targeting: false, placing: false, attacking: false, sheetOpen: false, sheetHero: null };
      expect(new Set(l.steps.map((s) => s.id)).size, `${l.id}: step ids`).toBe(l.steps.length);
      for (const step of l.steps) {
        const title = typeof step.title === 'string' ? step.title : step.title(v);
        const body = typeof step.body === 'string' ? step.body : step.body(v);
        expect(title, `${l.id}/${step.id}`).toMatch(/^Tap /);
        expect(body.length, `${l.id}/${step.id}: ${body}`).toBeLessThanOrEqual(90);
      }
      expect(l.learned.length, l.id).toBeGreaterThan(0);
      expect(l.learned.length, l.id).toBeLessThanOrEqual(3);
      for (const line of l.learned) expect(line.length, `${l.id}: ${line}`).toBeLessThanOrEqual(90);
    }
  });
});

describe('the tutorial is staged so the taught move wins', () => {
  it('Lesson 1: Warden\'s swing of 2 at a Lash on 4 is the kill on the second turn of it, Lash\'s own turn between them', () => {
    const c = lesson('attack');
    expect(turn(c)).toEqual([2, []]);            // Turn 2: there is an attack; nothing in the hand
    const [warden, lash] = actives(c);
    expect([warden.cardId, lash.hp, lash.hpMax]).toEqual(['hero_warden', 4, 4]);
    expect(attackPower(warden, lash).total).toBe(2);
    expect(attackBlocked(state(c).G, '0')).toBeNull();
    moves(c).attack();
    expect(state(c).G.players['1'].active!.hp).toBe(2);
    expect(winner(c), 'one attack').toBeUndefined();
    // One attack a turn: the second is refused, and the turn is passed.
    expect(attackBlocked(state(c).G, '0')).not.toBeNull();
    moves(c).endTurn();
    moves(c).attack();                           // Lash's turn: a swing of 1 at Warden
    expect(state(c).G.players['0'].active!.hp).toBe(warden.hpMax - 1);
    moves(c).endTurn();
    expect(state(c).G.turnNumber).toBe(4);
    moves(c).attack();
    expect(winner(c), 'the second attack').toBe('0');
  });

  it('Lesson 2: Yamato\'s skill — no souls, then a wait — and the swing after it are the kill of a Lash on 3; the swing alone is not', () => {
    for (const taught of [false, true]) {
      const c = lesson('skill');
      expect(turn(c)).toEqual([2, []]);          // Turn 2: there is an attack; nothing in the hand
      const [yamato, lash] = actives(c);
      expect([yamato.cardId, lash.hp]).toEqual(['hero_yamato', 3]);
      expect(attackPower(yamato, lash).total).toBe(1);
      // Flying Slash costs no souls: the turn's two stay banked.
      expect(kitCost(yamato)).toBe(0);
      expect(skillBlocked(state(c).G, '0', yamato, lash.iid)).toBeNull();
      if (taught) {
        moves(c).useSkill(yamato.iid, lash.iid);
        expect(state(c).G.players['1'].active!.hp).toBe(1);
        expect(state(c).G.players['0'].souls).toBe(LANE_INCOME);
        // Used, it waits; the attack is still open in the same turn.
        expect(kitWaiting(state(c).G.players['0'].active!, 'skill_yamato')).toBe(3);
        expect(skillBlocked(state(c).G, '0', state(c).G.players['0'].active!)).toBe('used');
        expect(attackBlocked(state(c).G, '0')).toBeNull();
      }
      moves(c).attack();
      expect(winner(c), taught ? 'the skill, then the swing' : 'the swing alone').toBe(taught ? '0' : undefined);
    }
  });

  it('Lesson 3: Extended Magazine is drawn as the turn opens, tier 1 for one of the turn\'s two souls; only once it is on Yamato is his swing at a Lash on 2 the kill', () => {
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

  it('Lesson 4: Cold Front waits in the hand, a spell; played on a Lash on 3 it hits for 2 and is discarded, and the swing finishes him — the swing alone does not', () => {
    for (const spell of [false, true]) {
      const c = lesson('spells');
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

  it('Lesson 5: Haze cannot finish Lash and would fall to its attack; Warden, drawn, benched for free and sent in for Haze\'s printed soul, can', () => {
    for (const taught of [false, true]) {
      const c = lesson('bench');
      expect(turn(c)).toEqual([3, ['hero_warden']]);                    // Turn 3; the one card drawn is a hero
      const { G } = state(c);
      const [haze, lash] = actives(c);
      expect([haze.cardId, haze.hp, lash.hp, lash.hpMax]).toEqual(['hero_haze', 1, 2, 2]);
      expect(forecastAttack(G, '0').defenderActiveKO).toBeNull();       // Haze's swing
      expect(forecastAttack(G, '1').defenderActiveKO).toBe(haze.iid);   // Lash's, next turn
      // Nobody is on the bench yet, so there is no Retreat to make.
      expect(actionRefusal(G, '0', { type: 'moveHero', fromSlot: 1, toSlot: 0 })).not.toBeNull();
      if (taught) {
        const warden = G.players['0'].hand[0];
        expect(placeHeroBlocked(G, '0', warden.iid, false, 1)).toBeNull();
        moves(c).placeHero(warden.iid, false, 1);                       // benched: it costs nothing
        expect(state(c).G.players['0'].souls).toBe(LANE_INCOME);
        expect(state(c).G.players['0'].bench[0]!.cardId).toBe('hero_warden');
        // The Retreat costs the leaving hero's printed price: Haze's is one soul.
        expect(heroRetreat(haze)).toBe(1);
        expect(retreatCost(state(c).G, '0')).toBe(1);
        moves(c).moveHero(1, 0);                                        // retreat: Warden in, for a soul of the turn's income
        expect(state(c).G.players['0'].active!.cardId).toBe('hero_warden');
        expect(state(c).G.players['0'].souls).toBe(LANE_INCOME - heroRetreat(haze));
        expect(attackBlocked(state(c).G, '0')).toBeNull();              // the hero who steps in still attacks
      }
      moves(c).attack();
      expect(winner(c), taught ? 'Warden' : 'Haze').toBe(taught ? '0' : undefined);
    }
  });

  it('Lesson 6: Warden is one exp short of Level 3; a first item is that exp, Level 3 is the ultimate, and Last Stand is the kill of a Lash on 6 — the swing is not', () => {
    for (const taught of [false, true]) {
      const c = lesson('levelup');
      expect(turn(c)).toEqual([11, ['extra_health']]);
      const [warden, lash] = actives(c);
      // Opened at Level 2 with a level's growth (+1 Bullet Power, +1 HP), one exp short of the next.
      expect([warden.level, warden.exp, LEVEL_THRESHOLDS[1] - EXP_ON_EQUIP]).toEqual([2, 4, 4]);
      expect([effectiveAtk(warden), warden.hp, warden.hpMax]).toEqual([3, 3, 8]);
      expect(lash.hp).toBe(6);
      expect(skillBlocked(state(c).G, '0', warden, lash.iid, 'eff_ult_warden')).toBe('locked');
      if (taught) {
        moves(c).playCard(state(c).G.players['0'].hand[0].iid, warden.iid);
        const up = state(c).G.players['0'].active!;
        expect([up.level, up.exp]).toEqual([ULT_UNLOCK_LEVEL, 0]);
        expect(effectiveAtk(up)).toBe(4);                               // still short of Lash's 6
        // Off its opening wait on this turn, and it costs no souls.
        expect(skillBlocked(state(c).G, '0', up, lash.iid, 'eff_ult_warden')).toBeNull();
        expect(kitCost(up, 'eff_ult_warden')).toBe(0);
        const hurt = up.hp;
        moves(c).useSkill(up.iid, lash.iid, 'eff_ult_warden');
        expect(state(c).G.players['0'].active!.hp).toBeGreaterThan(hurt); // Warden heals what it dealt
      } else {
        moves(c).attack();
      }
      expect(winner(c), taught ? 'the ultimate' : 'the swing').toBe(taught ? '0' : undefined);
    }
  });

  it('Lesson 7: Warden is killed, is shuffled into the deck with its level and its item, is drawn the next turn, takes the empty lane at full HP, and its swing is the kill', () => {
    const c = lesson('fallen');
    expect(turn(c)).toEqual([3, []]);
    const [warden, lash] = actives(c);
    // Opened at Level 2 wearing Extended Magazine (its +1 on), alone, on 1 HP.
    expect([warden.level, warden.hp, warden.hpMax, effectiveAtk(warden)]).toEqual([2, 1, 8, 4]);
    expect(wornItems(warden).map((it) => it.cardId)).toEqual(['extended_magazine']);
    expect(state(c).G.players['0'].bench.filter(Boolean)).toEqual([]);
    expect([lash.hp, attackPower(lash, warden).total]).toEqual([8, 3]);
    moves(c).attack();
    expect(state(c).G.players['1'].active!.hp).toBe(4);
    expect(winner(c), 'one attack').toBeUndefined();
    moves(c).endTurn();
    moves(c).attack();                                                  // Lash's turn: the kill
    let me = state(c).G.players['0'];
    expect(me.active).toBeNull();
    expect(me.deck.map((x) => x.cardId)).toEqual(['hero_warden']);      // the one card of the deck
    moves(c).endTurn();
    // Lash's pushes (the kill's, then the empty lane's) cost the Guardian and no more than part of the Walker.
    me = state(c).G.players['0'];
    expect(structureOf(me, 'guardian').hp).toBe(0);
    expect(structureOf(me, 'patron').hp).toBe(8);
    expect(state(c).ctx.gameover).toBeUndefined();
    // Drawn again: the level, the exp and the item kept, at full HP.
    expect(me.hand.map((x) => x.cardId)).toEqual(['hero_warden']);
    const back = me.hand[0];
    expect([back.iid, back.level, back.hp, back.hpMax]).toEqual([warden.iid, 2, 8, 8]);
    expect(wornItems(back).map((it) => it.cardId)).toEqual(['extended_magazine']);
    expect(placeHeroBlocked(state(c).G, '0', back.iid, true)).toBeNull();
    const souls = me.souls;
    moves(c).placeHero(back.iid, true);                                 // into the empty lane: it costs nothing
    expect(state(c).G.players['0'].souls).toBe(souls);
    expect(effectiveAtk(state(c).G.players['0'].active!)).toBe(4);
    expect(attackBlocked(state(c).G, '0')).toBeNull();
    moves(c).attack();
    expect(winner(c), 'the returned hero').toBe('0');
  });
});
