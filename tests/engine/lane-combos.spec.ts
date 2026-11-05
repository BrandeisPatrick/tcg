/**
 * One attack a turn (docs/engine-model.md, "The turn"): the attack ends the
 * Act, so a Retreat comes before it — the hero who steps in makes the turn's
 * attack — and one Retreat a turn. With it, the cards of the 2026-11-03 pass
 * (docs/card-design.md) that play the swap: Sprint Boots and Enduring Speed
 * (the `retreatDiscount` hook, and Enduring Speed's `resists`), Fleetfoot's
 * Swift (a free Retreat), Kinetic Dash (the `onBearerStepIn` trigger) and
 * Majestic Leap (a free swap) — and the AI, which has to see when a swap
 * before the swing is worth its soul. Fleetfoot, Majestic Leap, Warp Stone,
 * Phantom Strike and Vortex Web are active items: a hero wears one and uses it
 * as its one ability of the turn (`useItem`, the Active the bearer unless a
 * test says otherwise); their texts' "your Active" is the player's Active.
 *
 * Board (freshReadyGame): P0 Haze (active) · Vindicta / Lash / Paige;
 *                         P1 Abrams (active) · Dynamo / Kelvin / Seven.
 * Most tests use `built`, which swaps P0's Lash and Paige for Shiv and Drifter
 * (passive-only, so no bench skill competes with the swap) and deepens every HP.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, itemCard } from '@/cards';
import { ABILITIES_BY_ID } from '@/abilities';
import { PRICE, RETREAT_COST } from '@/engine/constants';
import { resolve } from '@/engine/death';
import { INVALID, perform, type Action } from '@/engine/engine';
import { attackBlocked, blocked, legalActions, moveBlocked, retreatCost } from '@/engine/legality';
import { attackPower, itemPrice } from '@/engine/query';
import { addStatus, clearTurnFlags } from '@/engine/statusOps';
import { enumerateAIMoves } from '@/ai/heuristic';
import { statusOfKeyword } from '@/ui/card/RuleText';
import { freshReadyGame, giveItem, makeAttack, makeHero, useItem } from './_helpers';

/** P0 uses its worn active item `item` (aimed at `targetIid`): why the engine
 *  refuses it, or null when it took it. */
