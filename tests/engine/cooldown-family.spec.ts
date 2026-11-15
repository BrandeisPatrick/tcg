/**
 * The Cooldown family (canon Compress → Superior → Transcendent Cooldown) is
 * the deck's draw cards (docs/deck-plan.md): three spells, played from the
 * hand once like any spell, each a draw and then a discard from anywhere in
 * the hand — 2 and 1, 4 and 2, 8 and 4. They cut no cooldown: nothing in the
 * catalogue does. Each step doubles the price and the cards kept. Deadlock
 * builds each from the one before, but as actives none evolves another: each
 * costs its whole price. (The draw and the discard in detail: hand.spec.)
 *
 * Board (freshReadyGame): P0's Active is made a Level 2 Viscous — The Cube is
 * a skill that waits 4 turns, and his ultimate is unlocked.
 */
import { describe, it, expect } from 'vitest';
import { itemCard } from '@/cards';
import { evolvesFrom, upgradesOf } from '@/cards/decks';
import { ABILITIES_BY_ID, getAbility } from '@/abilities';
import { INVALID, perform } from '@/engine/engine';
import { cooldownCut, itemPrice, skillWait } from '@/engine/query';
import { playCost } from '@/engine/legality';
import { PRICE, SKILL_COOLDOWN, ULT_WAIT } from '@/engine/constants';
import { freshReadyGame, giveItem, makeHero, stackDeck, useItem } from './_helpers';

/** P0's Active made a Level 2 Viscous, with souls to pay for
 *  his skill or his ultimate. */
function viscous() {
  const G = freshReadyGame();
  G.players['0'].souls = 20;
  const hero = G.players['0'].active = makeHero('hero_viscous', '0', 'active', 0);
  hero.level = 2;
  return { G, hero };
}

/** improved_cooldown keeps its old id; the item is Compress Cooldown. */
const COMPRESS = 'improved_cooldown';
const SUPERIOR = 'superior_cooldown';
const TRANSCENDENT = 'transcendent_cooldown';
const FAMILY = [[COMPRESS, 2, 2, 1], [SUPERIOR, 3, 4, 2], [TRANSCENDENT, 4, 8, 4]] as const;

describe('The Cooldown family is the draw engine', () => {
  it('three Spirit spells, tiers 2, 3 and 4, Deadlock\'s line from one to the next; as actives none evolves another', () => {
    for (const [id, tier, draw, discard] of FAMILY) {
      const card = itemCard(id)!;
      expect(card, id).toMatchObject({ type: 'spell', slot: 'spirit', tier });
      expect(getAbility(card.type === 'spell' ? card.abilities[0] : '')?.draw, id).toEqual({ cards: draw, discard });
      expect(card.text, id).toContain(`Draw ${draw} cards, then discard ${discard}`);
    }
    expect(itemCard(SUPERIOR)!.upgradesFrom).toBe(COMPRESS);
    expect(itemCard(TRANSCENDENT)!.upgradesFrom).toBe(SUPERIOR);
    // The upgrade discount is equipment's alone: an active neither evolves nor is evolved.
    expect(upgradesOf(COMPRESS)).toEqual([]);
    expect([evolvesFrom(SUPERIOR), evolvesFrom(TRANSCENDENT)]).toEqual([undefined, undefined]);
    for (const [id] of FAMILY) expect(playCost(undefined, id), id).toBe(itemPrice(id));
  });

  it('each step doubles the price and the cards kept: a soul buys the same at every tier', () => {
    const kept = FAMILY.map(([, , draw, discard]) => draw - discard);
    const price = FAMILY.map(([id]) => itemPrice(id));
    expect(price).toEqual([PRICE[2], PRICE[3], PRICE[4]]);
    expect(kept).toEqual([1, 2, 4]);
    for (let i = 0; i < 3; i++) expect(price[i] / kept[i]).toBe(PRICE[2]);
  });

  it('played from the hand for its price: no hero\'s ability is spent, the cards are drawn, the discard is owed, and the card is on the discard pile', () => {
    for (const [id, , draw, discard] of FAMILY) {
      const { G, hero } = viscous();
      stackDeck(G, '0', Array.from({ length: 8 }, () => 'grit'));
      G.players['0'].souls = 0;
      const card = useItem(G, '0', id); // dealt, its price handed over, and played
      expect(hero.skillUsedThisTurn ?? false, id).toBe(false);
      expect(card.cooldowns, id).toBeUndefined();
      expect(G.players['0'].discard, id).toContain(card);
      expect(G.players['0'].souls, id).toBe(0);
      expect(G.players['0'].hand, id).toHaveLength(draw);
      expect(G.pendingDiscard, id).toMatchObject({ pid: '0', count: discard, cardId: id });
    }
  });

  it('cuts no wait: played, they leave the ultimate and the skill on their own timers, and no card has a cooldown hook', () => {
    for (const played of [[], [COMPRESS], [SUPERIOR], [TRANSCENDENT]]) {
      const { G, hero } = viscous();
      stackDeck(G, '0', Array.from({ length: 8 }, () => 'grit'));
      for (const id of played) {
        useItem(G, '0', id);
        // Pay the discard the draw card owes, so the turn goes on.
        const owed = G.pendingDiscard!;
        expect(perform(G, '0', { type: 'discard', cardIids: G.players['0'].hand.slice(0, owed.count).map((c) => c.iid) })).not.toBe(INVALID);
      }
      expect(cooldownCut(hero, 'ult'), played.join() || 'none').toBe(0);
      expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, skillId: 'eff_ult_viscous' }), played.join()).not.toBe(INVALID);
      expect(hero.cooldowns?.eff_ult_viscous, played.join() || 'none').toBe(ULT_WAIT.medium);
    }
    expect(Object.values(ABILITIES_BY_ID).filter((a) => a.cooldownCut).map((a) => a.id)).toEqual([]);
  });

  it('a wait is never taken under 1: Rapid Recharge\'s turn off stops there', () => {
    const { G } = viscous();
    const shiv = G.players['0'].bench[0] = makeHero('hero_shiv', '0', 'bench', 1);
    const knives = getAbility('skill_shiv')!;
    giveItem(G, shiv, 'rapid_recharge');
    expect(skillWait(knives, shiv)).toBe(skillWait(knives) - 1);
    expect(skillWait({ ...knives, cooldown: 1 }, shiv)).toBe(1);
  });

  it("leaves a skill's cooldown alone: The Cube still waits its 4 turns", () => {
    const { G, hero } = viscous();
    stackDeck(G, '0', Array.from({ length: 8 }, () => 'grit'));
    useItem(G, '0', TRANSCENDENT);
    expect(perform(G, '0', { type: 'discard', cardIids: G.players['0'].hand.slice(0, G.pendingDiscard!.count).map((c) => c.iid) })).not.toBe(INVALID);
    expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, targetIid: hero.iid })).not.toBe(INVALID);
    expect(hero.cooldowns?.skill_viscous).toBe(4);
    expect(SKILL_COOLDOWN).toBe(3); // the default; The Cube names its own
  });
});
