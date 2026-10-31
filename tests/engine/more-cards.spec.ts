/**
 * The cards added on 2026-10-30 (docs/card-design.md): fourteen canon active
 * items as spells, eight passive items as equipment, the Return Fire status,
 * the `debuffDuration` hook, and the two tuning changes (Crippling Headshot,
 * Warp Stone).
 *
 * Board (freshReadyGame): P0 Haze (active) · Vindicta / Lash / Paige;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { ABILITIES_BY_ID } from '@/abilities';
import { addStatus } from '@/engine/statusOps';
import { INVALID, perform } from '@/engine/engine';
import { attackTargets, blocked } from '@/engine/legality';
import { attackPower, effectiveSpirit } from '@/engine/query';
import { fireTriggers } from '@/engine/triggers';
import { statusOfKeyword } from '@/ui/card/RuleText';
import { freshReadyGame, makeAttack, nextTestIid } from './_helpers';

/** Put a copy of `cardId` in `pid`'s hand with souls to spare; returns it. */
function inHand(G: GameState, pid: PlayerID, cardId: string): CardInstance {
  const card = {
    iid: nextTestIid('h'), cardId, ownerId: pid, zone: 'hand' as const, attached: [],
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  };
  G.players[pid].hand.push(card);
  G.players[pid].souls = 10;
  return card;
}

function play(G: GameState, cardId: string, targetIid?: string) {
  const card = inHand(G, '0', cardId);
  return perform(G, '0', { type: 'playCard', cardIid: card.iid, targetIid });
}

function wear(hero: CardInstance, cardId: string) {
  hero.attached = [...(hero.attached ?? []), {
    iid: nextTestIid('e'), cardId, ownerId: hero.ownerId, zone: 'equipment' as CardInstance['zone'], attached: [],
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
  }];
}

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

  it('the spells stay in the 1–6 band, rarity capped at 3', () => {
    for (const id of NEW_SPELLS) {
      const s = CARDS_BY_ID[id] as { cost: number; rarity: number };
      expect(s.cost, id).toBeGreaterThanOrEqual(1);
      expect(s.cost, id).toBeLessThanOrEqual(6);
      expect(s.rarity, id).toBeLessThanOrEqual(3);
    }
  });

  it('Return Fire is a status the rule text bolds and explains', () => {
    expect(statusOfKeyword('Return Fire', ' 2 for 2 turns')).toEqual({ id: 'return_fire', value: 2 });
    expect(statusOfKeyword('Root', ' the target')).toEqual({ id: 'rooted', value: undefined });
  });
});

describe('Tuning', () => {
  it('Crippling Headshot adds +1 Bullet Power to its bearer', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const atk0 = haze.atkMod;
    expect(play(G, 'crippling_headshot', haze.iid)).not.toBe(INVALID);
    expect(haze.atkMod).toBe(atk0 + 1);
  });

  it('Warp Stone costs 6', () => {
    expect((CARDS_BY_ID['warp_stone'] as { cost: number }).cost).toBe(6);
  });
});