function refusal(G: GameState, item: CardInstance, targetIid?: string): string | null {
  const a: Action = { type: 'activate', itemIid: item.iid, targetIid };
  const why = blocked(G, '0', a);
  return perform(G, '0', a) === INVALID ? why : null;
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

/** A board where the swap after the swing matters: deep HP everywhere, nobody
 *  wearing anything and a bench of passive-only heroes (Vindicta, Shiv,
 *  Drifter), so the attack and the Retreat are the only plays there are. */
function built(souls: number) {
  const G = freshReadyGame();
  const me = G.players['0'];
  me.bench = [me.bench[0], makeHero('hero_shiv', '0', 'bench', 2), makeHero('hero_drifter', '0', 'bench', 3)];
  hpPool(G, '0');
  hpPool(G, '1');
  me.souls = souls;
  return { G, me, haze: me.active!, vindicta: me.bench[0]!, shiv: me.bench[1]!, abrams: G.players['1'].active! };
}

describe('One attack a turn, and the Retreat before it', () => {
  it('the attack ends the Act: no Retreat and no second attack after it', () => {
    const { G, me, haze, abrams } = built(2);
    makeAttack(G, '0');
    expect(G.attackUsed).toBe(true);
    expect(attackBlocked(G, '0')).toBe('used');
    expect(moveBlocked(G, '0', 2, 0)).toBe('actOver');
    expect(retreat(G, 2)).toBe(INVALID);
    expect(me.active!.iid).toBe(haze.iid);
    const hp = abrams.hp;
    expect(perform(G, '0', { type: 'attack' })).toBe(INVALID);
    expect(abrams.hp).toBe(hp);
    expect(legalActions(G, '0')).toEqual([{ type: 'endTurn' }]);
  });

  it('a Retreat before the attack lets the hero who steps in make it', () => {
    const { G, me, shiv, abrams } = built(2);
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(me.active!.iid).toBe(shiv.iid);
    expect(attackBlocked(G, '0')).toBeNull();
    expect(legalActions(G, '0').some((a) => a.type === 'attack')).toBe(true);
    const hp = abrams.hp;
    makeAttack(G, '0');
    expect(abrams.hp).toBeLessThan(hp);
    expect(G.attackUsed).toBe(true);
  });

  it('Turn 1 still has no attack, for the Active or the hero a Retreat brings in', () => {
    const { G } = built(2);
    G.turnNumber = 1;
    expect(attackBlocked(G, '0')).toBe('turn1');
    expect(retreat(G, 1)).not.toBe(INVALID);
    expect(attackBlocked(G, '0')).toBe('turn1');
  });

  it('a hero that used its ability may still make the attack', () => {
    const G = freshReadyGame();
    hpPool(G, '1');
    const me = G.players['0'];
    me.souls = 10;
    const lash = me.bench[1]!;
    const abrams = G.players['1'].active!;
    expect(retreat(G, 2)).not.toBe(INVALID); // Lash in
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid, targetIid: abrams.iid })).not.toBe(INVALID);
    expect(attackBlocked(G, '0')).toBeNull();
    const hp = abrams.hp;
    makeAttack(G, '0');
    expect(abrams.hp).toBeLessThan(hp);
  });

  it('the hero a promotion brings in after a death may make the attack; the promotion is free', () => {
    const { G, me, haze, shiv } = built(0);
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
    const { G, me } = built(10);
    expect(retreatCost(G, '0')).toBe(RETREAT_COST);
    expect(RETREAT_COST).toBe(1);
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(me.souls).toBe(9);
    expect(lastLog(G)).toBe('P0 retreated (-1 soul).');
  });

  it('Sprint Boots take a soul off: the Retreat is free; it is still the turn\'s one', () => {
    const { G, me, haze } = built(0);
    giveItem(G, haze, 'sprint_boots');
    expect(retreatCost(G, '0')).toBe(0);
    expect(moveBlocked(G, '0', 2, 0)).toBeNull();
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(me.souls).toBe(0);
    expect(lastLog(G)).toBe('P0 retreated (free).');
    // Back the other way the price is Shiv's, who wears nothing — and a second Retreat is not to be had.
    expect(retreatCost(G, '0')).toBe(1);
    me.souls = 5;
    expect(moveBlocked(G, '0', 2, 0)).toBe('retreated');
  });

  it('only what the hero leaving the slot wears counts', () => {
    const { G, shiv } = built(10);
    giveItem(G, shiv, 'sprint_boots');
    expect(retreatCost(G, '0')).toBe(1);
  });

  it('Sprint Boots and Enduring Speed together make it free', () => {
    const { G, me, haze } = built(0);
    giveItem(G, haze, 'sprint_boots');
    giveItem(G, haze, 'enduring_speed');
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
    expect(retreat(G, 2)).toBe(INVALID); // one Retreat a turn
    G.retreatUsed = false;                // a later turn
    expect(retreat(G, 2)).not.toBe(INVALID); // Haze back in, paid for this time
    expect(me.souls).toBe(3);
    expect(retreatCost(G, '0')).toBe(1);
  });

  it('a free swap does not spend a Swift', () => {
    const { G, haze, shiv } = built(0);
    addStatus(G, haze, 'swift', 1, 1);
    useItem(G, '0', 'majestic_leap', shiv.iid);
    expect(status(haze, 'swift')).toBeDefined();
  });

  it('an unspent Swift goes when the turn ends, even stretched by Superior Duration', () => {
    const { G, me, haze } = built(10);
    giveItem(G, haze, 'superior_duration');
    useItem(G, '0', 'fleetfoot');
    expect(status(haze, 'swift')?.duration).toBe(3); // 1, and Superior Duration's 2
    clearTurnFlags(me);
    expect(status(haze, 'swift')).toBeUndefined();
  });
});

