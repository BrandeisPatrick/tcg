/**
 * The Cooldown family (canon Compress → Superior → Transcendent Cooldown) is
 * equipment again (Patrick, 2026-11-16: "cooldown should not be draw cards;
 * they should be equipment to reduce CD"): Deadlock's passives, each a few
 * turns off the waits its bearer starts — Compress its skill's 1, Superior its
 * skill's 1 and its ultimate's 2, Transcendent its skill's 2 and its
 * ultimate's 3. A charged skill's too: its charges come back on that wait
 * (Patrick, 2026-11-16), so the cut adds to a charge item's turn sooner. Never
 * under 1; two Cooldown items worn do not add up. Each evolves the
 * one before, as in Deadlock. (The draw card is Golden Goose Egg now: hand.spec.)
 *
 * Board (freshReadyGame): P0's Active is made a Level 3 Viscous (his ultimate unlocked) — The Cube is
 * a skill that waits 4 turns, and his ultimate (Goo Ball, medium) waits 6.
 */
import { describe, it, expect } from 'vitest';
import { itemCard } from '@/cards';
import { ultimateCard } from '@/engine/query';
import { evolvesFrom, upgradesOf } from '@/cards/decks';
import { getAbility } from '@/abilities';
import { INVALID, perform } from '@/engine/engine';
import { cooldownCut, itemPrice, skillWait, ultWait } from '@/engine/query';
import { playCost } from '@/engine/legality';
import { PRICE, ULT_WAIT } from '@/engine/constants';
import { freshReadyGame, giveItem, makeHero } from './_helpers';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';

/** P0's Active made a Level 3 Viscous. */
function viscous() {
  const G = freshReadyGame();
  G.players['0'].souls = 20;
  const hero = G.players['0'].active = makeHero('hero_viscous', '0', 'active', 0);
  hero.level = ULT_UNLOCK_LEVEL;
  return { G, hero };
}

/** improved_cooldown keeps its old id; the item is Compress Cooldown. */
const COMPRESS = 'improved_cooldown';
const SUPERIOR = 'superior_cooldown';
const TRANSCENDENT = 'transcendent_cooldown';
/** Each: its tier, then the turns off a skill's wait and an ultimate's. */
const FAMILY = [[COMPRESS, 2, 1, 0], [SUPERIOR, 3, 1, 2], [TRANSCENDENT, 4, 2, 3]] as const;

describe('The Cooldown family is equipment that shortens waits', () => {
  it('three Spirit equipment, tiers 2, 3 and 4, priced by tier, each built from the one before', () => {
    for (const [id, tier] of FAMILY) {
      expect(itemCard(id), id).toMatchObject({ type: 'equipment', slot: 'spirit', tier });
      expect(itemPrice(id), id).toBe(PRICE[tier]);
    }
    expect(evolvesFrom(SUPERIOR)).toBe(COMPRESS);
    expect(evolvesFrom(TRANSCENDENT)).toBe(SUPERIOR);
    expect(upgradesOf(COMPRESS)).toEqual([SUPERIOR]);
    expect(upgradesOf(SUPERIOR)).toEqual([TRANSCENDENT]);
  });

  it('their texts say what they take off, and the hook takes exactly that', () => {
    for (const [id, , skill, ult] of FAMILY) {
      const { G, hero } = viscous();
      giveItem(G, hero, id);
      expect(cooldownCut(hero, 'skill'), id).toBe(skill);
      expect(cooldownCut(hero, 'ult'), id).toBe(ult);
      expect(itemCard(id)!.text, id).toContain(`skill waits ${skill} turn${skill === 1 ? '' : 's'} less`);
      if (ult) expect(itemCard(id)!.text, id).toContain(`ultimate ${ult} less`);
    }
  });

  it('worn, the bearer\'s skill and ultimate wait less after a use: The Cube 4 → 2, Goo Ball 6 → 3 with Transcendent', () => {
    const { G, hero } = viscous();
    giveItem(G, hero, TRANSCENDENT);
    expect(skillWait(getAbility('skill_viscous')!, hero)).toBe(2);
    // The Cube cubes his side's Active, Viscous himself here (no choice since 2026-11-18).
    expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid })).not.toBe(INVALID);
    expect(hero.statuses.some((s) => s.id === 'cube')).toBe(true);
    expect(hero.cooldowns?.skill_viscous).toBe(2);
    const goo = ultimateCard('eff_ult_viscous')!;
    expect(ULT_WAIT[goo.size]).toBe(6);
    expect(ultWait(goo, hero)).toBe(3);
    // The next turn, the ultimate: one ability a hero a turn, and a cubed hero
    // uses nothing until its side's next turn (2026-11-16), when the Cube is gone.
    hero.skillUsedThisTurn = false;
    hero.cooldowns = {};
    hero.statuses = hero.statuses.filter((s) => s.id !== 'cube');
    expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, skillId: 'eff_ult_viscous' })).not.toBe(INVALID);
    expect(hero.cooldowns?.eff_ult_viscous).toBe(3);
  });

  it('a charged skill\'s charges come back sooner too (2026-11-16): Kelvin\'s Frost Grenade 4 → 3, and 2 with Rapid Recharge as well', () => {
    const { G } = viscous();
    const kelvin = G.players['0'].bench[0] = makeHero('hero_kelvin', '0', 'bench', 1);
    giveItem(G, kelvin, SUPERIOR);
    const grenade = getAbility('skill_kelvin')!;
    expect(skillWait(grenade)).toBe(4);
    expect(skillWait(grenade, kelvin)).toBe(3);
    giveItem(G, kelvin, 'rapid_recharge'); // the charge item's turn sooner adds to it
    expect(skillWait(grenade, kelvin)).toBe(2);
    const shelter = ultimateCard('eff_ult_kelvin')!;
    expect(ultWait(shelter, kelvin)).toBe(ULT_WAIT[shelter.size] - 2);
  });

  it('two worn do not add up (the larger applies), and a wait is never taken under 1', () => {
    const { G, hero } = viscous();
    giveItem(G, hero, COMPRESS);
    giveItem(G, hero, TRANSCENDENT);
    expect(cooldownCut(hero, 'skill')).toBe(2);
    expect(cooldownCut(hero, 'ult')).toBe(3);
    expect(skillWait({ ...getAbility('skill_viscous')!, cooldown: 2 }, hero)).toBe(1);
  });

  it('a wait is never taken under 1: Rapid Recharge\'s turn off stops there', () => {
    const { G } = viscous();
    const shiv = G.players['0'].bench[0] = makeHero('hero_shiv', '0', 'bench', 1);
    const knives = getAbility('skill_shiv')!;
    giveItem(G, shiv, 'rapid_recharge');
    expect(skillWait(knives, shiv)).toBe(skillWait(knives) - 1);
    expect(skillWait({ ...knives, cooldown: 1 }, shiv)).toBe(1);
  });

  it('onto the hero wearing the one below, an upgrade costs the difference', () => {
    const { G, hero } = viscous();
    giveItem(G, hero, COMPRESS);
    expect(playCost(hero, SUPERIOR)).toBe(PRICE[3] - PRICE[2]);
    expect(playCost(undefined, SUPERIOR)).toBe(PRICE[3]);
    void G;
  });
});
