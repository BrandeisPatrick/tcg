/**
 * What the board says about the trigger prompt and the charged ultimates: the
 * prompt names the moment and the card, and asks ("Use Shocking
 * Reanimation?") — an ultimate costs no souls, so under the card stands its
 * charge ("Charged: 10 of 10 damage") and that it is the turn's one ultimate;
 * the hero sheet shows a charged ultimate's live count ("5 / 8") with its rule
 * on a line of its own, and an optional trigger's plate says when it is
 * asked; Silver's tile wears the wolf while her form lasts. Every figure is
 * the engine's.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CardInstance, GameState, HeroCard, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { perform } from '@/engine/engine';
import { promptOwed } from '@/engine/query';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { addStatus } from '@/engine/statusOps';
import { TRIGGER_SHEET, TriggerPrompt, momentLine, offerLine } from '@/ui/overlays/TriggerPrompt';
import { HeroDetailSheet, HeroRules } from '@/ui/overlays/HeroDetailSheet';
import { HeroSlot } from '@/ui/board/HeroSlot';
import { skillBlockReason } from '@/ui/board/heroActions';
import { freshReadyGame } from '../engine/_helpers';

/** P1's Victor (Level 2, 1 HP, 9 damage taken since his last rising) felled
 *  by P0's Haze, whose hit is the tenth damage: the prompt is owed. He holds
 *  no souls — the ultimate takes none. */
function felled(): { G: GameState; victor: CardInstance } {
  const G = freshReadyGame();
  const victor = makeInstance(allocatorOf(G), 'hero_victor', '1', 'active', 0);
  victor.level = 2;
  victor.hp = 1;
  victor.tally = { eff_ult_victor: 9 };
  G.players['1'].active = victor;
  G.players['1'].souls = 0;
  perform(G, '0', { type: 'attack' });
  return { G, victor };
}

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('the trigger prompt names the moment, the card and what it takes', () => {
  it('"Victor falls", then "Use Shocking Reanimation?" — no souls: it is charged, 10 of the 10 damage it needs, Haze\'s hit the tenth', () => {
    const { G, victor } = felled();
    const prompt = promptOwed(G)!;
    expect(momentLine(G, prompt)).toBe('Victor falls');
    expect(offerLine(G, prompt.offers[0])).toEqual({
      cardId: 'ult_victor', name: 'Shocking Reanimation', price: 0, charge: { have: 10, need: 10 },
      question: 'Use Shocking Reanimation?',
    });
    const out = html(createElement(TriggerPrompt, { G, me: '1' as PlayerID, prompt, onUse: () => {}, onPass: () => {} }));
    expect(out).toContain(`aria-label="${TRIGGER_SHEET}"`);
    expect(out).toContain('Victor falls');
    expect(out).toContain('Use Shocking Reanimation?');
    // Under the card: its charge, that it takes no souls, and that it is the
    // side's one ultimate of the turn. No price, no purse.
    const words = out.replace(/<[^>]+>/g, '');
    expect(words).toContain('Charged: 10 of 10 damage. No souls. One ultimate a turn.');
    expect(words).not.toContain('you have');
    expect(out).not.toMatch(/<s[ >]/); // nothing struck through
    expect(out).toContain('Pass');
    expect(out).toContain('Ready once Victor has taken 10 damage.');
    expect(victor.hp).toBe(0);
  });

  it('short of its damage there is no prompt: Victor falls, 9 of 10', () => {
    const G = freshReadyGame();
    const victor = makeInstance(allocatorOf(G), 'hero_victor', '1', 'active', 0);
    victor.level = 2;
    victor.hp = 1;
    victor.tally = { eff_ult_victor: 7 }; // and Haze's blow at a hurt hero, 1 + Fixation's 1: 9
    G.players['1'].active = victor;
    perform(G, '0', { type: 'attack' });
    expect(victor.hp).toBe(0);
    expect(promptOwed(G)).toBeFalsy();
  });
});

describe('the hero sheet: a charged ultimate\'s live count, its rule, and when a trigger is asked', () => {
  it('Silver\'s Lycan Curse reads "5 / 8" after 5 damage dealt, and never past what it needs; its rule under the effect', () => {
    const G = freshReadyGame();
    const silver = makeInstance(allocatorOf(G), 'hero_silver', '0', 'active', 0);
    silver.level = 2;
    silver.tally = { eff_ult_silver: 5 };
    const out = html(createElement(HeroDetailSheet, { card: silver, isMine: true, onClose: () => {} }));
    expect(out).toContain('5 / 8');
    expect(out).not.toContain('souls');
    expect(out).toContain('Ultimate · charged');
    expect(skillBlockReason('charge', silver, 'eff_ult_silver')).toBe('Needs 3 more damage');
    silver.tally = { eff_ult_silver: 11 };
    expect(html(createElement(HeroDetailSheet, { card: silver, isMine: true, onClose: () => {} }))).toContain('8 / 8');
    // The sheet keeps one line per action; the charged rule is read whole
    // behind the "i" (HeroRules, the details view's Abilities).
    const rules = html(createElement(HeroRules, { card: silver, data: CARDS_BY_ID.hero_silver as HeroCard }));
    expect(rules).toContain('Ready once Silver has dealt 8 damage.');
    expect(rules).toContain('one a turn');
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
