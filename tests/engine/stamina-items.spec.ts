/**
 * The step-in items Patrick took from the Lash discussion (2026-11-17: "I like
 * those"). The Stamina line gives the Retreat back when the bearer steps in
 * (Extra Stamina once every 3 turns, Stamina Mastery once a turn), and Extra
 * Stamina is what Kinetic Dash and Arcane Surge are built from, as in Deadlock.
 * Three Street Brawl items reward the step in: Seraphim Wings (hit harder,
 * take less), Electric Slippers (3 to every enemy) and Shadow Strike
 * (Shadowed: nothing aimed can pick it).
 */
import { describe, it, expect } from 'vitest';
import { itemCard } from '@/cards';
import { INVALID, perform } from '@/engine/engine';
import { itemPrice, targetsFor } from '@/engine/query';
import { attackTargets, moveBlocked } from '@/engine/legality';
import { tickCooldowns } from '@/engine/statusOps';
import { PRICE } from '@/engine/constants';
import { freshReadyGame, giveItem } from './_helpers';

function withItem(id: string) {
  const G = freshReadyGame();
  const me = G.players['0'];
  me.souls = 10;
  const lash = me.bench.find((h) => h?.cardId === 'hero_lash')!;
  const item = giveItem(G, lash, id);
  const rivals = () => [G.players['1'].active!, ...G.players['1'].bench.filter((c) => !!c)] as NonNullable<typeof G.players['1']['active']>[];
  for (const r of rivals()) r.hp = r.hpMax = 30;
  /** A Retreat that brings Lash in for Haze. */
  const retreatIn = () => expect(perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: lash.slot as 1 | 2 | 3 })).not.toBe(INVALID);
  /** A Retreat that takes Lash out again (for the first other bench hero). */
  const retreatOut = () => {
    const to = me.bench.findIndex((h) => !!h && h !== lash) + 1;
    return perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: to as 1 | 2 | 3 });
  };
  return { G, me, lash, item, rivals, retreatIn, retreatOut };
}

describe('the cards', () => {
  it('slot, tier, price and line, as drafted', () => {
    expect(itemCard('extra_stamina')).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 1 });
    expect(itemCard('stamina_mastery')).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 3, upgradesFrom: 'extra_stamina', bonus: { hp: 1 } });
    for (const id of ['seraphim_wings', 'electric_slippers', 'shadow_strike']) {
      expect(itemCard(id), id).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 5 });
      expect(itemPrice(id), id).toBe(PRICE[5]);
    }
    expect(itemCard('kinetic_dash')!.upgradesFrom).toBe('extra_stamina');
    expect(itemCard('arcane_surge')!.upgradesFrom).toBe('extra_stamina');
  });
});

describe('Extra Stamina and Stamina Mastery: the Retreat comes back', () => {
  it('a Retreat into the bearer gives the Retreat back, and Extra Stamina then waits 3 turns', () => {
    const { G, item, retreatIn, retreatOut } = withItem('extra_stamina');
    retreatIn();
    expect(G.retreatUsed).toBe(false);
    expect(item.cooldowns?.eff_extra_stamina).toBe(3);
    expect(retreatOut()).not.toBe(INVALID); // out again, the same turn
    expect(G.retreatUsed).toBe(true);
  });

  it('while it waits, stepping in gives nothing back; its wait runs on its owner\'s turns', () => {
    const { G, me, item, retreatIn, retreatOut } = withItem('extra_stamina');
    retreatIn();
    retreatOut();
    // A second way in this turn (Grapple) finds it waiting.
    perform(G, '0', { type: 'useSkill', heroIid: me.bench.find((h) => h?.cardId === 'hero_lash')!.iid });
    expect(G.retreatUsed).toBe(true);
    expect(moveBlocked(G, '0', 0, 1)).toBe('retreated');
    for (let i = 0; i < 3; i++) tickCooldowns(me);
    expect(item.cooldowns?.eff_extra_stamina).toBeUndefined();
  });

  it('with the Retreat unspent there is nothing to give back, and it does not start its wait', () => {
    const { G, me, item } = withItem('extra_stamina');
    perform(G, '0', { type: 'useSkill', heroIid: me.bench.find((h) => h?.cardId === 'hero_lash')!.iid }); // Grapple: no Retreat used
    expect(G.retreatUsed).toBe(false);
    expect(item.cooldowns).toBeUndefined();
  });

  it('Stamina Mastery: once a turn, ready again on the next', () => {
    const { G, me, lash, item, retreatIn, retreatOut } = withItem('stamina_mastery');
    expect(lash.hpMax).toBe(5 + 1); // Lash's 5, and Stamina Mastery's +1
    retreatIn();
    expect(G.retreatUsed).toBe(false);
    expect(item.cooldowns?.eff_stamina_mastery).toBe(1);
    retreatOut();
    perform(G, '0', { type: 'useSkill', heroIid: lash.iid }); // back in by Grapple: once a turn, spent
    expect(G.retreatUsed).toBe(true);
    tickCooldowns(me);
    expect(item.cooldowns?.eff_stamina_mastery).toBeUndefined();
  });
});

describe('the Street Brawl items: what the step in brings', () => {
  it('Seraphim Wings: +2 Bullet Power, Bullet Resist 2 and Spirit Resist 2 for 1 turn', () => {
    const { lash, retreatIn } = withItem('seraphim_wings');
    retreatIn();
    const has = (id: string) => lash.statuses.find((s) => s.id === id)?.value;
    expect([has('weapon_power'), has('bullet_resist'), has('spirit_resist')]).toEqual([2, 2, 2]);
  });

  it('Electric Slippers: 3 spirit damage to every enemy, once a turn', () => {
    const { G, lash, rivals, retreatIn, retreatOut } = withItem('electric_slippers');
    const before = rivals().map((r) => r.hp);
    retreatIn();
    const after = rivals().map((r) => r.hp);
    after.forEach((hp, i) => expect(before[i] - hp, rivals()[i].cardId).toBeGreaterThan(0));
    retreatOut();
    G.retreatUsed = false;
    perform(G, '0', { type: 'useSkill', heroIid: lash.iid }); // in again this turn
    expect(rivals().map((r) => r.hp)).toEqual(after);
  });

  it('Shadow Strike: Shadowed for 1 turn, so the rival can aim nothing at it', () => {
    const { G, lash, retreatIn } = withItem('shadow_strike');
    retreatIn();
    expect(lash.statuses.some((s) => s.id === 'shadowed')).toBe(true);
    expect(targetsFor(G, '1', 'enemyHero').map((c) => c.iid)).not.toContain(lash.iid);
    expect(targetsFor(G, '1', 'enemyActive')).toEqual([]);
    expect(attackTargets(G, '1').map((c) => c.iid)).not.toContain(lash.iid);
  });
});