describe('Kinetic Dash: +3 Bullet Power for the hero that steps in', () => {
  it('fires on a Retreat', () => {
    const { G, shiv, abrams } = built(2);
    giveItem(G, shiv, 'kinetic_dash');
    const bare = attackPower(shiv, abrams).total;
    expect(retreat(G, 2)).not.toBe(INVALID);
    expect(status(shiv, 'weapon_power')).toMatchObject({ value: 3, duration: 1 });
    expect(attackPower(shiv, abrams).total).toBe(bare + 3);
  });

  it('fires on an item\'s swap (Warp Stone, Majestic Leap)', () => {
    for (const card of ['warp_stone', 'majestic_leap']) {
      const { G, shiv } = built(0);
      giveItem(G, shiv, 'kinetic_dash');
      useItem(G, '0', card, shiv.iid);
      expect(G.players['0'].active!.iid, card).toBe(shiv.iid);
      expect(status(shiv, 'weapon_power'), card).toMatchObject({ value: 3, duration: 1 });
    }
  });

  it('does not fire on a promotion after a death, nor for a hero the rival drags to the front', () => {
    const { G, haze, shiv } = built(0);
    giveItem(G, shiv, 'kinetic_dash');
    haze.hp = 0;
    resolve(G);
    expect(perform(G, '0', { type: 'promoteToActive', benchIid: shiv.iid })).not.toBe(INVALID);
    expect(G.players['0'].active!.iid).toBe(shiv.iid);
    expect(status(shiv, 'weapon_power')).toBeUndefined();

    const H = built(0);
    const dynamo = H.G.players['1'].bench[0]!;
    giveItem(H.G, dynamo, 'kinetic_dash');
    useItem(H.G, '0', 'phantom_strike', dynamo.iid);
    expect(H.G.players['1'].active!.iid).toBe(dynamo.iid);
    expect(status(dynamo, 'weapon_power')).toBeUndefined();
  });

  it('does not fire on a bench shuffle', () => {
    const { G, shiv } = built(0);
    giveItem(G, shiv, 'kinetic_dash');
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 2, toSlot: 3 })).not.toBe(INVALID);
    expect(status(shiv, 'weapon_power')).toBeUndefined();
  });
});

describe('Enduring Speed cannot be Rooted', () => {
  it('a Root never lands on the bearer, and the log says what turned it away', () => {
    const { G, haze } = built(0);
    giveItem(G, haze, 'enduring_speed');
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
    giveItem(G, abrams, 'enduring_speed');
    useItem(G, '0', 'vortex_web');
    expect(abrams.hp).toBeLessThan(30);
    expect(status(abrams, 'rooted')).toBeUndefined();
    for (const c of rest) expect(status(c, 'rooted'), c.cardId).toBeDefined();
  });
});

describe('Majestic Leap', () => {
  it('your Active leaps out free and the bench ally you pick steps in to make the attack; the turn\'s Retreat is still there', () => {
    const { G, me, haze, shiv } = built(10);
    useItem(G, '0', 'majestic_leap', shiv.iid);
    expect(me.souls).toBe(10); // using an item is free, and there is no Retreat charge
    expect(me.active!.iid).toBe(shiv.iid);
    expect(me.bench[1]!.iid).toBe(haze.iid);
    expect(G.retreatUsed).toBe(false);
    expect(attackBlocked(G, '0')).toBeNull();
  });

  it('is an ability, so the attack ends its window too', () => {
    const { G, haze, shiv } = built(10);
    const leap = giveItem(G, haze, 'majestic_leap');
    makeAttack(G, '0');
    expect(refusal(G, leap, shiv.iid)).toBe('actOver');
  });

  it('needs a bench ally to aim at, and a Root on either side holds it', () => {
    const { G, haze, shiv } = built(10);
    const leap = giveItem(G, haze, 'majestic_leap');
    expect(refusal(G, leap, haze.iid)).toBe('target');
    addStatus(G, haze, 'rooted', 1, 1);
    expect(refusal(G, leap, shiv.iid)).toBe('target');
    expect(G.players['0'].active!.iid).toBe(haze.iid);
  });
});

