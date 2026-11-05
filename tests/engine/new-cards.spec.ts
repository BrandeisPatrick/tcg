/**
 * The cards added and moved in the card-design pass (docs/card-design.md):
 * movement / protection / cooldown active items (spells, used with `activate`
 * as the bearer's one ability of the turn), the passive items that were
 * spells, and the two bench target filters Warp Stone and Phantom Strike aim
 * with.
 *
 * Board (freshReadyGame): P0 Haze (active) · Vindicta / Lash / Paige;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID, SPELLS, EQUIPMENT } from '@/cards';
import { addStatus } from '@/engine/statusOps';
import { INVALID, perform } from '@/engine/engine';
import { activateBlocked, attackTargets, blocked } from '@/engine/legality';
import { activeCooldown, itemCooldown, itemPrice, targetsFor } from '@/engine/query';
import { fireTriggers } from '@/engine/triggers';
import { PRICE } from '@/engine/constants';
import { freshReadyGame, giveItem, useItem } from './_helpers';

const status = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id);
const ids = (cards: CardInstance[]) => cards.map((c) => c.cardId);

describe('Card types follow the active / passive rule', () => {
  it('the moved cards sit on the right side', () => {
    for (const id of ['colossus', 'guardian_ward', 'warp_stone', 'divine_barrier', 'ethereal_shift', 'phantom_strike', 'vortex_web', 'refresher']) {
      expect(CARDS_BY_ID[id]?.type, id).toBe('spell');
    }
    for (const id of ['healbane', 'active_reload', 'long_range', 'fortitude']) {
      expect(CARDS_BY_ID[id]?.type, id).toBe('equipment');
    }
  });

  it('the renamed items print their current names', () => {
    expect(CARDS_BY_ID['debuff_remover'].name).toBe('Dispel Magic');
    expect(CARDS_BY_ID['silence_glyph'].name).toBe('Silence Wave');
    expect(CARDS_BY_ID['curse'].name).toBe('Cursed Relic');
    expect(CARDS_BY_ID['improved_cooldown'].name).toBe('Compress Cooldown');
    expect(CARDS_BY_ID['improved_burst'].name).toBe('Tankbuster');
  });

  it('every item sits on a shop tab at a tier and is priced by it, and no two items share an id', () => {
    for (const item of [...SPELLS, ...EQUIPMENT]) {
      expect(['weapon', 'spirit', 'vitality'], item.id).toContain(item.slot);
      expect([1, 2, 3, 4], item.id).toContain(item.tier);
      expect(itemPrice(item.id), item.id).toBe(PRICE[item.tier]);
    }
    const all = [...SPELLS, ...EQUIPMENT].map((c) => c.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('Bench target filters', () => {
  it('allyBench lists the bench heroes who could step in', () => {
    const G = freshReadyGame();
    expect(ids(targetsFor(G, '0', 'allyBench'))).toEqual(['hero_vindicta', 'hero_lash', 'hero_paige']);
  });

  it('allyBench is empty while your Active is Rooted, and leaves out a Rooted bench hero', () => {
    const G = freshReadyGame();
    addStatus(G, G.players['0'].bench[0]!, 'rooted', 1, 2);
    expect(ids(targetsFor(G, '0', 'allyBench'))).toEqual(['hero_lash', 'hero_paige']);
    addStatus(G, G.players['0'].active!, 'rooted', 1, 2);
    expect(targetsFor(G, '0', 'allyBench')).toEqual([]);
  });

  it('enemyBench lists the rival bench and never your own', () => {
    const G = freshReadyGame();
    expect(ids(targetsFor(G, '0', 'enemyBench'))).toEqual(['hero_dynamo', 'hero_kelvin', 'hero_seven']);
  });
});

describe('New active items', () => {
  it('Guardian Ward shields an ally 3', () => {
    const G = freshReadyGame();
    const paige = G.players['0'].bench[2]!;
    useItem(G, '0', 'guardian_ward', paige.iid);
    expect(status(paige, 'shield')?.value).toBe(3);
  });

  it('Warp Stone swaps a bench ally in with Bullet Resist 3 for 2 turns', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const lash = G.players['0'].bench[1]!;
    useItem(G, '0', 'warp_stone', lash.iid);
    expect(G.players['0'].active!.iid).toBe(lash.iid);
    expect(G.players['0'].bench[1]!.iid).toBe(haze.iid);
    expect(status(lash, 'bullet_resist')).toMatchObject({ value: 3, duration: 2 });
  });

  it('Warp Stone cannot be aimed at the Active or an enemy', () => {
    const G = freshReadyGame();
    const item = giveItem(G, G.players['0'].active!, 'warp_stone');
    expect(activateBlocked(G, '0', item.iid, G.players['0'].active!.iid)).toBe('target');
    expect(activateBlocked(G, '0', item.iid, G.players['1'].bench[0]!.iid)).toBe('target');
  });

  it('Divine Barrier cleanses every debuff but Stun and shields 4', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    addStatus(G, haze, 'bleed', 2, 3);
    addStatus(G, haze, 'silenced', 1, 2);
    addStatus(G, haze, 'stun', 1, 1);
    // A Stunned hero uses nothing: a bench ally wears it.
    useItem(G, '0', 'divine_barrier', haze.iid, G.players['0'].bench[0]!);
    expect(status(haze, 'bleed')).toBeUndefined();
    expect(status(haze, 'silenced')).toBeUndefined();
    expect(status(haze, 'stun')).toBeDefined();
    expect(status(haze, 'shield')?.value).toBe(4);
  });

  it('Ethereal Shift puts a Dome up: the rival cannot attack that hero', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    useItem(G, '0', 'ethereal_shift', haze.iid);
    expect(status(haze, 'dome')).toBeDefined();
    expect(status(haze, 'spirit_power')).toMatchObject({ value: 1, duration: 2 });
    expect(attackTargets(G, '1')).toEqual([]);
  });

  it('Phantom Strike drags a bench hero to the front, hits it and disarms it', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    const kelvin = G.players['1'].bench[1]!;
    const hp0 = kelvin.hp;
    useItem(G, '0', 'phantom_strike', kelvin.iid);
    expect(G.players['1'].active!.iid).toBe(kelvin.iid);
    expect(G.players['1'].bench[1]!.iid).toBe(abrams.iid);
    expect(kelvin.hp).toBeLessThan(hp0);
    expect(status(kelvin, 'disarm')).toBeDefined();
  });

  it('Vortex Web hits every enemy hero and roots them for 2 turns', () => {
    const G = freshReadyGame();
    const foes = [G.players['1'].active!, ...G.players['1'].bench.filter((b): b is CardInstance => !!b)];
    for (const f of foes) { f.hpMax = 20; f.hp = 20; }
    useItem(G, '0', 'vortex_web');
    for (const f of foes) {
      expect(f.hp, f.cardId).toBeLessThan(20);
      expect(status(f, 'rooted'), f.cardId).toMatchObject({ duration: 2 });
    }
  });

  /** P0 with Lash stepped up to the Active slot (a Retreat): an Active with a
   *  skill and an ultimate. */
  function lashAtTheFront() {
    const G = freshReadyGame();
    const ps = G.players['0'];
    const lash = ps.bench[1]!;
    ps.souls = 1;
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 2, toSlot: 0 })).not.toBe(INVALID);
    expect(ps.active).toBe(lash);
    return { G, lash };
  }

  it("Refresher takes your Active's skill, ultimate and active items off cooldown — not a hard-CC item's charges, nor its own", () => {
    const { G, lash } = lashAtTheFront();
    lash.cooldowns = { skill_lash: 1, eff_ult_lash: 3 };
    const coldFront = giveItem(G, lash, 'cold_front', { cooldown: 2 });
    const knockdown = giveItem(G, lash, 'knockdown');
    knockdown.charges = 1;
    const paige = G.players['0'].bench[2]!;
    paige.cooldowns = { skill_paige: 1 }; // a bench hero's are its own
    const refresher = useItem(G, '0', 'refresher', undefined, lash);
    expect(lash.cooldowns?.skill_lash ?? 0).toBe(0);
    expect(lash.cooldowns?.eff_ult_lash ?? 0).toBe(0);
    expect(itemCooldown(coldFront)).toBe(0);
    expect(knockdown.charges).toBe(1);
    expect(itemCooldown(refresher)).toBe(activeCooldown(lash, 4)); // its own starts after it runs
    expect(paige.cooldowns).toEqual({ skill_paige: 1 });
  });

  it('Refresher worn on the bench readies your Active for this very turn', () => {
    const { G, lash } = lashAtTheFront();
    lash.cooldowns = { skill_lash: 1 };
    const skill = { type: 'useSkill' as const, heroIid: lash.iid, targetIid: G.players['1'].active!.iid };
    expect(blocked(G, '0', skill)).toBe('cooldown');
    useItem(G, '0', 'refresher', undefined, G.players['0'].bench[2]!);
    expect(blocked(G, '0', skill)).toBeNull();
  });

  it('Dispel Magic cleanses, shields 4, and heals 4 only when it removed something', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 10; haze.hp = 5;
    useItem(G, '0', 'debuff_remover', haze.iid);
    expect(haze.hp).toBe(5);
    addStatus(G, haze, 'bleed', 1, 2);
    // Haze has used its ability this turn: a bench ally wears the second.
    useItem(G, '0', 'debuff_remover', haze.iid, G.players['0'].bench[0]!);
    expect(status(haze, 'bleed')).toBeUndefined();
    expect(haze.hp).toBe(9);
  });
});

describe('New and moved equipment', () => {
  it('Long Range lets the bearer aim at the enemy bench', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    expect(ids(attackTargets(G, '0'))).toEqual(['hero_abrams']);
    giveItem(G, haze, 'long_range');
    expect(ids(attackTargets(G, '0'))).toEqual(['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven']);
  });

  it('Healbane stops the struck enemy healing for 2 turns', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    giveItem(G, haze, 'healbane');
    fireTriggers(G, haze, 'onBearerSkillDamage', { reaction: true, target: abrams, amount: 2, movingPlayer: '0' });
    expect(status(abrams, 'healing_boost_down')).toMatchObject({ duration: 2 });
  });

  it('Fortitude heals its bearer 2 at the start of the turn', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'fortitude');
    haze.hpMax = 10; haze.hp = 5;
    fireTriggers(G, haze, 'startOfTurn', { reaction: true, movingPlayer: '0' });
    expect(haze.hp).toBe(7);
  });
});
