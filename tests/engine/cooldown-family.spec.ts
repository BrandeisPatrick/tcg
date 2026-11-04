/**
 * The Cooldown family (canon Compress → Superior → Transcendent Cooldown): the
 * `cooldownCut` hook. The bearer's ultimate waits fewer own turns after use —
 * Compress and Superior 1 fewer, Transcendent 2 — and, from Superior up, so do
 * the active items it wears, 1 fewer; never under 1. A skill's cooldown is its
 * own. (Before the redesign these items drew cards on skill use: that rule is
 * gone with the hand.)
 *
 * Board (freshReadyGame): P0's Active is made a Level 2 Viscous — The Cube is
 * a skill on a 2-turn cooldown, and her ultimate is unlocked.
 */
import { describe, it, expect } from 'vitest';
import { INVALID, perform } from '@/engine/engine';
import { activeCooldown, cooldownCut, itemCooldown } from '@/engine/query';
import { ULT_COOLDOWN } from '@/engine/constants';
import { freshReadyGame, giveItem, makeHero, useItem } from './_helpers';

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

describe('The Cooldown family', () => {
  it('reads as the cooldownCut hook: Compress ult −1, Superior ult and items −1, Transcendent ult −2 and items −1', () => {
    const cuts = (gear: string[]) => {
      const { hero } = viscous(...gear);
      return [cooldownCut(hero, 'ult'), cooldownCut(hero, 'item')];
    };
    expect(cuts([])).toEqual([0, 0]);
    expect(cuts([COMPRESS])).toEqual([1, 0]);
    expect(cuts([SUPERIOR])).toEqual([1, 1]);
    expect(cuts([TRANSCENDENT])).toEqual([2, 1]);
  });

  it("cuts the bearer's ultimate cooldown: 3, then 2 with Compress or Superior, 1 with Transcendent", () => {
    for (const [gear, want] of [[[], ULT_COOLDOWN], [[COMPRESS], 2], [[SUPERIOR], 2], [[TRANSCENDENT], 1]] as const) {
      const { G, hero } = viscous(...gear);
      expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, skillId: 'eff_ult_viscous' }), gear.join()).not.toBe(INVALID);
      expect(hero.cooldowns?.eff_ult_viscous, gear.join() || 'none').toBe(want);
    }
  });

  it("from Superior up, cuts the bearer's active items by 1: by tier, and the cooldown an item starts when used", () => {
    const byTier = (gear: string[]) => {
      const { hero } = viscous(...gear);
      return ([1, 2, 3, 4] as const).map((tier) => activeCooldown(hero, tier));
    };
    expect(byTier([])).toEqual([2, 2, 3, 3]);
    expect(byTier([COMPRESS])).toEqual([2, 2, 3, 3]);
    expect(byTier([SUPERIOR])).toEqual([1, 1, 2, 2]);
    expect(byTier([TRANSCENDENT])).toEqual([1, 1, 2, 2]);

    const { G, hero } = viscous(SUPERIOR);
    const decay = useItem(G, '0', 'decay', G.players['1'].active!.iid, hero); // tier 3
    expect(itemCooldown(decay)).toBe(2);
  });

  it('never takes a cooldown under 1, however many are worn (moved in from teammates)', () => {
    const { G, hero } = viscous(TRANSCENDENT, COMPRESS, SUPERIOR);
    expect(cooldownCut(hero, 'ult')).toBe(4);
    expect(activeCooldown(hero, 1)).toBe(1);
    expect(activeCooldown(hero, 4)).toBe(1);
    expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, skillId: 'eff_ult_viscous' })).not.toBe(INVALID);
    expect(hero.cooldowns?.eff_ult_viscous).toBe(1);
  });

  it("leaves a skill's cooldown alone: The Cube still waits 2", () => {
    const { G, hero } = viscous(TRANSCENDENT);
    expect(perform(G, '0', { type: 'useSkill', heroIid: hero.iid, targetIid: hero.iid })).not.toBe(INVALID);
    expect(hero.cooldowns?.skill_viscous).toBe(2);
  });
});