describe('Fleetfoot', () => {
  it('Extra Attack 1: the Active\'s attack swings twice', () => {
    const { G, me, haze } = built(10);
    useItem(G, '0', 'fleetfoot');
    expect(me.souls).toBe(10); // using an item is free
    expect(status(haze, 'extra_attack')?.value).toBe(1);
    expect(status(haze, 'swift')).toMatchObject({ value: 1, duration: 1 });
    const fx0 = G.fx.length;
    makeAttack(G, '0');
    expect(G.fx.slice(fx0).filter((e) => e.kind === 'swing' && e.iid === haze.iid).length).toBeGreaterThanOrEqual(2);
  });

  it('Swift makes the turn\'s Retreat free: swap for nothing, and the new Active makes the attack', () => {
    const { G, me, abrams } = built(10);
    useItem(G, '0', 'fleetfoot');
    expect(retreat(G, 1)).not.toBe(INVALID);
    expect(me.souls).toBe(10);
    const hp = abrams.hp;
    makeAttack(G, '0');
    expect(abrams.hp).toBeLessThan(hp);
  });
});

describe('The new cards', () => {
  const NEW_ITEMS = ['sprint_boots', 'enduring_speed', 'kinetic_dash'];

  it('sit on the side their item does, in its shop tab, at their tier and price', () => {
    expect(CARDS_BY_ID['majestic_leap']).toMatchObject({ type: 'spell', slot: 'vitality', tier: 3, rarity: 3, name: 'Majestic Leap' });
    expect(CARDS_BY_ID['sprint_boots']).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 1, rarity: 1, name: 'Sprint Boots' });
    expect(CARDS_BY_ID['enduring_speed']).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 2, name: 'Enduring Speed' });
    expect(CARDS_BY_ID['kinetic_dash']).toMatchObject({ type: 'equipment', slot: 'weapon', tier: 2, name: 'Kinetic Dash' });
    for (const id of [...NEW_ITEMS, 'majestic_leap', 'fleetfoot']) {
      expect(itemPrice(id), id).toBe(PRICE[itemCard(id)!.tier]);
      expect((CARDS_BY_ID[id] as { abilities?: string[] }).abilities, id).toEqual([`eff_${id}`]);
      expect(ABILITIES_BY_ID[`eff_${id}`], id).toBeDefined();
    }
  });

  it('Swift is a status the rule text bolds and explains', () => {
    expect(statusOfKeyword('Swift', '')).toEqual({ id: 'swift', value: undefined });
  });
});

describe('The AI retreats before it attacks when the swap is worth it', () => {
  const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;
  const asAction = (m: { move: string; args: any[] }): Action => {
    switch (m.move) {
      case 'attack': return { type: 'attack', targetIid: m.args[0] };
      case 'moveHero': return { type: 'moveHero', fromSlot: m.args[0], toSlot: m.args[1] };
      case 'endTurn': return { type: 'endTurn' };
      default: throw new Error(`unexpected move ${m.move}`);
    }
  };
  /** Haze Weakened to 1 Bullet Power, with Shiv (2, and his Bleed) and Drifter (3) on the bench:
   *  harder hitters to send in. */
  const weakened = () => {
    const b = built(2);
    addStatus(b.G, b.haze, 'weapon_power_down', 2, 2);
    return b;
  };

  it('sends in a harder hitter ahead of the attack, with lookahead', () => {
    const { G } = weakened();
    const moves = enumerateAIMoves(G, ctx('0'));
    expect(moves[0].move).toBe('moveHero');
    expect(moves[0].args[0]).not.toBe(1); // not Vindicta, who hits no harder
  });

  it('attacks without swapping when no bench hero hits harder: a Retreat for nothing is not worth its soul', () => {
    const { G, me } = built(2);
    me.bench = [me.bench[0], null, null]; // Vindicta alone behind Haze: 2 Bullet Power to Haze's 3
    expect(enumerateAIMoves(G, ctx('0'))[0].move).toBe('attack');
  });

  it('plays the turn through: Retreat, attack, end', () => {
    const { G, me } = weakened();
    const made: string[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const best = enumerateAIMoves(G, ctx('0'))[0];
      made.push(best.move);
      if (best.move === 'endTurn') break;
      expect(perform(G, '0', asAction(best)), best.move).not.toBe(INVALID);
    }
    expect(made).toEqual(['moveHero', 'attack', 'endTurn']);
    expect(me.souls).toBe(1);
  });
});
