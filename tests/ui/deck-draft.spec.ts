// The deck draft's screen (ui/overlays/DeckDraftOverlay.tsx, 2026-11-17): the
// decks offered for the drafted heroes, each with why, the heroes it was made
// for and its items counted; the first one picked to start with.
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

  it('shows every offer, why it is offered, and its items counted', () => {
    expect(html).toContain('Draft your deck');
    for (const o of offers) {
      expect(html).toContain(`data-deck-offer="${o.id}"`);
      expect(html).toContain(o.why.replace(/'/g, '&#x27;').replace(/’/g, '’'));
    }
    expect(html).toContain('Made for Haze, Mirage and Kelvin');
    expect(html).toContain("3× </span>Bullet Resist Shredder"); // Crossfire's three, counted
  });

  it('starts on the best fit, marked so, with the button to play it', () => {
    expect(html).toContain('Best fit');
    expect(html).toContain(`Play ${offers[0].name}`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});
