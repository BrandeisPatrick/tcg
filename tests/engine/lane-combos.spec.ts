/**
 * Attacks are per hero (docs/engine-model.md, "The turn"): every hero may
 * attack once a turn while it stands in the Active slot, so a Retreat after the
 * swing brings in a hero with a swing of its own, and a hero that swung,
 * retreated and came back cannot swing again. With it, the cards of the
 * 2026-11-03 pass (docs/card-design.md) that play the swap: Sprint Boots and
 * Enduring Speed (the `retreatDiscount` hook, and Enduring Speed's `resists`),
 * Fleetfoot's Swift (a free Retreat), Kinetic Dash (the `onBearerStepIn`
 * trigger) and Majestic Leap (a free swap) — and the AI, which has to see that
 * the swap after the swing is worth its souls.
 *
 * Board (freshReadyGame): P0 Haze (active) · Vindicta / Lash / Paige;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven.
 * Most tests use `built`, which swaps P0's Lash and Paige for Shiv and Drifter
 * (passive-only, so no bench skill competes with the swap) and deepens every HP.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { ABILITIES_BY_ID } from '@/abilities';
import { RETREAT_COST } from '@/engine/constants';
import { resolve } from '@/engine/death';
import { INVALID, perform, type Action } from '@/engine/engine';
import { attackBlocked, legalActions, moveBlocked, retreatCost } from '@/engine/legality';
import { attackPower } from '@/engine/query';
import { addStatus, clearTurnFlags } from '@/engine/statusOps';
import { enumerateAIMoves } from '@/ai/heuristic';
import { statusOfKeyword } from '@/ui/card/RuleText';
import { freshReadyGame, makeAttack, makeHero, nextTestIid } from './_helpers';

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
/** Give every hero of `pid` a deep, even HP pool so nobody falls by accident. */
function hpPool(G: GameState, pid: PlayerID, hp = 30) {
  for (const c of board(G, pid)) { c.hpMax = hp; c.hp = hp; }
}
/** P0's Retreat: the bench hero in `slot` (1..3) steps in. */
const retreat = (G: GameState, slot: 1 | 2 | 3) => perform(G, '0', { type: 'moveHero', fromSlot: slot, toSlot: 0 });
const lastLog = (G: GameState) => G.log[G.log.length - 1]?.text;

/** A board where the swap after the swing matters: deep HP everywhere, P0's
 *  hand empty and a bench of passive-only heroes (Vindicta, Shiv, Drifter), so
 *  the attack and the Retreat are the only plays there are. */
function built(souls: number) {
  const G = freshReadyGame();
  const me = G.players['0'];
  me.bench = [me.bench[0], makeHero('hero_shiv', '0', 'bench', 2), makeHero('hero_drifter', '0', 'bench', 3)];
  hpPool(G, '0');
  hpPool(G, '1');
  me.hand = [];
  me.souls = souls;
  return { G, me, haze: me.active!, vindicta: me.bench[0]!, shiv: me.bench[1]!, abrams: G.players['1'].active! };
}

