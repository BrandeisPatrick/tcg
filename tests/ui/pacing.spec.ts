/**
 * The table's pacing (Patrick, 2026-11-15): every move plays in two phases —
 * its activation, then its effect resolving on the board — and none of them
 * takes as long as the old reveals did.
 *
 *  - A card from the hand (a spell or equipment, either side) is shown
 *    mid-screen; the board resolves nothing until it has been.
 *  - A skill has no screen-fill: its hero's own tile flares.
 *  - An ultimate's name plate is lifting as its strike begins.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FxEvent, GameAction, GameState } from '@/engine/types';
import { buildFxTimeline } from '@/ui/effects/fx/fxTimeline';
import { FX_TIMING as T } from '@/ui/effects/fx/fxCatalog';
import { CardPlayFlash, CARD_REVEAL_MS } from '@/ui/effects/CardPlayFlash';
import { ULT_PLATE_MS } from '@/ui/effects/UltMomentFlash';
import { AI_THINK_MS, actionHoldMs } from '@/ui/board/pacing';
import { freshReadyGame, giveCard } from '../engine/_helpers';
import { INVALID, perform } from '@/engine/engine';

let seq = 0;
const ev = <E extends Omit<FxEvent, 'seq'>>(e: E): E & { seq: number } => ({ ...e, seq: ++seq });
const castAndHit = (castKind: 'spell' | 'equip' | 'skill' | 'ult') => buildFxTimeline([
  ev({ kind: 'cast', castKind, by: '1', cardId: castKind === 'skill' ? 'hero_lash' : 'cold_front', iid: 'caster', targetIid: 't' }),
  ev({ kind: 'hit', iid: 't', amount: 2, type: 'spirit', ko: false, cast: castKind === 'equip' ? 'spell' : castKind }),
] as FxEvent[]);

describe('activation, then resolve', () => {
  it('a card from the hand: nothing of its effect starts before the card has been shown', () => {
    for (const kind of ['spell', 'equip'] as const) {
      const tl = castAndHit(kind);
      expect(tl.items[0].at, kind).toBe(T.cardLead);                  // the cast on the board
      expect(tl.items[1].at, kind).toBe(T.cardLead + T.castLead);     // the hit
      expect(tl.impactDelay.t, kind).toBe(T.cardLead + T.castLead);   // the HP number holds until then
    }
  });

  it('a skill is activated on its hero\'s own tile: the flare starts at once, the hit lands after the bolt', () => {
    const tl = castAndHit('skill');
    expect(tl.items[0].at).toBe(0);
    expect(tl.items[1].at).toBe(T.castLead);
  });

  it('an ultimate: the strike begins as the name plate lifts', () => {
    const tl = castAndHit('ult');
    expect(tl.items[0].at).toBe(T.ultLead);
    expect(tl.items[1].at).toBe(T.ultLead + T.castLead);
    expect(ULT_PLATE_MS).toBeGreaterThanOrEqual(T.ultLead);
    expect(ULT_PLATE_MS - T.ultLead).toBeLessThanOrEqual(300);       // only its fade overlaps the strike's wind-up
    expect(T.ultLead + T.castLead).toBeGreaterThan(ULT_PLATE_MS);    // and the hit lands on a board in plain view
  });

  it('the card reveal is the hand card\'s lead: up for it, fading as the effect begins', () => {
    expect(CARD_REVEAL_MS).toBeGreaterThanOrEqual(T.cardLead);
    expect(CARD_REVEAL_MS - T.cardLead).toBeLessThanOrEqual(200);
    expect(T.cardLead + T.castLead).toBeGreaterThan(CARD_REVEAL_MS); // the hit never lands under the card
  });
});

describe('the reveal overlay', () => {
  const withAction = (action: GameAction): GameState => ({ ...freshReadyGame(), action });
  const html = (action: GameAction) => renderToStaticMarkup(createElement(CardPlayFlash, { G: withAction(action) }));

  it('shows a card played from the hand, yours or the rival\'s, named for who played it', () => {
    const mine = html({ id: 'a1', kind: 'item', by: '0', cardId: 'cold_front', state: 'begin' });
    expect(mine).toContain('data-card-reveal');
    expect(mine).toContain('You played');
    const theirs = html({ id: 'a2', kind: 'item', by: '1', cardId: 'counterspell', state: 'begin' });
    expect(theirs).toContain('data-card-reveal');
    expect(theirs).toContain('Rival played');
  });

  it('shows nothing for a skill or an ultimate (the tile and the plate are theirs), nor once the action is done', () => {
    expect(html({ id: 'a3', kind: 'skill', by: '1', cardId: 'hero_seven', state: 'begin', abilityId: 'skill_seven' })).toBe('');
    expect(html({ id: 'a4', kind: 'ult', by: '1', cardId: 'ult_seven', state: 'begin' })).toBe('');
    expect(html({ id: 'a5', kind: 'item', by: '1', cardId: 'cold_front', state: 'done' })).toBe('');
  });
});

describe('every play from the hand opens the reveal', () => {
  it('a spell does, and so does a piece of equipment', () => {
    const G = freshReadyGame();
    G.players['0'].souls = 20;
    const spirit = giveCard(G, '0', 'extra_spirit');
    expect(perform(G, '0', { type: 'playCard', cardIid: spirit.iid, heroIid: G.players['0'].active!.iid })).not.toBe(INVALID);
    expect(G.action).toMatchObject({ kind: 'item', by: '0', cardId: 'extra_spirit', state: 'begin' });
    const first = G.action!.id;
    const cold = giveCard(G, '0', 'cold_front');
    expect(perform(G, '0', { type: 'playCard', cardIid: cold.iid, heroIid: G.players['1'].active!.iid })).not.toBe(INVALID);
    expect(G.action).toMatchObject({ kind: 'item', by: '0', cardId: 'cold_front', state: 'begin' });
    expect(G.action!.id).not.toBe(first);
  });
});

describe('how long a move holds the table', () => {
  it('your own card holds for its reveal; the rival\'s for a beat of its resolve too', () => {
    expect(actionHoldMs('item', true)).toBe(CARD_REVEAL_MS);
    expect(actionHoldMs('item', false)).toBeGreaterThan(CARD_REVEAL_MS);
  });

  it('a skill is the quickest: no overlay, only its flare — the rival\'s until its bolt has landed', () => {
    expect(actionHoldMs('skill', true)).toBeLessThan(actionHoldMs('item', true));
    expect(actionHoldMs('skill', false)).toBeGreaterThanOrEqual(T.castLead);
    expect(actionHoldMs('skill', false)).toBeLessThan(actionHoldMs('item', false));
  });

  it('everything is quicker than it was: 1350 ms a card or skill, 2400 an ultimate, 800 between the rival\'s moves', () => {
    for (const mine of [true, false]) {
      expect(actionHoldMs('item', mine)).toBeLessThan(1350);
      expect(actionHoldMs('skill', mine)).toBeLessThan(1350 / 2);
      expect(actionHoldMs('ult', mine)).toBeLessThan(2400 * 0.75);
    }
    expect(AI_THINK_MS).toBeLessThanOrEqual(500);
    // A rival's skill and the pause after it: about half of the old 2150 ms.
    expect(actionHoldMs('skill', false) + AI_THINK_MS).toBeLessThan((1350 + 800) * 0.55);
    expect(actionHoldMs('item', false) + AI_THINK_MS).toBeLessThan(1350 + 800);
  });
});
