/**
 * Witchmail (Patrick, 2026-11-16: "you have not implemented Witchmail"):
 * Deadlock's Vitality T4 passive — Spirit Power, Spirit Resist, a cooldown cut,
 * and heavy spirit hits taken shorten a cooldown. Skipped while no card could
 * touch a wait; the Cooldown family can now. Cheat Death was already a card
 * (its row is at the end).
 */
import { describe, it, expect } from 'vitest';
import { itemCard } from '@/cards';
import { getAbility } from '@/abilities';
import { damageUnit } from '@/engine/damage';
import { cooldownCut, effectiveSpirit, skillWait } from '@/engine/query';
import { freshReadyGame, giveItem, makeHero } from './_helpers';

function lash() {
  const G = freshReadyGame();
  const hero = G.players['0'].active = makeHero('hero_lash', '0', 'active', 0);
  hero.hp = hero.hpMax = 40;
  giveItem(G, hero, 'witchmail');
  return { G, hero };
}

describe('Witchmail', () => {
  it('+3 Spirit Power, Spirit Resist 3 and the skill 1 turn shorter while worn', () => {
    const { G, hero } = lash();
    expect(effectiveSpirit(hero)).toBe(3);
    expect(cooldownCut(hero, 'skill')).toBe(1);
    expect(skillWait(getAbility('skill_lash')!, hero)).toBe(1); // Grapple waits 2 (2026-11-17)
    const before = hero.hp;
    damageUnit(G, hero, 5, 'spirit');
    expect(before - hero.hp).toBe(2); // 5 less Spirit Resist 3
  });

  it('a spirit hit of 3 or more on it takes 1 off its skill\'s wait, never past the last turn', () => {
    const { G, hero } = lash();
    hero.cooldowns = { skill_lash: 3 };
    damageUnit(G, hero, 6, 'spirit'); // 3 after the resist
    expect(hero.cooldowns.skill_lash).toBe(2);
    damageUnit(G, hero, 4, 'spirit'); // 1 after the resist: not heavy
    expect(hero.cooldowns.skill_lash).toBe(2);
    damageUnit(G, hero, 9, 'spirit');
    expect(hero.cooldowns.skill_lash).toBe(1);
    damageUnit(G, hero, 9, 'spirit');
    expect(hero.cooldowns.skill_lash).toBe(1); // the turn's tick readies it
  });

  it('a bullet hit does nothing to the wait', () => {
    const { G, hero } = lash();
    hero.cooldowns = { skill_lash: 3 };
    damageUnit(G, hero, 6, 'attack');
    expect(hero.cooldowns.skill_lash).toBe(3);
  });

  it('the card: Vitality tier 4; and Cheat Death is a card too', () => {
    expect(itemCard('witchmail')).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 4 });
    expect(itemCard('cheat_death')).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 4 });
  });
});
