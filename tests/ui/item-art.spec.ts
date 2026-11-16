/**
 * Every spell and equipment card finds its art where its type reads it
 * (`ItemIcon`, `CardFrame`, `RoundCardIcon`): a spell in `public/spells/`,
 * equipment in `public/items/`, named by the card id. When a card changes
 * type its art moves with it. (Patrick, 2026-11-16: the Cooldown family went
 * back to equipment and kept its art in `spells/`, so its cards showed none.)
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_CARDS } from '@/cards';

const file = (dir: string, id: string) => resolve(__dirname, '../../public', dir, `${id}.webp`);

describe('item art', () => {
  it("every spell's and equipment's art is in its type's folder", () => {
    const missing = ALL_CARDS
      .filter((c) => c.type === 'spell' || c.type === 'equipment')
      .filter((c) => !existsSync(file(c.type === 'spell' ? 'spells' : 'items', c.id)))
      .map((c) => `${c.type} ${c.id}`);
    expect(missing).toEqual([]);
  });

  it('the Cooldown family, equipment again, wears its Deadlock icons', () => {
    for (const id of ['improved_cooldown', 'superior_cooldown', 'transcendent_cooldown']) {
      expect(existsSync(file('items', id)), id).toBe(true);
      expect(existsSync(file('spells', id)), id).toBe(false);
    }
  });
});
