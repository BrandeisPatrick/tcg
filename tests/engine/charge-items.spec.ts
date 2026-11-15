/**
 * The charge items (docs/card-design.md, "Added 2026-11-15: the charge
 * items"; docs/balance-model.md §8): Extra Charge and Rapid Recharge, the only
 * cards that touch a charged skill's charges.
 *
 *  - Extra Charge: the bearer's charged skill holds 1 more charge.
 *  - Rapid Recharge (built from Extra Charge): 2 more, and each comes back 1
 *    turn sooner.
 *  - A charge an item adds comes ready, and goes when the item goes.
 *  - Neither does anything for a skill with no charges.
 *  - Nothing else in the catalogue touches a charge or a skill's wait.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { ABILITIES_BY_ID } from '@/abilities';
import { ITEMS, itemCard } from '@/cards';
import { INVALID, perform, type Action } from '@/engine/engine';
import { playCost, skillBlocked } from '@/engine/legality';
import { chargeBonus, chargeHaste, heroesOf, itemPrice, kitCharges, resolveSkill, skillWait, wornItems } from '@/engine/query';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { PRICE } from '@/engine/constants';
import { skillBlockReason } from '@/ui/board/heroActions';
import { freshReadyGame, giveCard, giveItem, playItem, playNew } from './_helpers';

/** End the turn of `pid` and begin the other seat's, as the game's turn hooks do. */
function nextTurn(G: GameState, pid: PlayerID): PlayerID {
  const next: PlayerID = pid === '0' ? '1' : '0';
  endTurnEffects(G, pid);
  beginTurn(G, next, G.turnNumber + 1 + G.draftTurnsOffset);
  return next;
}
/** A whole round: P0's turn ends, P1's passes, and it is P0's turn again. */
function round(G: GameState) {
  expect(nextTurn(G, nextTurn(G, '0'))).toBe('0');
}

/** P0's turn, with `heroId` on its bench and a rival side too tough for a
 *  skill's damage to fell (so nothing but the charges changes). */
function withHero(heroId: string): { G: GameState; hero: CardInstance; use: Action } {
  const G = freshReadyGame();
  const hero = makeInstance(allocatorOf(G), heroId, '0', 'bench', 1);
  G.players['0'].bench[0] = hero;
  for (const foe of heroesOf(G.players['1'])) { foe.hpMax = 60; foe.hp = 60; }
  // A skill aimed at the enemy Active names it; one that hits every enemy names nobody.
  const targetIid = resolveSkill(hero)?.ability.target === 'enemyActive' ? G.players['1'].active!.iid : undefined;
  return { G, hero, use: { type: 'useSkill', heroIid: hero.iid, targetIid } };
}
const cast = (G: GameState, use: Action) => expect(perform(G, '0', use)).not.toBe(INVALID);

describe('the charge items are Deadlock\'s: passive Spirit items, so equipment', () => {
  it('Extra Charge is tier 1; Rapid Recharge is tier 3 and built from it', () => {
    const extra = itemCard('extra_charge')!;
    const rapid = itemCard('rapid_recharge')!;
    expect([extra.name, extra.type, extra.slot, extra.tier]).toEqual(['Extra Charge', 'equipment', 'spirit', 1]);
    expect([rapid.name, rapid.type, rapid.slot, rapid.tier]).toEqual(['Rapid Recharge', 'equipment', 'spirit', 3]);
    expect(rapid.upgradesFrom).toBe('extra_charge');
    expect([itemPrice('extra_charge'), itemPrice('rapid_recharge')]).toEqual([PRICE[1], PRICE[3]]);
  });

  it('nothing else touches a charge or a skill\'s wait: the two are the only cards with the hooks', () => {
    const hooked = Object.values(ABILITIES_BY_ID).filter((a) => a.chargeBonus || a.chargeHaste).map((a) => a.id).sort();
    expect(hooked).toEqual(['eff_extra_charge', 'eff_rapid_recharge']);
    const cards = ITEMS.filter((c) => (c.abilities ?? []).some((id) => hooked.includes(id))).map((c) => c.id).sort();
    expect(cards).toEqual(['extra_charge', 'rapid_recharge']);
    // Only Rapid Recharge makes a charge come back sooner.
    expect(Object.values(ABILITIES_BY_ID).filter((a) => a.chargeHaste).map((a) => a.id)).toEqual(['eff_rapid_recharge']);
  });
});

