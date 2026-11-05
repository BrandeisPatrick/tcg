/**
 * The cards added on 2026-10-30 (docs/card-design.md): fourteen canon active
 * items (spells: worn by a hero and used with `activate`, the bearer's one
 * ability of the turn), eight passive items (equipment), the Return Fire
 * status, the `debuffDuration` hook, and the two tuning changes (Crippling
 * Headshot, Warp Stone).
 *
 * Board (freshReadyGame): P0 Haze (active) · Vindicta / Lash / Paige;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, ItemCard, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { ABILITIES_BY_ID } from '@/abilities';
import { addStatus } from '@/engine/statusOps';
import { INVALID, perform } from '@/engine/engine';
import { attackTargets, blocked } from '@/engine/legality';
import { attackPower, effectiveSpirit, itemPrice } from '@/engine/query';
import { fireTriggers } from '@/engine/triggers';
import { PRICE } from '@/engine/constants';
import { statusOfKeyword } from '@/ui/card/RuleText';
import { freshReadyGame, giveItem, makeAttack, useItem } from './_helpers';

const status = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id);
const board = (G: GameState, pid: PlayerID) =>
  [G.players[pid].active!, ...G.players[pid].bench.filter((b): b is CardInstance => !!b)];
/** Give every hero of `pid` a deep, even HP pool so a test's numbers read plainly. */
function hpPool(G: GameState, pid: PlayerID, hp = 20) {
  for (const c of board(G, pid)) { c.hpMax = hp; c.hp = hp; }
}

const NEW_SPELLS = [
  'golden_goose_egg', 'grit', 'return_fire', 'fleetfoot', 'split_shot', 'blood_tribute', 'healing_nova',
  'rescue_beam', 'fury_trance', 'alchemical_fire', 'heroic_aura', 'shadow_weave', 'infuser', 'arctic_blast',
];
const NEW_ITEMS = [
  'headshot_booster', 'spirit_strike', 'mystic_vulnerability', 'mystic_slow', 'slowing_bullets',
  'debuff_reducer', 'spirit_snatch', 'spiritual_overflow',
];

describe('Card types follow the active / passive rule', () => {
  it('every new active item is a spell and every new passive item is equipment', () => {
    for (const id of NEW_SPELLS) expect(CARDS_BY_ID[id]?.type, id).toBe('spell');
    for (const id of NEW_ITEMS) expect(CARDS_BY_ID[id]?.type, id).toBe('equipment');
  });

  it('each card runs the ability named after it, and that ability is registered', () => {
    for (const id of [...NEW_SPELLS, ...NEW_ITEMS]) {
      const card = CARDS_BY_ID[id] as { abilities?: string[] };
      expect(card.abilities, id).toEqual([`eff_${id}`]);
      expect(ABILITIES_BY_ID[`eff_${id}`], id).toBeDefined();
    }
  });

  it('every new item sits on a shop tab at a tier, and is priced by its tier', () => {
    for (const id of [...NEW_SPELLS, ...NEW_ITEMS]) {
      const item = CARDS_BY_ID[id] as ItemCard;
      expect(['weapon', 'spirit', 'vitality'], id).toContain(item.slot);
      expect([1, 2, 3, 4], id).toContain(item.tier);
      expect(itemPrice(id), id).toBe(PRICE[item.tier]);
    }
  });

  it('Return Fire is a status the rule text bolds and explains', () => {
    expect(statusOfKeyword('Return Fire', ' 2 for 2 turns')).toEqual({ id: 'return_fire', value: 2 });
    expect(statusOfKeyword('Root', ' the target')).toEqual({ id: 'rooted', value: undefined });
  });
});

describe('Tuning', () => {
  it('Crippling Headshot adds +2 Bullet Power to its bearer', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const atk0 = haze.atkMod;
    giveItem(G, haze, 'crippling_headshot');
    expect(haze.atkMod).toBe(atk0 + 2);
  });

  it("Warp Stone is a tier 3 Vitality item at its tier's price", () => {
    expect(CARDS_BY_ID['warp_stone']).toMatchObject({ type: 'spell', slot: 'vitality', tier: 3 });
    expect(itemPrice('warp_stone')).toBe(PRICE[3]);
  });
});

