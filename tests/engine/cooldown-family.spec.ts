/**
 * The Cooldown family (canon Compress → Superior → Transcendent Cooldown) is
 * the deck's draw engine now (docs/deck-plan.md): three active items, worn
 * and cast like any item spell (the bearer's one ability of the turn, free to
 * cast), each a draw and then a discard from anywhere in the hand — 2 and 1, 4
 * and 2, 8 and 4 — and each waits 2 own turns after use at every tier. They no
 * longer cut cooldowns: worn, they leave the bearer's ultimate, its skills and
 * its other items on their own timers. Each step doubles the price and the
 * cards kept, and each is built from the one before (an evolve costs the
 * difference). (The draw and the discard in detail: hand.spec.)
 *
 * Board (freshReadyGame): P0's Active is made a Level 2 Viscous — The Cube is
 * a skill on a 2-turn cooldown, and her ultimate is unlocked.
 */
import { describe, it, expect } from 'vitest';
import { itemCard } from '@/cards';
import { upgradesOf } from '@/cards/decks';
import { getAbility } from '@/abilities';
import { INVALID, perform } from '@/engine/engine';
import { activeCooldown, cooldownCut, itemCooldown, itemPrice } from '@/engine/query';
import { PRICE, ULT_COOLDOWN } from '@/engine/constants';
import { freshReadyGame, giveItem, makeHero, stackDeck, useItem } from './_helpers';

/** P0's Active made a Level 2 Viscous wearing `gear`. */
function viscous(...gear: string[]) {
  const G = freshReadyGame();
  const hero = G.players['0'].active = makeHero('hero_viscous', '0', 'active', 0);
  hero.level = 2;
  for (const id of gear) giveItem(G, hero, id);
  return { G, hero };
}

/** improved_cooldown keeps its old id; the item is Compress Cooldown. */
const COMPRESS = 'improved_cooldown';
const SUPERIOR = 'superior_cooldown';
const TRANSCENDENT = 'transcendent_cooldown';
const FAMILY = [[COMPRESS, 2, 2, 1], [SUPERIOR, 3, 4, 2], [TRANSCENDENT, 4, 8, 4]] as const;

describe('The Cooldown family is the draw engine', () => {
  it('three Spirit actives, tiers 2, 3 and 4, each built from the one before, each waiting 2 turns', () => {
    for (const [id, tier, draw, discard] of FAMILY) {
      const card = itemCard(id)!;
      expect(card, id).toMatchObject({ type: 'spell', slot: 'spirit', tier, cooldown: 2 });
      expect(getAbility(card.type === 'spell' ? card.abilities[0] : '')?.draw, id).toEqual({ cards: draw, discard });
      expect(card.text, id).toContain(`Draw ${draw} cards, then discard ${discard}`);
    }
    expect(itemCard(SUPERIOR)!.upgradesFrom).toBe(COMPRESS);
    expect(itemCard(TRANSCENDENT)!.upgradesFrom).toBe(SUPERIOR);
    expect(upgradesOf(COMPRESS)).toEqual([SUPERIOR]);
  });

  it('each step doubles the price and the cards kept: a soul buys the same at every tier', () => {
    const kept = FAMILY.map(([, , draw, discard]) => draw - discard);
    const price = FAMILY.map(([id]) => itemPrice(id));
    expect(price).toEqual([PRICE[2], PRICE[3], PRICE[4]]);
    expect(kept).toEqual([1, 2, 4]);
    for (let i = 0; i < 3; i++) expect(price[i] / kept[i]).toBe(PRICE[2]);
  });

  it('cast from the bearer\'s sheet: free, the bearer\'s ability for the turn, then 2 own turns of cooldown', () => {
    for (const [id, , draw, discard] of FAMILY) {
      const { G, hero } = viscous();
      stackDeck(G, '0', Array.from({ length: 8 }, () => 'grit'));
      G.players['0'].souls = 0;
      const item = useItem(G, '0', id, undefined, hero);
      expect(hero.skillUsedThisTurn, id).toBe(true);
      expect(itemCooldown(item), id).toBe(2);
      expect(G.players['0'].souls, id).toBe(0);
      expect(G.players['0'].hand, id).toHaveLength(draw);
      expect(G.pendingDiscard, id).toMatchObject({ pid: '0', count: discard, cardId: id });
    }
  });

  it('no longer cuts a cooldown: worn, they leave the ultimate, the skills and the other items on their own timers', () => {
    for (const gear of [[], [COMPRESS], [SUPERIOR], [TRANSCENDENT], [TRANSCENDENT, COMPRESS, SUPERIOR]]) {
      const { G, hero } = viscous(...gear);
      expect([cooldownCut(hero, 'ult'), cooldownCut(hero, 'item')], gear.join() || 'none').toEqual([0, 0]);
      expect(([1, 2, 3, 4] as const).map((tier) => activeCooldown(hero, tier)), gear.join()).toEqual([2, 2, 3, 3]);
      expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, skillId: 'eff_ult_viscous' }), gear.join()).not.toBe(INVALID);
      expect(hero.cooldowns?.eff_ult_viscous, gear.join() || 'none').toBe(ULT_COOLDOWN);
    }
    const { G, hero } = viscous(SUPERIOR);
    const decay = useItem(G, '0', 'decay', G.players['1'].active!.iid, hero); // tier 3
    expect(itemCooldown(decay)).toBe(3);
  });

  it('a card\'s own cooldown is never taken under 1', () => {
    const { hero } = viscous();
    expect(activeCooldown(hero, 3, 2)).toBe(2);
    expect(activeCooldown(hero, 4, 0)).toBe(1);
  });

  it("leaves a skill's cooldown alone: The Cube still waits 2", () => {
    const { G, hero } = viscous(TRANSCENDENT);
    expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, targetIid: hero.iid })).not.toBe(INVALID);
    expect(hero.cooldowns?.skill_viscous).toBe(2);
  });
});
