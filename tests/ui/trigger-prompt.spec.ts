/**
 * What the board says about the trigger prompt and the charged ultimates: the
 * prompt names the moment, the card and its price ("Use Shocking Reanimation
 * for 19 souls?"); the hero sheet shows a charged ultimate's live price ("20 →
 * 7 souls") with its rule on a line of its own, and an optional trigger's
 * plate says when it is asked; Silver's tile wears the wolf while her form
 * lasts. Every figure is the engine's.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { perform } from '@/engine/engine';
import { promptOwed } from '@/engine/query';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { addStatus } from '@/engine/statusOps';
import { TRIGGER_SHEET, TriggerPrompt, momentLine, offerLine } from '@/ui/overlays/TriggerPrompt';
import { HeroDetailSheet } from '@/ui/overlays/HeroDetailSheet';
import { HeroSlot } from '@/ui/board/HeroSlot';
import { skillBlockReason } from '@/ui/board/heroActions';
import { freshReadyGame } from '../engine/_helpers';

/** P1's Victor (Level 2, 1 HP) felled by P0's Haze: the prompt is owed. */
function felled(): { G: GameState; victor: CardInstance } {
  const G = freshReadyGame();
  const victor = makeInstance(allocatorOf(G), 'hero_victor', '1', 'active', 0);
  victor.level = 2;
  victor.hp = 1;
  G.players['1'].active = victor;
  G.players['1'].souls = 20;
  perform(G, '0', { type: 'attack' });
  return { G, victor };
}

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('the trigger prompt names the moment, the card and the price', () => {
  it('"Victor falls", then "Use Shocking Reanimation for 19 souls?" — its card prints 20, Haze\'s hit took one off', () => {
    const { G, victor } = felled();
    const prompt = promptOwed(G)!;
    expect(momentLine(G, prompt)).toBe('Victor falls');
    expect(offerLine(G, prompt.offers[0])).toEqual({
      cardId: 'ult_victor', name: 'Shocking Reanimation', price: 19, printed: 20,
      question: 'Use Shocking Reanimation for 19 souls?',
    });
    const out = html(createElement(TriggerPrompt, { G, me: '1' as PlayerID, prompt, onUse: () => {}, onPass: () => {} }));
    expect(out).toContain(`aria-label="${TRIGGER_SHEET}"`);
    expect(out).toContain('Victor falls');
    expect(out).toContain('Use Shocking Reanimation for 19 souls?');
    // The price tag: the printed 20 struck through, then the soul wisp and 19;
    // then your purse beside its wisp.
    const words = out.replace(/<[^>]+>/g, '');
    expect(out).toContain('<s');
    expect(words).toContain('20→19');
    expect(words).toContain('you have 20');
    expect(out).toContain('Pass');
    expect(out).toContain('Costs 1 less for each damage Victor takes.');
    expect(victor.hp).toBe(0);
  });
});

describe('the hero sheet: a charged ultimate\'s live price, its rule, and when a trigger is asked', () => {
  it('Silver\'s Lycan Curse reads "16 → 7 souls" after 9 damage dealt, its rule under the effect', () => {
    const G = freshReadyGame();
    const silver = makeInstance(allocatorOf(G), 'hero_silver', '0', 'active', 0);
    silver.level = 2;
    silver.tally = { eff_ult_silver: 9 };
    const out = html(createElement(HeroDetailSheet, { card: silver, isMine: true, onClose: () => {} }));
    expect(out).toContain('16 → 7 souls');
    expect(out).toContain('Ultimate · charged');
    expect(out).toContain('Costs 1 less for each damage Silver deals.');
  });

  it('Victor\'s plate says it is asked when he falls', () => {
    const G = freshReadyGame();
    const victor = makeInstance(allocatorOf(G), 'hero_victor', '0', 'active', 0);
    expect(skillBlockReason('trigger', victor, 'eff_ult_victor')).toBe('Asked when Victor falls');
  });
});

describe('Silver\'s tile wears the wolf while the form lasts', () => {
  it('the wolf art and a "Wolf form" badge, then her own art again', () => {
    const G = freshReadyGame();
    const silver = makeInstance(allocatorOf(G), 'hero_silver', '0', 'active', 0);
    const tile = () => html(createElement(HeroSlot, {
      card: silver, owner: '0', myId: '0', pending: null, isTargetable: false, onTap: () => {},
    }));
    expect(tile()).toContain('hero_silver_card.webp');
    expect(tile()).not.toContain('Wolf form');
    addStatus(G, silver, 'wolf_form', 1, 2);
    const wolf = tile();
    expect(wolf).toContain('hero_silver_wolf_card.webp');
    expect(wolf).not.toContain('hero_silver_card.webp');
    expect(wolf).toContain('Wolf form');
    silver.statuses = [];
    expect(tile()).toContain('hero_silver_card.webp');
  });
});