describe('Return Fire', () => {
  it('the item gives your Active Return Fire 2 for 2 turns', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    useItem(G, '0', 'return_fire');
    expect(status(haze, 'return_fire')).toMatchObject({ value: 2, duration: 2 });
  });

  it('an enemy attack that hits the bearer costs the attacker 2 bullet damage', () => {
    const G = freshReadyGame();
    hpPool(G, '0', 30);
    hpPool(G, '1', 30);
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    useItem(G, '0', 'return_fire');
    const swing = attackPower(abrams, haze).total;
    makeAttack(G, '1');
    expect(haze.hp).toBe(30 - swing);
    expect(abrams.hp).toBe(28);
  });

  it('the return shot is a proc: it never chains, and sets off none of the bearer\'s on-attack gear', () => {
    const G = freshReadyGame();
    hpPool(G, '0', 30);
    hpPool(G, '1', 30);
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    addStatus(G, haze, 'return_fire', 2, 2);
    addStatus(G, abrams, 'return_fire', 2, 2);
    // Restorative Shot would heal Haze 1 if her return shot counted as an attack.
    giveItem(G, haze, 'restorative_shot');
    const swing = attackPower(abrams, haze).total;
    makeAttack(G, '1');
    expect(haze.hp).toBe(30 - swing); // Abrams' Return Fire did not answer hers
    expect(abrams.hp).toBe(28);
  });

  it('a bearer the swing drops does not shoot back', () => {
    const G = freshReadyGame();
    hpPool(G, '1', 30);
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    addStatus(G, haze, 'return_fire', 2, 2);
    haze.hp = 1;
    makeAttack(G, '1');
    expect(abrams.hp).toBe(30);
  });
});