describe('Attacks are per hero', () => {
  it('attack, Retreat, and the hero who steps in attacks too', () => {
    const { G, me, haze, shiv, abrams } = built(2);
    makeAttack(G, '0');
    expect(haze.attackedThisTurn).toBe(true);
    expect(attackBlocked(G, '0')).toBe('used');
    const afterHaze = abrams.hp;
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(me.active!.iid).toBe(shiv.iid);
    expect(attackBlocked(G, '0')).toBeNull();
    expect(legalActions(G, '0').some((a) => a.type === 'attack')).toBe(true);
    makeAttack(G, '0');
    expect(abrams.hp).toBeLessThan(afterHaze);
    expect(shiv.attackedThisTurn).toBe(true);
    expect(G.attackUsed).toBe(true);
  });

  it('the hero that attacked cannot attack again after it comes back', () => {
    const { G, me, haze, abrams } = built(10);
    makeAttack(G, '0');
    expect(retreat(G, 2)).not.toBe(INVALID); // Shiv in, Haze to bench slot 2
    makeAttack(G, '0');
    expect(retreat(G, 2)).not.toBe(INVALID); // Haze back
    expect(me.active!.iid).toBe(haze.iid);
    expect(haze.attackedThisTurn).toBe(true); // kept on the bench
    expect(attackBlocked(G, '0')).toBe('used');
    const hp = abrams.hp;
    expect(perform(G, '0', { type: 'attack' })).toBe(INVALID);
    expect(abrams.hp).toBe(hp);
  });

  it('Turn 1 still has no attack, for the Active or the hero a Retreat brings in', () => {
    const { G } = built(2);
    G.turnNumber = 1;
    expect(attackBlocked(G, '0')).toBe('turn1');
    expect(retreat(G, 1)).not.toBe(INVALID);
    expect(attackBlocked(G, '0')).toBe('turn1');
  });

  it('a hero still does one or the other: the one that used its skill cannot attack, the one it swaps with can', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    const me = G.players['0'];
    me.souls = 10;
    const lash = me.bench[1]!;
    const abrams = G.players['1'].active!;
    expect(retreat(G, 2)).not.toBe(INVALID); // Lash in
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid, targetIid: abrams.iid })).not.toBe(INVALID);
    expect(attackBlocked(G, '0')).toBe('skill');
    expect(retreat(G, 2)).not.toBe(INVALID); // Haze back, fresh
    expect(attackBlocked(G, '0')).toBeNull();
    expect(me.active!.cardId).toBe('hero_haze');
  });

  it('the hero a promotion brings in after a death may attack; the promotion is free', () => {
    const { G, me, haze, shiv } = built(0);
    makeAttack(G, '0');
    haze.hp = 0;
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    expect(perform(G, '0', { type: 'promoteToActive', benchIid: shiv.iid })).not.toBe(INVALID);
    expect(me.souls).toBe(0);
    expect(attackBlocked(G, '0')).toBeNull();
  });
});

describe('The Retreat\'s price', () => {
  it('is RETREAT_COST with nothing worn', () => {
    const { G } = built(10);
    expect(retreatCost(G, '0')).toBe(RETREAT_COST);
    expect(RETREAT_COST).toBe(2);
  });

  it('Sprint Boots take a soul off: 1 soul is enough, 0 is not', () => {
    const { G, me, haze } = built(1);
    wear(haze, 'sprint_boots');
    expect(retreatCost(G, '0')).toBe(1);
    expect(moveBlocked(G, '0', 2, 0)).toBeNull();
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(me.souls).toBe(0);
    expect(lastLog(G)).toBe('P0 retreated (-1 soul).');
    // Back the other way the price is Shiv's, who wears nothing.
    expect(retreatCost(G, '0')).toBe(2);
    expect(moveBlocked(G, '0', 2, 0)).toBe('souls');
  });

  it('only what the hero leaving the slot wears counts', () => {
    const { G, shiv } = built(10);
    wear(shiv, 'sprint_boots');
    expect(retreatCost(G, '0')).toBe(2);
  });

  it('Sprint Boots and Enduring Speed together make it free', () => {
    const { G, me, haze } = built(0);
    wear(haze, 'sprint_boots');
    wear(haze, 'enduring_speed');
    expect(retreatCost(G, '0')).toBe(0);
    expect(retreat(G, 1)).not.toBe(INVALID);
    expect(me.souls).toBe(0);
    expect(lastLog(G)).toBe('P0 retreated (free).');
  });

  it('a Swift hero retreats free, once: the Retreat spends the Swift', () => {
    const { G, me, haze } = built(0);
    addStatus(G, haze, 'swift', 1, 1);
    expect(retreatCost(G, '0')).toBe(0);
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(me.souls).toBe(0);
    expect(status(haze, 'swift')).toBeUndefined();
    me.souls = 4;
    expect(retreat(G, 2)).not.toBe(INVALID); // Haze back in, paid for this time
    expect(me.souls).toBe(2);
    expect(retreatCost(G, '0')).toBe(2);
  });

  it('a free swap does not spend a Swift', () => {
    const { G, haze, shiv } = built(0);
    addStatus(G, haze, 'swift', 1, 1);
    expect(play(G, 'majestic_leap', shiv.iid)).not.toBe(INVALID);
    expect(status(haze, 'swift')).toBeDefined();
  });

  it('an unspent Swift goes when the turn ends, even stretched by Superior Duration', () => {
    const { G, me, haze } = built(10);
    wear(haze, 'superior_duration');
    expect(play(G, 'fleetfoot')).not.toBe(INVALID);
    expect(status(haze, 'swift')?.duration).toBe(2);
    clearTurnFlags(me);
    expect(status(haze, 'swift')).toBeUndefined();
  });
});

