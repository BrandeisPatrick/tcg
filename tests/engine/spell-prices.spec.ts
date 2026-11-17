/**
 * Spells priced for one play (Patrick, 2026-11-16: "they should have reduced
 * cost; a spell should have the benefit of costing less"). A spell whose one
 * play is worth under half its tier's price prints a price of its own, near
 * what that play is worth, instead of gaining effects; its tier stays the
 * item's (docs/card-design.md, "Changed 2026-11-16: spells priced for one play").
 * Prices halved the same day (PRICE 1 / 2 / 4 / 8 / 12, a soul buys 2 points):
 * a printed price is the play's value ÷ 2, to the whole soul, a line still
 * costing more than the spell it is built from.
 */
import { describe, it, expect } from 'vitest';
import { CARDS_BY_ID, ITEMS } from '@/cards';
import { itemPrice } from '@/engine/query';
import { PRICE } from '@/engine/constants';

const PRINTED: Record<string, number> = {
  knockdown: 2, disarming_hex: 2, majestic_leap: 1, curse: 3, mystical_piano: 5,
  echo_shard: 1, ethereal_shift: 2, divine_barrier: 3, infuser: 4, unstoppable: 2, vortex_web: 3, magic_carpet: 3,
  // infuser 3 until its heal became lifesteal (2026-11-16); vortex_web and magic_carpet since 2026-11-16.
  // Before prices halved: knockdown 4, disarming_hex 3, majestic_leap 2, curse 6, mystical_piano 10,
  // echo_shard 3, ethereal_shift 3, divine_barrier 5, infuser 5, unstoppable 3. Rusted Barrel's
  // own 1 is its tier's price now, so it prints none.
  // transcendent_cooldown printed 11 until it went back to equipment (2026-11-16): priced by its tier now.
};

describe('spells priced for one play', () => {
  it.each(Object.entries(PRINTED))('%s costs %i, under its tier\'s price, and keeps its tier', (id, price) => {
    const card = CARDS_BY_ID[id] as { type: string; tier: 1 | 2 | 3 | 4 | 5 };
    expect(card.type).toBe('spell');
    expect(itemPrice(id)).toBe(price);
    expect(price).toBeLessThan(PRICE[card.tier]);
  });

  it('a spell line keeps its order: the later card still costs more than the one it is built from', () => {
    for (const [base, top] of [['rusted_barrel', 'disarming_hex'], ['guardian_ward', 'divine_barrier']] as const) {
      expect(itemPrice(top), `${base} → ${top}`).toBeGreaterThan(itemPrice(base));
    }
  });

  it('only spells print a price of their own: equipment is priced by its tier', () => {
    for (const item of ITEMS) if (item.type === 'equipment') expect(itemPrice(item.id), item.id).toBe(PRICE[item.tier]);
  });

  it('the cards do what they did: the price changed, not the effect (Divine Barrier\'s Shield is its component\'s 7)', () => {
    const text = (id: string) => (CARDS_BY_ID[id] as { text: string }).text;
    expect(text('knockdown')).toBe('Stun enemy Active for 1 turn. A Stun ends a channel.');
    expect(text('echo_shard')).toBe('Your Active hero uses their skill again this turn.');
    expect(text('divine_barrier')).toBe("Cleanse an ally's debuffs except Stun and grant it Shield 7.");
  });
});