describe('New active items', () => {
  it('Golden Goose Egg gains 2 souls and +1 max HP on your Active', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    G.players['0'].souls = 3;
    const { hp, hpMax } = haze;
    useItem(G, '0', 'golden_goose_egg'); // an item costs nothing to use
    expect(G.players['0'].souls).toBe(3 + 2);
    expect(haze.hpMax).toBe(hpMax + 1);
    expect(haze.hp).toBe(hp + 1);
  });

  it('Grit shields your Active 2, whoever wears it', () => {
    const G = freshReadyGame();
    const vindicta = G.players['0'].bench[0]!;
    useItem(G, '0', 'grit', undefined, vindicta);
    expect(status(G.players['0'].active!, 'shield')?.value).toBe(2);
    expect(status(vindicta, 'shield')).toBeUndefined();
  });

  it('Fleetfoot grants Extra Attack 1 and Swift (lane-combos.spec has the free Retreat); a Root stays', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    addStatus(G, haze, 'rooted', 1, 2);
    useItem(G, '0', 'fleetfoot');
    expect(status(haze, 'extra_attack')?.value).toBe(1);
    expect(status(haze, 'swift')).toMatchObject({ value: 1, duration: 1 });
    expect(status(haze, 'rooted')).toBeDefined(); // the un-Root went in the 2026-11-03 rework
  });

  it('Split Shot gives your Active Ricochet 1 this turn and shoots nothing itself (ricochet.spec has the bounce)', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    const haze = G.players['0'].active!;
    useItem(G, '0', 'split_shot');
    expect(status(haze, 'ricochet')).toMatchObject({ value: 1, duration: 1 });
    for (const c of board(G, '1')) expect(c.hp, c.cardId).toBe(20);
  });

  it('Blood Tribute pays 3 HP (never below 1) for Extra Attack 1 and +1 Bullet Power this turn', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 10; haze.hp = 10;
    useItem(G, '0', 'blood_tribute');
    expect(haze.hp).toBe(7);
    expect(status(haze, 'extra_attack')?.value).toBe(1);
    expect(status(haze, 'weapon_power')).toMatchObject({ value: 1, duration: 1 });
    // One use a hero a turn: the next two are worn on the bench, and the price
    // is still your Active's.
    haze.hp = 2;
    useItem(G, '0', 'blood_tribute', undefined, G.players['0'].bench[0]!);
    expect(haze.hp).toBe(1);
    useItem(G, '0', 'blood_tribute', undefined, G.players['0'].bench[1]!);
    expect(haze.hp).toBe(1);
  });

  it('Healing Nova heals every ally 5 and no enemy', () => {
    const G = freshReadyGame();
    hpPool(G, '0');
    hpPool(G, '1');
    for (const c of [...board(G, '0'), ...board(G, '1')]) c.hp = 15;
    useItem(G, '0', 'healing_nova');
    for (const c of board(G, '0')) expect(c.hp, c.cardId).toBe(20);
    for (const c of board(G, '1')) expect(c.hp, c.cardId).toBe(15);
  });

  it('Rescue Beam swaps a bench ally in and heals the hero it rescues 4', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const lash = G.players['0'].bench[1]!;
    haze.hpMax = 20; haze.hp = 10;
    useItem(G, '0', 'rescue_beam', lash.iid);
    expect(G.players['0'].active!.iid).toBe(lash.iid);
    expect(G.players['0'].bench[1]!.iid).toBe(haze.iid);
    expect(haze.hp).toBe(14);
  });

  it('Rescue Beam needs a bench ally to aim at', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const item = giveItem(G, haze, 'rescue_beam');
    const a = { type: 'activate' as const, itemIid: item.iid, targetIid: haze.iid };
    expect(blocked(G, '0', a)).toBe('target');
    expect(perform(G, '0', a)).toBe(INVALID);
  });

  it('Fury Trance grants Extra Attack 1 and Spirit Resist 3, and silences its own hero', () => {
    const G = freshReadyGame();
    // Lash has a skill to lose (Haze's kit is a passive). The two items are
    // worn on the bench, so Lash's own ability of the turn is still unspent.
    const [vindicta, lash, paige] = G.players['0'].bench as CardInstance[];
    const abrams = G.players['1'].active!;
    useItem(G, '0', 'warp_stone', lash.iid, vindicta);
    const skill = { type: 'useSkill' as const, heroIid: lash.iid, targetIid: abrams.iid };
    expect(blocked(G, '0', skill)).toBeNull();
    useItem(G, '0', 'fury_trance', undefined, paige);
    expect(status(lash, 'extra_attack')?.value).toBe(1);
    expect(status(lash, 'spirit_resist')).toMatchObject({ value: 3, duration: 2 });
    expect(status(lash, 'silenced')).toMatchObject({ duration: 2 });
    expect(blocked(G, '0', skill)).toBe('status');
  });

  it('Alchemical Fire burns every enemy for 1 + Spirit and strips Bullet Resist 2', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    const haze = G.players['0'].active!;
    haze.spiritMod = 2;
    useItem(G, '0', 'alchemical_fire');
    for (const c of board(G, '1')) {
      expect(c.hp, c.cardId).toBe(20 - 3);
      expect(status(c, 'bullet_resist_down'), c.cardId).toMatchObject({ value: 2, duration: 2 });
    }
  });

  it('Heroic Aura gives every ally +2 Bullet Power and Bullet Resist 1 for 2 turns', () => {
    const G = freshReadyGame();
    useItem(G, '0', 'heroic_aura');
    for (const c of board(G, '0')) {
      expect(status(c, 'weapon_power'), c.cardId).toMatchObject({ value: 2, duration: 2 });
      expect(status(c, 'bullet_resist'), c.cardId).toMatchObject({ value: 1, duration: 2 });
    }
    for (const c of board(G, '1')) expect(status(c, 'weapon_power'), c.cardId).toBeUndefined();
  });

  it('Shadow Weave puts a Dome up for 1 turn and +2 Bullet Power for 2', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    useItem(G, '0', 'shadow_weave');
    expect(status(haze, 'dome')).toMatchObject({ duration: 1 });
    expect(status(haze, 'weapon_power')).toMatchObject({ value: 2, duration: 2 });
    expect(attackTargets(G, '1')).toEqual([]);
  });

  it('Infuser gives your Active +3 Spirit Power for 2 turns and heals it 3', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 20; haze.hp = 10;
    useItem(G, '0', 'infuser');
    expect(status(haze, 'spirit_power')).toMatchObject({ value: 3, duration: 2 });
    expect(haze.hp).toBe(13);
  });

  it('Arctic Blast hits every enemy for 2 + Spirit and stuns only the enemy Active', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    useItem(G, '0', 'arctic_blast');
    const spi = effectiveSpirit(G.players['0'].active!);
    for (const c of board(G, '1')) expect(c.hp, c.cardId).toBe(20 - 2 - spi);
    expect(status(G.players['1'].active!, 'stun')).toMatchObject({ duration: 1 });
    for (const b of board(G, '1').slice(1)) expect(status(b, 'stun'), b.cardId).toBeUndefined();
  });
});

