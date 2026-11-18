/**
 * The final level's portrait (Patrick, 2026-11-16): a hero that has reached
 * Level 4 wears Deadlock's own "gloat" card of it, on its board tile and its
 * sheet. Every hero has one; a unit never does; a form's art (Silver's wolf)
 * still comes first while it lasts.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HEROES } from '@/cards/heroes';
import { UNITS } from '@/cards/units';
import { heroPortraitFile } from '@/cards/art/heroArt';
import { addStatus } from '@/engine/statusOps';
import { MAX_LEVEL } from '@/engine/constants';
import { freshReadyGame, giveCard, makeHero } from '../engine/_helpers';

const file = (name: string) => resolve(__dirname, '../../public/heroes', name);

describe('the gloat portrait', () => {
  it('every hero has one, beside its card art', () => {
    for (const h of HEROES) expect(existsSync(file(`${h.id}_gloat.webp`)), h.id).toBe(true);
  });

  it('only at the final level: below it the card art', () => {
    const G = freshReadyGame();
    const hero = G.players['0'].active!;
    for (let level = 1; level < MAX_LEVEL; level++) {
      hero.level = level as 1 | 2 | 3;
      expect(heroPortraitFile(hero), `Level ${level}`).toBeUndefined();
    }
    hero.level = MAX_LEVEL;
    expect(heroPortraitFile(hero)).toBe(`${hero.cardId}_gloat.webp`);
  });

  it('a form comes first: Silver in her wolf form shows the wolf, at Level 4 too', () => {
    const G = freshReadyGame();
    // On the board: a card in the hand or the deck takes no status.
    const silver = makeHero('hero_silver', '0', 'bench', 1);
    G.players['0'].bench[0] = silver;
    silver.level = MAX_LEVEL;
    expect(heroPortraitFile(silver)).toBe('hero_silver_gloat.webp');
    addStatus(G, silver, 'wolf_form', 1, 2);
    expect(heroPortraitFile(silver)).toBe('hero_silver_wolf_card.webp');
  });

  it('a unit never wears one', () => {
    const G = freshReadyGame();
    for (const u of UNITS) {
      const unit = giveCard(G, '0', u.id);
      unit.level = MAX_LEVEL;
      expect(heroPortraitFile(unit), u.id).toBeUndefined();
    }
  });
});