describe('Kinetic Dash: +1 Bullet Power for the hero that steps in', () => {
  it('fires on a Retreat', () => {
    const { G, shiv, abrams } = built(2);
    wear(shiv, 'kinetic_dash');
    const bare = attackPower(shiv, abrams).total;
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(status(shiv, 'weapon_power')).toMatchObject({ value: 1, duration: 1 });
    expect(attackPower(shiv, abrams).total).toBe(bare + 1);
  });

  it('fires on a card\'s swap (Warp Stone, Majestic Leap)', () => {
    for (const card of ['warp_stone', 'majestic_leap']) {
      const { G, shiv } = built(0);
      wear(shiv, 'kinetic_dash');
      expect(play(G, card, shiv.iid), card).not.toBe(INVALID);
      expect(G.players['0'].active!.iid, card).toBe(shiv.iid);
      expect(status(shiv, 'weapon_power'), card).toMatchObject({ value: 1, duration: 1 });
    }
  });

  it('does not fire on a promotion after a death, nor for a hero the rival drags to the front', () => {
    const { G, haze, shiv } = built(0);
    wear(shiv, 'kinetic_dash');
    haze.hp = 0;
    resolve(G);
    expect(perform(G, '0', { type: 'promoteToActive', benchIid: shiv.iid })).not.toBe(INVALID);
    expect(G.players['0'].active!.iid).toBe(shiv.iid);
    expect(status(shiv, 'weapon_power')).toBeUndefined();

    const H = built(0);
    const dynamo = H.G.players['1'].bench[0]!;
    wear(dynamo, 'kinetic_dash');
    expect(play(H.G, 'phantom_strike', dynamo.iid)).not.toBe(INVALID);
    expect(H.G.players['1'].active!.iid).toBe(dynamo.iid);
    expect(status(dynamo, 'weapon_power')).toBeUndefined();
  });

  it('does not fire on a bench shuffle', () => {
    const { G, shiv } = built(0);
    wear(shiv, 'kinetic_dash');
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 2, toSlot: 3 })).not.toBe(INVALID);
    expect(status(shiv, 'weapon_power')).toBeUndefined();
  });
});

describe('Enduring Speed cannot be Rooted', () => {
  it('a Root never lands on the bearer, and the log says what turned it away', () => {
    const { G, haze } = built(0);
    wear(haze, 'enduring_speed');
    const fx0 = G.fx.length;
    addStatus(G, haze, 'rooted', 1, 2);
    expect(status(haze, 'rooted')).toBeUndefined();
    expect(lastLog(G)).toBe('Haze resisted Rooted (Enduring Speed).');
    expect(G.fx.slice(fx0)).toEqual([expect.objectContaining({ kind: 'immune', iid: haze.iid, what: 'rooted' })]);
    // Every other status still lands.
    addStatus(G, haze, 'stun', 1, 1);
    expect(status(haze, 'stun')).toBeDefined();
  });

  it('Vortex Web hits the bearer but roots only the rest', () => {
    const { G } = built(0);
    const [abrams, ...rest] = board(G, '1');
    wear(abrams, 'enduring_speed');
    expect(play(G, 'vortex_web')).not.toBe(INVALID);
    expect(abrams.hp).toBeLessThan(30);
    expect(status(abrams, 'rooted')).toBeUndefined();
    for (const c of rest) expect(status(c, 'rooted'), c.cardId).toBeDefined();
  });
});

describe('Majestic Leap', () => {
  it('your Active retreats free and the bench ally you pick steps in — after a swing, a fresh attacker', () => {
    const { G, me, haze, shiv } = built(10);
    makeAttack(G, '0');
    expect(play(G, 'majestic_leap', shiv.iid)).not.toBe(INVALID);
    expect(me.souls).toBe(10 - 4); // the card's price, and no Retreat charge
    expect(me.active!.iid).toBe(shiv.iid);
    expect(me.bench[1]!.iid).toBe(haze.iid);
    expect(attackBlocked(G, '0')).toBeNull();
  });

  it('needs a bench ally to aim at, and a Root on either side holds it', () => {
    const { G, haze, shiv } = built(10);
    expect(play(G, 'majestic_leap', haze.iid)).toBe(INVALID);
    addStatus(G, haze, 'rooted', 1, 1);
    expect(play(G, 'majestic_leap', shiv.iid)).toBe(INVALID);
  });
});

