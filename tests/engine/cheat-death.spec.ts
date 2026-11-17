/**
 * Cheat Death (Patrick, 2026-11-16: "like a Victor ultimate sort of thing, but
 * by cooldown"): a hit that would fell its bearer leaves it at 1 HP, then the
 * item waits CHEAT_DEATH_WAIT own turns. Deadlock's has a 90-second cooldown.
 */
import { describe, it, expect } from 'vitest';
import { itemCard } from '@/cards';
import { damageUnit } from '@/engine/damage';
import { tickCooldowns } from '@/engine/statusOps';
import { CHEAT_DEATH_WAIT } from '@/engine/constants';
import { cheatDeathReady } from '@/engine/query';
import { itemDial } from '@/ui/overlays/abilityDialModel';
import { freshReadyGame, giveItem } from './_helpers';

function bearer() {
  const G = freshReadyGame();
  const hero = G.players['0'].active!;
  const item = giveItem(G, hero, 'cheat_death');
  hero.hp = 5;
  return { G, hero, item };
}

describe('Cheat Death', () => {
  it('a hit that would fell the bearer leaves it at 1 HP, and the item starts its wait', () => {
    const { G, hero, item } = bearer();
    damageUnit(G, hero, 20, 'spirit');
    expect(hero.hp).toBe(1);
    expect(item.cooldowns?.eff_cheat_death).toBe(CHEAT_DEATH_WAIT);
    expect(cheatDeathReady(hero)).toBeUndefined();
    expect(G.log.some((l) => /cheats death/.test(l.text))).toBe(true);
  });

  it('while it waits, the next lethal hit fells the bearer', () => {
    const { G, hero } = bearer();
    damageUnit(G, hero, 20, 'spirit');
    damageUnit(G, hero, 5, 'spirit');
    expect(hero.hp).toBeLessThanOrEqual(0);
  });

  it('a hit that would not fell it is untouched, and the item stays ready', () => {
    const { G, hero, item } = bearer();
    damageUnit(G, hero, 2, 'spirit');
    expect(hero.hp).toBe(3);
    expect(item.cooldowns).toBeUndefined();
  });

  it('the wait counts its owner\'s turns, then it saves again, from 1 HP too', () => {
    const { G, hero, item } = bearer();
    damageUnit(G, hero, 20, 'spirit');
    for (let i = 0; i < CHEAT_DEATH_WAIT; i++) tickCooldowns(G.players['0']);
    expect(item.cooldowns?.eff_cheat_death).toBeUndefined();
    expect(cheatDeathReady(hero)).toBe(item);
    damageUnit(G, hero, 9, 'spirit');
    expect(hero.hp).toBe(1);
  });

  it('its tile wears the wait as a dial: none while ready, the turns left while it waits', () => {
    const { G, hero, item } = bearer();
    expect(itemDial(item)).toBeUndefined();
    damageUnit(G, hero, 20, 'spirit');
    expect(itemDial(item)).toEqual({ kind: 'wait', left: CHEAT_DEATH_WAIT, full: CHEAT_DEATH_WAIT });
    tickCooldowns(G.players['0']);
    expect(itemDial(item)).toMatchObject({ left: CHEAT_DEATH_WAIT - 1 });
  });

  it('the card says so', () => {
    expect(itemCard('cheat_death')!.text).toBe('+4 HP. Bullet Resist 2. A hit that would fell the bearer leaves it at 1 HP; then Cheat Death waits 3 turns.');
  });
});
