import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ITEMS, itemCard } from '@/cards';
import { ACTIVE_COOLDOWN, DECK_SIZE, HARD_CC_CHARGES, LANE_INCOME, MAX_COPIES } from '@/engine/constants';
import { buildsFrom, buildsInto, effectText, statLines, useFacts } from '@/ui/shop/itemFacts';
import { nextTip, type TipRequest } from '@/ui/shop/tips';
import { turnIncome } from '@/ui/board/IncomeTick';
import { DECK_EDITOR, DeckEditor, addLabel } from '@/ui/collection/DeckEditor';
import { freshReadyGame } from '../engine/_helpers';

// The deck builder (the shop's replacement before the match) prints no item
// text: what an item is lives in its tooltip, read off the item's data
// (itemFacts), and the income beat reads the engine's own income line. These
// pin those reads to the data and the engine.

describe('the tooltip reads the item as Deadlock lays it out', () => {
  it('a stat stick is its stat lines and nothing more', () => {
    expect(statLines('extended_magazine')).toEqual([{ value: '+1', label: 'Bullet Power' }]);
    expect(effectText('extended_magazine')).toBe('');
    expect(statLines('extra_health')).toEqual([{ value: '+2', label: 'HP' }]);
  });

  it('an effect keeps its words, with its scaling marks for RuleText', () => {
    expect(statLines('cold_front')).toEqual([]);
    expect(effectText('cold_front')).toBe(itemCard('cold_front')!.text);
    expect(effectText('cold_front')).toContain('{sp:2}');
  });

  it('every item with a stat bonus prints a line for each stat, and no stat sentence twice', () => {
    for (const item of ITEMS) {
      const lines = statLines(item.id);
      if (item.type === 'equipment' && item.bonus) {
        const stats = Object.values(item.bonus).filter((v) => v);
        expect(lines.length, item.id).toBe(stats.length);
      }
      for (const l of lines) expect(effectText(item.id), item.id).not.toContain(`${l.value} ${l.label}.`);
    }
  });

  it('an active says its cooldown — by tier, or its own (the draw cards\' 2) — hard crowd control its charges', () => {
    expect(useFacts('extended_magazine')).toEqual({ kind: 'passive' });
    expect(useFacts('cold_front')).toEqual({ kind: 'active', cooldown: ACTIVE_COOLDOWN.low });
    expect(useFacts('knockdown')).toEqual({ kind: 'active', charges: HARD_CC_CHARGES });
    const t3 = ITEMS.find((i) => i.type === 'spell' && i.tier >= 3 && !i.hardCC && i.cooldown === undefined)!;
    expect(useFacts(t3.id)).toEqual({ kind: 'active', cooldown: ACTIVE_COOLDOWN.high });
    for (const id of ['improved_cooldown', 'superior_cooldown', 'transcendent_cooldown']) {
      expect(useFacts(id), id).toEqual({ kind: 'active', cooldown: 2 });
    }
  });

  it('builds from and into follow the upgrade chains both ways', () => {
    expect(buildsFrom('titanic_magazine')).toBe('extended_magazine');
    expect(buildsInto('extended_magazine')).toContain('titanic_magazine');
    for (const item of ITEMS) if (item.upgradesFrom) expect(buildsInto(item.upgradesFrom)).toContain(item.id);
  });
});

describe('a hover never takes the place of a held tooltip', () => {
  const at = { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 } as DOMRect;
  const held: TipRequest = { itemId: 'grit', anchor: at, source: 'catalogue' };
  const hover: TipRequest = { itemId: 'extra_health', anchor: at, source: 'catalogue', passive: true };
  it('holds over hovers, and a hover ending only ends a hover', () => {
    expect(nextTip(null, hover)).toBe(hover);
    expect(nextTip(hover, held)).toBe(held);
    expect(nextTip(held, hover)).toBe(held);
    expect(nextTip(held, null)).toBe(held);
    expect(nextTip(hover, null)).toBe(null);
  });
});

describe('the income beat reads the engine\'s income line', () => {
  it('the lane, the second mover\'s bonus and the card drawn, this turn only', () => {
    const G = freshReadyGame();
    G.log.push({ turn: G.turnNumber, text: `P0 +${LANE_INCOME} Souls (income).` });
    G.log.push({ turn: G.turnNumber, text: 'P0 drew 1 card.' });
    expect(turnIncome(G, '0')).toEqual({ total: LANE_INCOME, seat: 0, drew: 1 });
    expect(turnIncome(G, '1')).toBeNull();
    G.log.push({ turn: G.turnNumber + 1, text: `P1 +${LANE_INCOME + 1} Souls (income, +1 second mover).` });
    G.turnNumber += 1;
    expect(turnIncome(G, '1')).toEqual({ total: LANE_INCOME + 1, seat: 1, drew: 0 });
    expect(turnIncome(G, '0')).toBeNull();
  });
});

describe('the deck builder prints no item text', () => {
  it('names live in the tiles\' accessible names, never in the printed sheet', () => {
    // No storage in the test run: the builder opens on an empty deck.
    const html = renderToStaticMarkup(createElement(DeckEditor, { squad: ['hero_haze'] }));
    const printed = html.replace(/<[^>]*>/g, ' ');
    for (const item of ITEMS.filter((i) => i.slot === 'weapon')) expect(printed, item.name).not.toContain(item.name);
    expect(html).toContain(`aria-label="${DECK_EDITOR}"`);
    expect(html).toContain('aria-label="Add Extended Magazine to the deck"');
    expect(html).toContain(`0/${DECK_SIZE}`);
  });

  it('a tile\'s name says what a tap does: add a copy, or why it cannot', () => {
    expect(addLabel('grit', 0, 0)).toBe('Add Grit to the deck');
    expect(addLabel('grit', 2, 5)).toBe('Add Grit to the deck (2 in it)');
    expect(addLabel('grit', MAX_COPIES, 5)).toContain(`${MAX_COPIES} in the deck`);
    expect(addLabel('grit', 1, DECK_SIZE)).toBe('Grit: the deck is full');
  });
});