describe('Extra Charge: the bearer\'s charged skill holds 1 more charge', () => {
  it('Kelvin\'s Frost Grenade holds 3, at its own wait of 4', () => {
    const { G, hero: kelvin, use } = withHero('hero_kelvin');
    expect(kitCharges(kelvin)).toEqual({ max: 2, left: 2 });
    giveItem(G, kelvin, 'extra_charge');
    expect(chargeBonus(kelvin)).toBe(1);
    expect(chargeHaste(kelvin)).toBe(0);
    expect(kitCharges(kelvin)).toEqual({ max: 3, left: 3 });
    const frost = resolveSkill(kelvin)!.ability;
    expect(skillWait(frost, kelvin)).toBe(skillWait(frost)); // no sooner
    // Three turns running, then none left.
    for (const left of [2, 1, 0]) {
      cast(G, use);
      expect(kitCharges(kelvin)).toEqual({ max: 3, left });
      round(G);
    }
    expect(skillBlocked(G, '0', kelvin)).toBe('cooldown');
    expect(kelvin.cooldowns?.skill_kelvin).toBe(1);          // the first wait of 4, three turns in
  });

  it('the charge it adds comes ready, on a hero short of charges too', () => {
    const { G, hero: kelvin, use } = withHero('hero_kelvin');
    cast(G, use);
    round(G);
    cast(G, use);
    round(G);
    expect(kitCharges(kelvin)).toEqual({ max: 2, left: 0 });
    expect(skillBlocked(G, '0', kelvin)).toBe('cooldown');
    playNew(G, '0', 'extra_charge', kelvin);                 // played from the hand, for its 2 souls
    expect(kitCharges(kelvin)).toEqual({ max: 3, left: 1 });
    expect(skillBlocked(G, '0', kelvin)).toBeNull();
    cast(G, use);
    expect(kitCharges(kelvin)).toEqual({ max: 3, left: 0 });
  });
});