describe('Fleetfoot', () => {
  it('Extra Attack 1 and a free Retreat: swing twice, swap for nothing, and the new Active swings', () => {
    const { G, me, haze, abrams } = built(10);
    expect(play(G, 'fleetfoot')).not.toBe(INVALID);
    expect(me.souls).toBe(7);
    expect(status(haze, 'extra_attack')?.value).toBe(1);
    expect(status(haze, 'swift')).toMatchObject({ value: 1, duration: 1 });
    const fx0 = G.fx.length;
    makeAttack(G, '0');
    expect(G.fx.slice(fx0).filter((e) => e.kind === 'swing' && e.iid === haze.iid).length).toBeGreaterThanOrEqual(2);
    expect(retreat(G, 1)).not.toBe(INVALID);
    expect(me.souls).toBe(7);
    const hp = abrams.hp;
    makeAttack(G, '0');
    expect(abrams.hp).toBeLessThan(hp);
  });
});

describe('The new cards', () => {
  const NEW_ITEMS = ['sprint_boots', 'enduring_speed', 'kinetic_dash'];

  it('sit on the side their item does, at their tier and price', () => {
    expect(CARDS_BY_ID['majestic_leap']).toMatchObject({ type: 'spell', cost: 4, rarity: 3, name: 'Majestic Leap' });
    expect(CARDS_BY_ID['sprint_boots']).toMatchObject({ type: 'equipment', tier: 1, cost: 2, rarity: 1, name: 'Sprint Boots' });
    expect(CARDS_BY_ID['enduring_speed']).toMatchObject({ type: 'equipment', tier: 2, cost: 3, name: 'Enduring Speed' });
    expect(CARDS_BY_ID['kinetic_dash']).toMatchObject({ type: 'equipment', tier: 2, cost: 3, name: 'Kinetic Dash' });
    for (const id of [...NEW_ITEMS, 'majestic_leap', 'fleetfoot']) {
      expect((CARDS_BY_ID[id] as { abilities?: string[] }).abilities, id).toEqual([`eff_${id}`]);
      expect(ABILITIES_BY_ID[`eff_${id}`], id).toBeDefined();
    }
  });

  it('Swift is a status the rule text bolds and explains', () => {
    expect(statusOfKeyword('Swift', '')).toEqual({ id: 'swift', value: undefined });
  });
});

describe('The AI swaps after the swing', () => {
  const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;
  const asAction = (m: { move: string; args: any[] }): Action => {
    switch (m.move) {
      case 'attack': return { type: 'attack', targetIid: m.args[0] };
      case 'moveHero': return { type: 'moveHero', fromSlot: m.args[0], toSlot: m.args[1] };
      case 'endTurn': return { type: 'endTurn' };
      default: throw new Error(`unexpected move ${m.move}`);
    }
  };

  it('ranks the Retreat to a fresh attacker above ending the turn once the Active has swung', () => {
    for (const lookahead of [true, false]) {
      const { G } = built(2);
      makeAttack(G, '0');
      const moves = enumerateAIMoves(G, ctx('0'), lookahead);
      const at = (m: string) => moves.findIndex((o) => o.move === m);
      expect(at('moveHero'), `lookahead ${lookahead}`).toBeGreaterThanOrEqual(0);
      expect(at('moveHero'), `lookahead ${lookahead}`).toBeLessThan(at('endTurn'));
      expect(moves[0].move, `lookahead ${lookahead}`).toBe('moveHero');
    }
  });

  it('swings before it swaps: a Retreat that only trades one attack for another is not worth its souls', () => {
    const { G } = built(2);
    expect(enumerateAIMoves(G, ctx('0'))[0].move).toBe('attack');
  });

  it('plays the turn through: attack, Retreat, attack', () => {
    const { G, me } = built(2);
    const made: string[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const best = enumerateAIMoves(G, ctx('0'))[0];
      made.push(best.move);
      if (best.move === 'endTurn') break;
      expect(perform(G, '0', asAction(best)), best.move).not.toBe(INVALID);
    }
    expect(made).toEqual(['attack', 'moveHero', 'attack', 'endTurn']);
    expect(board(G, '0').filter((c) => c.attackedThisTurn)).toHaveLength(2);
    expect(me.souls).toBe(0);
  });
});
