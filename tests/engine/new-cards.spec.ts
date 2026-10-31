/**
 * The cards added and moved in the card-design pass (docs/card-design.md):
 * movement / protection / draw spells, the passive items that were spells, and
 * the two bench target filters Warp Stone and Phantom Strike aim with.
 *
 * Board (freshReadyGame): P0 Haze (active) · Vindicta / Lash / Paige;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, SPELLS, EQUIPMENT } from '@/cards';
import { addStatus } from '@/engine/statusOps';
import { INVALID, perform } from '@/engine/engine';
import { attackTargets, playBlocked } from '@/engine/legality';
import { targetsFor } from '@/engine/query';
import { fireTriggers } from '@/engine/triggers';
import { freshReadyGame, nextTestIid } from './_helpers';

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

  it('spells stay in the 1–6 band and no two cards share an id', () => {
    for (const s of SPELLS) expect(s.cost, s.id).toBeLessThanOrEqual(6);
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

describe('New spells', () => {
  it('Guardian Ward shields an ally 3', () => {
    const G = freshReadyGame();
    const paige = G.players['0'].bench[2]!;
    expect(play(G, 'guardian_ward', paige.iid)).not.toBe(INVALID);
    expect(status(paige, 'shield')?.value).toBe(3);
  });

  it('Warp Stone swaps a bench ally in with Bullet Resist 3 for 2 turns', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const lash = G.players['0'].bench[1]!;
    expect(play(G, 'warp_stone', lash.iid)).not.toBe(INVALID);
    expect(G.players['0'].active!.iid).toBe(lash.iid);
    expect(G.players['0'].bench[1]!.iid).toBe(haze.iid);
    expect(status(lash, 'bullet_resist')).toMatchObject({ value: 3, duration: 2 });
  });

  it('Warp Stone cannot be aimed at the Active or an enemy', () => {
    const G = freshReadyGame();
    const card = inHand(G, '0', 'warp_stone');
    expect(playBlocked(G, '0', card.iid, G.players['0'].active!.iid)).toBe('target');
    expect(playBlocked(G, '0', card.iid, G.players['1'].bench[0]!.iid)).toBe('target');
  });

  it('Divine Barrier cleanses every debuff but Stun and shields 4', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    addStatus(G, haze, 'bleed', 2, 3);
    addStatus(G, haze, 'silenced', 1, 2);
    addStatus(G, haze, 'stun', 1, 1);
    expect(play(G, 'divine_barrier', haze.iid)).not.toBe(INVALID);
    expect(status(haze, 'bleed')).toBeUndefined();
    expect(status(haze, 'silenced')).toBeUndefined();
    expect(status(haze, 'stun')).toBeDefined();
    expect(status(haze, 'shield')?.value).toBe(4);
  });

  it('Ethereal Shift puts a Dome up: the rival cannot attack that hero', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    expect(play(G, 'ethereal_shift', haze.iid)).not.toBe(INVALID);
    expect(status(haze, 'dome')).toBeDefined();
    expect(status(haze, 'spirit_power')).toMatchObject({ value: 1, duration: 2 });
    expect(attackTargets(G, '1')).toEqual([]);
  });

  it('Phantom Strike drags a bench hero to the front, hits it and disarms it', () => {
    const G = freshReadyGame();
    const abrams = G.players['1'].active!;
    const kelvin = G.players['1'].bench[1]!;
    const hp0 = kelvin.hp;
    expect(play(G, 'phantom_strike', kelvin.iid)).not.toBe(INVALID);
    expect(G.players['1'].active!.iid).toBe(kelvin.iid);
    expect(G.players['1'].bench[1]!.iid).toBe(abrams.iid);
    expect(kelvin.hp).toBeLessThan(hp0);
    expect(status(kelvin, 'disarm')).toBeDefined();
  });

  it('Vortex Web hits every enemy hero and roots them for 2 turns', () => {
    const G = freshReadyGame();
    const foes = [G.players['1'].active!, ...G.players['1'].bench.filter((b): b is CardInstance => !!b)];
    for (const f of foes) { f.hpMax = 20; f.hp = 20; }
    expect(play(G, 'vortex_web')).not.toBe(INVALID);
    for (const f of foes) {
      expect(f.hp, f.cardId).toBeLessThan(20);
      expect(status(f, 'rooted'), f.cardId).toMatchObject({ duration: 2 });
    }
  });

  it('Refresher draws 2', () => {
    const G = freshReadyGame();
    const before = G.players['0'].hand.length;
    expect(play(G, 'refresher')).not.toBe(INVALID);
    // The Refresher left the hand; two cards came in.
    expect(G.players['0'].hand.length).toBe(before + 2);
  });

  it('Dispel Magic cleanses, shields 2, and heals 3 only when it removed something', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 10; haze.hp = 5;
    expect(play(G, 'debuff_remover', haze.iid)).not.toBe(INVALID);
    expect(haze.hp).toBe(5);
    addStatus(G, haze, 'bleed', 1, 2);
    expect(play(G, 'debuff_remover', haze.iid)).not.toBe(INVALID);
    expect(status(haze, 'bleed')).toBeUndefined();
    expect(haze.hp).toBe(8);
  });
});

describe('New and moved equipment', () => {
  it('Long Range lets the bearer aim at the enemy bench', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    expect(ids(attackTargets(G, '0'))).toEqual(['hero_abrams']);
    wear(haze, 'long_range');
    expect(ids(attackTargets(G, '0'))).toEqual(['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven']);
  });

  it('Healbane stops the struck enemy healing for 2 turns', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const abrams = G.players['1'].active!;
    wear(haze, 'healbane');
    fireTriggers(G, haze, 'onBearerSkillDamage', { reaction: true, target: abrams, amount: 2, movingPlayer: '0' });
    expect(status(abrams, 'healing_boost_down')).toMatchObject({ duration: 2 });
  });

  it('Fortitude heals its bearer 2 at the start of the turn', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 10; haze.hp = 5;
    wear(haze, 'fortitude');
    fireTriggers(G, haze, 'startOfTurn', { reaction: true, movingPlayer: '0' });
    expect(haze.hp).toBe(7);
  });
});
