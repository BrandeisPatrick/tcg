/**
 * The cards added and moved in the card-design pass (docs/card-design.md):
 * movement / protection / cooldown active items (spells, used with `activate`
 * as the bearer's one ability of the turn), the passive items that were
 * spells, and the bench target filter Phantom Strike aims with (Warp Stone
 * aimed with one too until it became a hero draw, 2026-11-18, as Majestic Leap).
 *
 * Board (freshReadyGame): P0 Haze (active) · Vindicta / Lash / Paige;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID, SPELLS, EQUIPMENT } from '@/cards';
import { addStatus } from '@/engine/statusOps';
import { INVALID, perform } from '@/engine/engine';
import { attackTargets, blocked, playBlocked } from '@/engine/legality';
import { itemPrice, kitCharges, targetsFor } from '@/engine/query';
import { fireTriggers } from '@/engine/triggers';
import { PRICE } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, makeHero, stackDeck, useItem } from './_helpers';

const status = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id);
const ids = (cards: CardInstance[]) => cards.map((c) => c.cardId);

describe('Card types follow the active / passive rule', () => {
  it('the moved cards sit on the right side', () => {
    for (const id of ['colossus', 'guardian_ward', 'warp_stone', 'divine_barrier', 'ethereal_shift', 'phantom_strike', 'vortex_web', 'refresher']) {
      expect(CARDS_BY_ID[id]?.type, id).toBe('spell');
    }
    for (const id of ['healbane', 'swift_striker', 'long_range', 'fortitude']) {
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

  it('every item sits on a shop tab at a tier and is priced by it (or by the price printed on it), and no two items share an id', () => {
    for (const item of [...SPELLS, ...EQUIPMENT]) {
      expect(['weapon', 'spirit', 'vitality'], item.id).toContain(item.slot);
      expect([1, 2, 3, 4, 5], item.id).toContain(item.tier);
      expect(itemPrice(item.id), item.id).toBe(item.price ?? PRICE[item.tier]);
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
  it('Guardian Ward shields an ally 7', () => {
    const G = freshReadyGame();
    const paige = G.players['0'].bench[2]!;
    useItem(G, '0', 'guardian_ward', paige.iid);
    expect(status(paige, 'shield')?.value).toBe(7);
  });

  // Hero draws (Patrick, 2026-11-18): Warp Stone draws a hero from the deck; Majestic
  // Leap draws two, then the player discards a card. Each takes the first hero from the
  // top, the rest of the deck left in its order; a unit (a Ghoul) is no hero.
  it('Warp Stone draws the first hero from the top of the deck, the rest left in order', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.deck = [];
    const [egg, ghoul, mo, kelvin] = stackDeck(G, '0', ['golden_goose_egg', 'unit_ghoul', 'hero_mo_krill', 'hero_kelvin']);
    const hand0 = me.hand.length;
    useItem(G, '0', 'warp_stone');
    expect(me.hand.map((c) => c.iid)).toContain(mo.iid);
    expect(me.hand.length).toBe(hand0 + 1);
    expect(mo.zone).toBe('hand');
    expect(me.deck.map((c) => c.iid)).toEqual([kelvin.iid, ghoul.iid, egg.iid]); // top is last
    expect(G.pendingDiscard).toBeUndefined();
  });

  it('Warp Stone and Majestic Leap are not cast with no hero in the deck (a Ghoul is none)', () => {
    for (const id of ['warp_stone', 'majestic_leap']) {
      const G = freshReadyGame();
      G.players['0'].deck = [];
      stackDeck(G, '0', ['golden_goose_egg', 'unit_ghoul']);
      const card = giveCard(G, '0', id);
      G.players['0'].souls = 20;
      expect(playBlocked(G, '0', card.iid), id).toBe('nothing');
      expect(perform(G, '0', { type: 'playCard', cardIid: card.iid }), id).toBe(INVALID);
      stackDeck(G, '0', ['hero_kelvin']);
      expect(playBlocked(G, '0', card.iid), id).toBeNull();
    }
  });

  it('Majestic Leap draws 2 heroes, then its player owes a discard of 1 of their choice', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.deck = [];
    const [mo, egg, kelvin, seven] = stackDeck(G, '0', ['hero_mo_krill', 'golden_goose_egg', 'hero_kelvin', 'hero_seven']);
    const keep = giveCard(G, '0', 'extra_health');
    useItem(G, '0', 'majestic_leap');
    expect(me.hand.map((c) => c.iid)).toEqual(expect.arrayContaining([mo.iid, kelvin.iid, keep.iid]));
    expect(me.deck.map((c) => c.iid)).toEqual([seven.iid, egg.iid]);
    expect(G.pendingDiscard).toMatchObject({ pid: '0', count: 1, cardId: 'majestic_leap' });
    expect(perform(G, '0', { type: 'discard', cardIids: [keep.iid] })).not.toBe(INVALID);
    expect(G.pendingDiscard).toBeUndefined();
    expect(me.discard.map((c) => c.iid)).toContain(keep.iid);
  });

  it('Majestic Leap with one hero left draws that one; a hero discarded goes back into the deck', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.deck = [];
    const [egg, kelvin] = stackDeck(G, '0', ['golden_goose_egg', 'hero_kelvin']);
    useItem(G, '0', 'majestic_leap');
    expect(kelvin.zone).toBe('hand');
    expect(me.deck.map((c) => c.iid)).toEqual([egg.iid]);
    expect(perform(G, '0', { type: 'discard', cardIids: [kelvin.iid] })).not.toBe(INVALID);
    expect(kelvin.zone).toBe('deck');
    expect(me.deck.map((c) => c.iid)).toContain(kelvin.iid);
  });

  it('Warp Stone and Majestic Leap are priced for one play (1 and 2 souls, Vitality tier 3)', () => {
    expect(CARDS_BY_ID['warp_stone']).toMatchObject({ type: 'spell', slot: 'vitality', tier: 3 });
    expect(CARDS_BY_ID['majestic_leap']).toMatchObject({ type: 'spell', slot: 'vitality', tier: 3 });
    expect(itemPrice('warp_stone')).toBe(1);
    expect(itemPrice('majestic_leap')).toBe(2);
  });

  it('Divine Barrier cleanses every debuff but Stun and shields 7, as Guardian Ward, its component, does', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    addStatus(G, haze, 'bleed', 2, 3);
    addStatus(G, haze, 'silenced', 1, 2);
    addStatus(G, haze, 'stun', 1, 1);
    // A Stunned hero uses nothing: a bench ally wears it.
    useItem(G, '0', 'divine_barrier', haze.iid);
    expect(status(haze, 'bleed')).toBeUndefined();
    expect(status(haze, 'silenced')).toBeUndefined();
    expect(status(haze, 'stun')).toBeDefined();
    expect(status(haze, 'shield')?.value).toBe(7);
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

  // Since 2026-11-16 Vortex Web is the cheap pull (Pokémon's Boss's Orders).
  it('Vortex Web pulls an enemy bench hero into their Active slot, hits it for 2 and Roots it 1 turn', () => {
    const G = freshReadyGame();
    const enemy = G.players['1'];
    const front = enemy.active!;
    const pulled = enemy.bench.find((b): b is CardInstance => !!b)!;
    pulled.hpMax = 20; pulled.hp = 20;
    useItem(G, '0', 'vortex_web', pulled.iid);
    expect(enemy.active).toBe(pulled);
    expect(enemy.bench).toContain(front);
    expect(pulled.hp).toBe(18); // 2 spirit, the Active's Spirit 0
    expect(status(pulled, 'rooted')).toMatchObject({ duration: 1 });
  });

  /** P0 with Lash stepped up to the Active slot (a Retreat): an Active with a
   *  skill and an ultimate, and the souls left for her skill. */
  function lashAtTheFront() {
    const G = freshReadyGame();
    const ps = G.players['0'];
    const lash = ps.bench[1]!;
    ps.souls = 1 + 3; // Haze's retreat, and some to spare
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 2, toSlot: 0 })).not.toBe(INVALID);
    expect(ps.active).toBe(lash);
    return { G, lash };
  }

  it("Refresher ends your Active's skill and ultimate waits and brings a charged skill's charges back — a bench hero's stay, and the card is spent", () => {
    const { G, lash } = lashAtTheFront();
    lash.cooldowns = { skill_lash: 1, eff_ult_lash: 3 };
    const paige = G.players['0'].bench[2]!;
    paige.cooldowns = { skill_paige: 1 }; // a bench hero's are its own
    const refresher = useItem(G, '0', 'refresher');
    expect(lash.cooldowns?.skill_lash ?? 0).toBe(0);
    expect(lash.cooldowns?.eff_ult_lash ?? 0).toBe(0);
    expect(G.players['0'].discard).toContain(refresher); // a spell: one play, then the discard pile
    expect(refresher.cooldowns).toBeUndefined();
    expect(paige.cooldowns).toEqual({ skill_paige: 1 });
    // A charged skill short of its charges is back at full.
    const kelvin = makeHero('hero_kelvin', '0', 'active', 0);
    kelvin.chargesSpent = { skill_kelvin: 2 };
    kelvin.cooldowns = { skill_kelvin: 3 };
    G.players['0'].active = kelvin;
    useItem(G, '0', 'refresher');
    expect(kelvin.chargesSpent).toBeUndefined();
    expect(kitCharges(kelvin)).toEqual({ max: 2, left: 2 });
  });

  it('Refresher readies your Active for this very turn', () => {
    // Paige at the front, whose Plot Armor is used from the Active. (Lash was until
    // 2026-11-17: his skill is now Grapple, used from the bench only.)
    const G = freshReadyGame();
    const ps = G.players['0'];
    const paige = ps.bench[2]!;
    ps.souls = 1; // Haze's retreat
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 3, toSlot: 0 })).not.toBe(INVALID);
    expect(ps.active).toBe(paige);
    paige.cooldowns = { skill_paige: 1 };
    const skill = { type: 'useSkill' as const, heroIid: paige.iid, targetIid: paige.iid };
    expect(blocked(G, '0', skill)).toBe('cooldown');
    useItem(G, '0', 'refresher');
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
    useItem(G, '0', 'debuff_remover', haze.iid);
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