describe('New equipment', () => {
  it('Headshot Booster adds 2 to a swing at a full-HP enemy, and nothing once it is hurt', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    const bare = attackPower(haze, abrams).total;
    giveItem(G, haze, 'headshot_booster');
    const full = attackPower(haze, abrams);
    expect(full.total).toBe(bare + 2);
    expect(full.parts.some((p) => p.label.startsWith('Headshot Booster'))).toBe(true);
    abrams.hp -= 1;
    expect(attackPower(haze, abrams).total).toBe(bare);
    // The card face asks with no target: no bonus to show.
    expect(attackPower(haze).total).toBe(bare);
  });

  it('Spirit Strike: an attack applies Spirit Resist −1 for 2 turns', () => {
    const G = freshReadyGame();
    hpPool(G, '1', 30);
    giveItem(G, G.players['0'].active!, 'spirit_strike');
    makeAttack(G, '0');
    expect(status(G.players['1'].active!, 'spirit_resist_down')).toMatchObject({ value: 1, duration: 2 });
  });

  it('Mystic Vulnerability: the bearer\'s item damage applies Spirit Resist −1 for 2 turns', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    giveItem(G, G.players['0'].active!, 'mystic_vulnerability');
    useItem(G, '0', 'cold_front', G.players['1'].active!.iid);
    expect(status(G.players['1'].active!, 'spirit_resist_down')).toMatchObject({ value: 1, duration: 2 });
  });

  it('Mystic Slow: the bearer\'s item damage Roots the enemy for 1 turn', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    giveItem(G, G.players['0'].active!, 'mystic_slow');
    useItem(G, '0', 'cold_front', G.players['1'].active!.iid);
    expect(status(G.players['1'].active!, 'rooted')).toMatchObject({ duration: 1 });
  });

  it('Slowing Bullets: an attack Roots the target for 1 turn', () => {
    const G = freshReadyGame();
    hpPool(G, '1', 30);
    giveItem(G, G.players['0'].active!, 'slowing_bullets');
    makeAttack(G, '0');
    expect(status(G.players['1'].active!, 'rooted')).toMatchObject({ duration: 1 });
  });

  it('Debuff Reducer: a debuff lands 1 turn shorter, never under 1; buffs and permanent marks are untouched', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    giveItem(G, haze, 'debuff_reducer');
    addStatus(G, haze, 'bleed', 1, 3);
    addStatus(G, haze, 'silenced', 1, 2);
    addStatus(G, haze, 'stun', 1, 1);
    addStatus(G, haze, 'bullet_resist', 2, 2);
    addStatus(G, haze, 'fixation', 1, 99);
    addStatus(G, haze, 'charged', 1, 2); // a shorter fuse would only stun sooner
    expect(status(haze, 'bleed')?.duration).toBe(2);
    expect(status(haze, 'silenced')?.duration).toBe(1);
    expect(status(haze, 'stun')?.duration).toBe(1);
    expect(status(haze, 'bullet_resist')?.duration).toBe(2);
    expect(status(haze, 'fixation')?.duration).toBe(99);
    expect(status(haze, 'charged')?.duration).toBe(2);
  });

  it('Spirit Snatch: the bearer\'s item damage moves 1 Spirit Power from the enemy to the bearer for 2 turns', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    abrams.spiritMod = 2;
    giveItem(G, haze, 'spirit_snatch');
    useItem(G, '0', 'cold_front', abrams.iid);
    expect(status(abrams, 'spirit_power_down')).toMatchObject({ value: 1, duration: 2 });
    expect(status(haze, 'spirit_power')).toMatchObject({ value: 1, duration: 2 });
    expect(effectiveSpirit(abrams)).toBe(1);
  });

  it('Spiritual Overflow: each swing adds +1 Spirit Power (up to +3) and heals 1', () => {
    const G = freshReadyGame();
    hpPool(G, '1', 30);
    const haze = G.players['0'].active!;
    haze.hpMax = 20; haze.hp = 10;
    giveItem(G, haze, 'spiritual_overflow');
    const fx0 = G.fx.length;
    makeAttack(G, '0');
    const swings = G.fx.slice(fx0).filter((e) => e.kind === 'swing' && e.iid === haze.iid).length;
    expect(swings).toBeGreaterThan(0);
    expect(status(haze, 'spirit_power')).toMatchObject({ value: Math.min(3, swings), duration: 2 });
    expect(haze.hp).toBe(10 + swings);
    for (let i = 0; i < 4; i++) fireTriggers(G, haze, 'onAttack', { reaction: true, movingPlayer: '0', target: G.players['1'].active! });
    expect(status(haze, 'spirit_power')?.value).toBe(3);
  });
});
