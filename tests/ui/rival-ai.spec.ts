/**
 * The Rival AI control on the draft (ui/overlays/DraftOverlay.tsx): Easy · Normal
 * · Hard as a radio group named "Rival AI", the match's strength the one
 * checked and the one Tab reaches. Choosing one sets this match's config,
 * which the board's AI loop reads as it chooses each move, and the save, which
 * the next Quick Match starts from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Client } from 'boardgame.io/client';
import type { GameState, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { AI_STRENGTHS, type AiStrength } from '@/ai/heuristic';
import { DraftOverlay, RivalAiControl, chooseRivalStrength } from '@/ui/overlays/DraftOverlay';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { getAiStrength, getBuild } from '@/storage/playerData';

const WORD: Record<AiStrength, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/** The control's radios in the markup, in order. */
function radios(html: string): { word: string; checked: boolean; tabbable: boolean }[] {
  return [...html.matchAll(/<button([^>]*role="radio"[^>]*)>([^<]*)<\/button>/g)].map(([, attrs, word]) => ({
    word,
    checked: /aria-checked="true"/.test(attrs),
    tabbable: /tabindex="0"/.test(attrs),
  }));
}

/** The text of the element the radio group is labelled by. */
function groupName(html: string): string | null {
  const id = html.match(/role="radiogroup" aria-labelledby="([^"]+)"/)?.[1];
  if (!id) return null;
  const at = html.indexOf(`id="${id}"`);
  return at < 0 ? null : html.slice(html.indexOf('>', at) + 1, html.indexOf('<', at));
}

/** A Quick Match on its first pick: the draft as the board hands it to the overlay. */
function draftProps() {
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  const { G, ctx } = client.getState()!;
  const g = G as GameState;
  client.stop();
  return { draft: g.draft!, market: g.market, currentPlayer: ctx.currentPlayer as PlayerID, me: '0' as PlayerID, onPick: () => {} };
}

describe('the Rival AI control', () => {
  it('is a radio group named Rival AI, the three strengths easiest first, the one it is given checked and the only one Tab reaches', () => {
    for (const value of AI_STRENGTHS) {
      for (const compact of [false, true]) {
        const html = renderToStaticMarkup(createElement(RivalAiControl, { value, onChange: () => {}, compact }));
        expect(groupName(html)).toBe('Rival AI');
        expect(radios(html), `${value}${compact ? ' (phone)' : ''}`).toEqual(
          AI_STRENGTHS.map((s) => ({ word: WORD[s], checked: s === value, tabbable: s === value })),
        );
      }
    }
  });
});

describe('the draft sets how hard the rival plays', () => {
  let saved: ReturnType<typeof getMatchConfig>;
  let store: Map<string, string>;
  beforeEach(() => {
    saved = getMatchConfig();
    // A Map-backed localStorage: the node test run has none.
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });
  afterEach(() => {
    setMatchConfig(saved);
    vi.unstubAllGlobals();
  });

  it('the draft shows the control at the match\'s strength, and at Normal when the match names none', () => {
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77, aiStrength: 'easy' });
    const props = draftProps();
    const checked = (html: string) => radios(html).filter((r) => r.checked).map((r) => r.word);
    expect(checked(renderToStaticMarkup(createElement(DraftOverlay, props)))).toEqual(['Easy']);
    setMatchConfig({ heroPreferences: [null, null, null, null], seed: 77 });
    expect(checked(renderToStaticMarkup(createElement(DraftOverlay, props)))).toEqual(['Normal']);
  });

  it('choosing a strength sets it on this match, keeps the rest of the setup, and saves it for the next', () => {
    setMatchConfig({ heroPreferences: ['hero_haze', null, null, null], seed: 77, builds: { hero_kelvin: ['grit'] }, featuredHero: 'hero_haze', aiStrength: 'normal' });
    store.set('deadlock-tcg-player', JSON.stringify({ version: 2, preferredHeroes: [null, null, null, null], builds: { hero_kelvin: ['grit'] }, lessonsDone: [], tutorialDone: false }));
    chooseRivalStrength('hard');
    expect(getMatchConfig()).toEqual({ heroPreferences: ['hero_haze', null, null, null], seed: 77, builds: { hero_kelvin: ['grit'] }, featuredHero: 'hero_haze', aiStrength: 'hard' });
    expect(getAiStrength()).toBe('hard');
    expect(getBuild('hero_kelvin')).toEqual(['grit']);
    chooseRivalStrength('easy');
    expect(getMatchConfig().aiStrength).toBe('easy');
    expect(getAiStrength()).toBe('easy');
  });
});