describe('Return Fire', () => {
  it('the spell gives your Active Return Fire 2 for 2 turns', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    expect(play(G, 'return_fire')).not.toBe(INVALID);
    expect(status(haze, 'return_fire')).toMatchObject({ value: 2, duration: 2 });
  });

  it('an enemy attack that hits the bearer costs the attacker 2 bullet damage', () => {
    const G = freshReadyGame();
    hpPool(G, '0', 30);
    hpPool(G, '1', 30);
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    expect(play(G, 'return_fire')).not.toBe(INVALID);
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
    wear(haze, 'restorative_shot');
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

describe('New spells', () => {
  it('Golden Goose Egg gains 2 souls and +1 max HP on your Active', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const card = inHand(G, '0', 'golden_goose_egg');
    G.players['0'].souls = 3;
    const { hp, hpMax } = haze;
    expect(perform(G, '0', { type: 'playCard', cardIid: card.iid })).not.toBe(INVALID);
    expect(G.players['0'].souls).toBe(3 - 1 + 2);
    expect(haze.hpMax).toBe(hpMax + 1);
    expect(haze.hp).toBe(hp + 1);
  });

  it('Grit shields your Active 2', () => {
    const G = freshReadyGame();
    expect(play(G, 'grit')).not.toBe(INVALID);
    expect(status(G.players['0'].active!, 'shield')?.value).toBe(2);
  });

  it('Fleetfoot grants Extra Attack 1 and lifts Rooted', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    addStatus(G, haze, 'rooted', 1, 2);
    expect(play(G, 'fleetfoot')).not.toBe(INVALID);
    expect(status(haze, 'rooted')).toBeUndefined();
    expect(status(haze, 'extra_attack')?.value).toBe(1);
  });

  it('Split Shot hits every enemy bench hero for your Active\'s swing, and only the bench', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    const bench = board(G, '1').slice(1);
    haze.atkMod = 2; // Haze swings for 5: half of it, 2, lands on each bench hero
    const want = bench.map((b) => 20 - Math.floor(attackPower(haze, b).total / 2));
    expect(play(G, 'split_shot')).not.toBe(INVALID);
    expect(bench.map((b) => b.hp)).toEqual(want);
    for (const b of bench) expect(b.hp, b.cardId).toBeLessThan(20);
    expect(abrams.hp).toBe(20);
  });

  it('Blood Tribute pays 3 HP (never below 1) for Extra Attack 1 and +1 Bullet Power this turn', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 10; haze.hp = 10;
    expect(play(G, 'blood_tribute')).not.toBe(INVALID);
    expect(haze.hp).toBe(7);
    expect(status(haze, 'extra_attack')?.value).toBe(1);
    expect(status(haze, 'weapon_power')).toMatchObject({ value: 1, duration: 1 });
    haze.hp = 2;
    expect(play(G, 'blood_tribute')).not.toBe(INVALID);
    expect(haze.hp).toBe(1);
    expect(play(G, 'blood_tribute')).not.toBe(INVALID);
    expect(haze.hp).toBe(1);
  });

  it('Healing Nova heals every ally 3 and no enemy', () => {
    const G = freshReadyGame();
    hpPool(G, '0');
    hpPool(G, '1');
    for (const c of [...board(G, '0'), ...board(G, '1')]) c.hp = 15;
    expect(play(G, 'healing_nova')).not.toBe(INVALID);
    for (const c of board(G, '0')) expect(c.hp, c.cardId).toBe(18);
    for (const c of board(G, '1')) expect(c.hp, c.cardId).toBe(15);
  });

  it('Rescue Beam swaps a bench ally in and heals the hero it rescues 4', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const lash = G.players['0'].bench[1]!;
    haze.hpMax = 20; haze.hp = 10;
    expect(play(G, 'rescue_beam', lash.iid)).not.toBe(INVALID);
    expect(G.players['0'].active!.iid).toBe(lash.iid);
    expect(G.players['0'].bench[1]!.iid).toBe(haze.iid);
    expect(haze.hp).toBe(14);
  });

  it('Rescue Beam needs a bench ally to aim at', () => {
    const G = freshReadyGame();
    expect(play(G, 'rescue_beam', G.players['0'].active!.iid)).toBe(INVALID);
  });

  it('Fury Trance grants Extra Attack 1 and Spirit Resist 3, and silences its own hero', () => {
    const G = freshReadyGame();
    // Lash has a skill to lose (Haze's kit is a passive).
    const lash = G.players['0'].bench[1]!;
    const abrams = G.players['1'].active!;
    expect(play(G, 'warp_stone', lash.iid)).not.toBe(INVALID);
    const skill = { type: 'useSkill' as const, heroIid: lash.iid, targetIid: abrams.iid };
    expect(blocked(G, '0', skill)).toBeNull();
    expect(play(G, 'fury_trance')).not.toBe(INVALID);
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
    expect(play(G, 'alchemical_fire')).not.toBe(INVALID);
    for (const c of board(G, '1')) {
      expect(c.hp, c.cardId).toBe(20 - 3);
      expect(status(c, 'bullet_resist_down'), c.cardId).toMatchObject({ value: 2, duration: 2 });
    }
  });

  it('Heroic Aura gives every ally +1 Bullet Power and Bullet Resist 1 for 2 turns', () => {
    const G = freshReadyGame();
    expect(play(G, 'heroic_aura')).not.toBe(INVALID);
    for (const c of board(G, '0')) {
      expect(status(c, 'weapon_power'), c.cardId).toMatchObject({ value: 1, duration: 2 });
      expect(status(c, 'bullet_resist'), c.cardId).toMatchObject({ value: 1, duration: 2 });
    }
    for (const c of board(G, '1')) expect(status(c, 'weapon_power'), c.cardId).toBeUndefined();
  });

  it('Shadow Weave puts a Dome up for 1 turn and +2 Bullet Power for 2', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    expect(play(G, 'shadow_weave')).not.toBe(INVALID);
    expect(status(haze, 'dome')).toMatchObject({ duration: 1 });
    expect(status(haze, 'weapon_power')).toMatchObject({ value: 2, duration: 2 });
    expect(attackTargets(G, '1')).toEqual([]);
  });

  it('Infuser gives your Active +3 Spirit Power for 2 turns and heals it 3', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 20; haze.hp = 10;
    expect(play(G, 'infuser')).not.toBe(INVALID);
    expect(status(haze, 'spirit_power')).toMatchObject({ value: 3, duration: 2 });
    expect(haze.hp).toBe(13);
  });

  it('Arctic Blast hits every enemy for 2 + Spirit and stuns only the enemy Active', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    expect(play(G, 'arctic_blast')).not.toBe(INVALID);
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
    wear(haze, 'headshot_booster');
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
    wear(G.players['0'].active!, 'spirit_strike');
    makeAttack(G, '0');
    expect(status(G.players['1'].active!, 'spirit_resist_down')).toMatchObject({ value: 1, duration: 2 });
  });

  it('Mystic Vulnerability: the bearer\'s spell damage applies Spirit Resist −1 for 2 turns', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    wear(G.players['0'].active!, 'mystic_vulnerability');
    expect(play(G, 'cold_front', G.players['1'].active!.iid)).not.toBe(INVALID);
    expect(status(G.players['1'].active!, 'spirit_resist_down')).toMatchObject({ value: 1, duration: 2 });
  });

  it('Mystic Slow: the bearer\'s spell damage Roots the enemy for 1 turn', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    wear(G.players['0'].active!, 'mystic_slow');
    expect(play(G, 'cold_front', G.players['1'].active!.iid)).not.toBe(INVALID);
    expect(status(G.players['1'].active!, 'rooted')).toMatchObject({ duration: 1 });
  });

  it('Slowing Bullets: an attack Roots the target for 1 turn', () => {
    const G = freshReadyGame();
    hpPool(G, '1', 30);
    wear(G.players['0'].active!, 'slowing_bullets');
    makeAttack(G, '0');
    expect(status(G.players['1'].active!, 'rooted')).toMatchObject({ duration: 1 });
  });

  it('Debuff Reducer: a debuff lands 1 turn shorter, never under 1; buffs and permanent marks are untouched', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    wear(haze, 'debuff_reducer');
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

  it('Spirit Snatch: the bearer\'s spell damage moves 1 Spirit Power from the enemy to the bearer for 2 turns', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    abrams.spiritMod = 2;
    wear(haze, 'spirit_snatch');
    expect(play(G, 'cold_front', abrams.iid)).not.toBe(INVALID);
    expect(status(abrams, 'spirit_power_down')).toMatchObject({ value: 1, duration: 2 });
    expect(status(haze, 'spirit_power')).toMatchObject({ value: 1, duration: 2 });
    expect(effectiveSpirit(abrams)).toBe(1);
  });

  it('Spiritual Overflow: each swing adds +1 Spirit Power (up to +3) and heals 1', () => {
    const G = freshReadyGame();
    hpPool(G, '1', 30);
    const haze = G.players['0'].active!;
    haze.hpMax = 20; haze.hp = 10;
    wear(haze, 'spiritual_overflow');
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