describe('Rapid Recharge: 2 more charges, and each comes back 1 turn sooner', () => {
  it('Frost Grenade holds 4 and a charge takes 3 turns, not 4; Serrated Knives holds 4 and a charge takes 2, not 3', () => {
    for (const [heroId, skillId, wait] of [['hero_kelvin', 'skill_kelvin', 4], ['hero_shiv', 'skill_shiv', 3]] as const) {
      const { G, hero, use } = withHero(heroId);
      const ability = resolveSkill(hero)!.ability;
      expect(skillWait(ability, hero), heroId).toBe(wait);
      giveItem(G, hero, 'rapid_recharge');
      expect([chargeBonus(hero), chargeHaste(hero)]).toEqual([2, 1]);
      expect(kitCharges(hero), heroId).toEqual({ max: 4, left: 4 });
      expect(skillWait(ability, hero), heroId).toBe(wait - 1);
      expect(skillWait(ability), heroId).toBe(wait);          // what the card prints is unchanged
      cast(G, use);
      expect(hero.cooldowns?.[skillId], heroId).toBe(wait - 1); // the wait a use starts is the shorter one
      expect(kitCharges(hero), heroId).toEqual({ max: 4, left: 3 });
    }
  });

  it('a charge that comes back starts the next one\'s wait at the shorter length', () => {
    const { G, hero: shiv, use } = withHero('hero_shiv');
    giveItem(G, shiv, 'rapid_recharge');
    cast(G, use);                                            // 3 left, a wait of 2
    round(G);
    cast(G, use);                                            // 2 left, the wait at 1
    expect(shiv.cooldowns?.skill_shiv).toBe(1);
    round(G);                                                // one back: 3 left, and 1 still spent
    expect(kitCharges(shiv)).toEqual({ max: 4, left: 3 });
    expect(shiv.cooldowns?.skill_shiv).toBe(2);
    round(G);
    round(G);                                                // and the last
    expect(kitCharges(shiv)).toEqual({ max: 4, left: 4 });
    expect(shiv.cooldowns?.skill_shiv).toBeUndefined();
    expect(shiv.chargesSpent).toBeUndefined();
  });

  it('onto the hero wearing Extra Charge it costs the difference and takes its place', () => {
    const { G, hero: kelvin } = withHero('hero_kelvin');
    giveItem(G, kelvin, 'extra_charge');
    expect(playCost(kelvin, 'rapid_recharge')).toBe(PRICE[3] - PRICE[1]);
    const card = giveCard(G, '0', 'rapid_recharge');
    G.players['0'].souls = PRICE[3] - PRICE[1];
    playItem(G, '0', card, kelvin);
    expect(G.players['0'].souls).toBe(0);
    expect(wornItems(kelvin).map((it) => it.cardId)).toEqual(['rapid_recharge']);
    expect(kitCharges(kelvin)).toEqual({ max: 4, left: 4 });
  });

  it('with no charge left, the hero sheet counts the turns to the next one', () => {
    const { G, hero: shiv, use } = withHero('hero_shiv');
    giveItem(G, shiv, 'rapid_recharge');
    shiv.chargesSpent = { skill_shiv: 4 };
    shiv.cooldowns = { skill_shiv: 2 };
    expect(skillBlocked(G, '0', shiv)).toBe('cooldown');
    expect(perform(G, '0', use)).toBe(INVALID);
    expect(skillBlockReason('cooldown', shiv)).toBe('Next charge in 2 turns');
  });
});

describe('what the charge items do not do', () => {
  it('two on one hero do not add up: the larger applies', () => {
    const { G, hero: kelvin } = withHero('hero_kelvin');
    giveItem(G, kelvin, 'extra_charge');
    giveItem(G, kelvin, 'rapid_recharge');
    expect(chargeBonus(kelvin)).toBe(2);
    expect(kitCharges(kelvin)).toEqual({ max: 4, left: 4 });
  });

  it('a skill with no charges keeps its one use and its whole wait', () => {
    const { G, hero: lash, use } = withHero('hero_lash');
    giveItem(G, lash, 'rapid_recharge');
    const strike = resolveSkill(lash)!.ability;
    expect(kitCharges(lash)).toBeUndefined();
    expect(skillWait(strike, lash)).toBe(skillWait(strike));
    cast(G, use);
    expect(lash.cooldowns?.skill_lash).toBe(skillWait(strike));
    expect(lash.chargesSpent).toBeUndefined();
    round(G);
    expect(skillBlocked(G, '0', lash)).toBe('cooldown');
  });

  it('taken off, its charges go with it, and the count settles as the wait next runs out', () => {
    const { G, hero: kelvin, use } = withHero('hero_kelvin');
    const rapid = giveItem(G, kelvin, 'rapid_recharge');
    for (let i = 0; i < 3; i++) { cast(G, use); if (i < 2) round(G); }
    expect(kitCharges(kelvin)).toEqual({ max: 4, left: 1 });
    kelvin.attached = (kelvin.attached ?? []).filter((it) => it.iid !== rapid.iid); // replaced by another card
    expect(kitCharges(kelvin)).toEqual({ max: 2, left: 0 });
    round(G);                                                // the wait of 3 runs out on the third turn after the first use
    expect(kelvin.cooldowns?.skill_kelvin).toBe(4);          // one of his own two is back, and the other's wait is his own again
    expect(kitCharges(kelvin)).toEqual({ max: 2, left: 1 });
    expect(kelvin.chargesSpent).toEqual({ skill_kelvin: 1 });
  });
});
