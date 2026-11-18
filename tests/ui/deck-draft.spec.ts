// The deck draft's screen (ui/overlays/DeckDraftOverlay.tsx, 2026-11-17): a
// card for each deck offered for the drafted heroes, named with why it is
// offered; the first one picked to start with, and the picked deck's sheet
// under the cards: why, its line and its items counted.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeckDraftOverlay } from '@/ui/overlays/DeckDraftOverlay';
import { deckOffers } from '@/cards/deckOffers';
import { defaultBuild } from '@/cards/builds';
import type { CardId } from '@/engine/types';

// No window to measure on the server: a desktop's.
vi.mock('@/ui/hooks/useViewport', () => ({ useViewport: () => ({ width: 1280, height: 800, isMobile: false }) }));
vi.mock('@/ui/effects/fx/FxMotionContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ui/effects/fx/FxMotionContext')>()),
  useCalmMotion: () => false,
}));

describe('the deck draft screen', () => {
  const heroes: CardId[] = ['hero_haze', 'hero_mirage', 'hero_kelvin'];
  const offers = deckOffers(heroes, heroes.map(defaultBuild));
  const html = renderToStaticMarkup(createElement(DeckDraftOverlay, { heroes, offers, onPick: () => {} }));

  it('shows a card for every offer, named with why it is offered', () => {
    expect(html).toContain('Draft your deck');
    for (const o of offers) {
      expect(html).toContain(`data-deck-offer="${o.id}"`);
      expect(html).toContain(`aria-label="${o.name}: ${o.why}"`);
    }
  });

  it('opens the picked deck: why, its line and its items counted', () => {
    const picked = offers[0];
    expect(html).toContain(`>${picked.why}</span>`);
    expect(html).toContain('Made for Haze, Mirage and Kelvin');
    expect(html).toContain(picked.blurb.replace(/'/g, '&#x27;'));
    expect(html).toMatch(/Bullet Resist Shredder<\/span><span[^>]*>×2</); // Crossfire's two, counted
    expect(html).toContain('aria-label="4 Weapon · 8 Spirit · 4 Vitality"');
    // The other decks' items wait for their card to be picked.
    expect(html).not.toContain(offers[1].blurb.replace(/'/g, '&#x27;'));
  });

  it('prints both crews along the top, as the hero draft left them', () => {
    const rival: CardId[] = ['hero_abrams', 'hero_dynamo', 'hero_paige'];
    const both = renderToStaticMarkup(createElement(DeckDraftOverlay, { heroes, rivalHeroes: rival, offers, onPick: () => {} }));
    for (const h of [...heroes, ...rival]) expect(both).toContain(`${h}_card.webp`);
  });

  it('the third card is the player\'s own deck, and any deck can be customized (2026-11-18)', () => {
    const yours = offers[offers.length - 1];
    expect(yours.name).toBe('Your deck');
    expect(html).toContain(`aria-label="Your deck: ${yours.why}"`);
    // Its face is what it holds: its items' shop art, where a ready deck prints its heroes.
    expect(html).toContain(`items/${yours.items[0]}.webp`);
    // The picked deck's sheet opens the builder on a copy of it.
    expect(html).toContain(`aria-label="Customize ${offers[0].name}"`);
    // The builder is shut until then.
    expect(html).not.toContain('Customize your deck');
  });

  it('starts on the best fit, marked so, with the button to play it', () => {
    expect(html).toContain('Best fit');
    expect(html).toContain(`Play ${offers[0].name}`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});
