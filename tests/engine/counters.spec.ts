/**
 * Counters (docs/card-design.md, "Counters"; Patrick, 2026-11-15): effects
 * that resolve after a turn, and the cards that answer them.
 *
 *  - Static Charge (Seven's skill): the hit lands now, the Stun after the
 *    enemy's next turn. Taking the Charge off first stops the Stun.
 *  - Storm Cloud (Seven's ultimate): a channel of 2 turns. A Stun ends it.
 *  - Knockdown: the immediate counter to a channel.
 *  - Dispel Magic: takes every debuff off, a delayed one too.
 *  - Debuff Reducer: one random debuff off at the start of its owner's turn.
 *  - Counterspell: a status; the next enemy card played on its bearer does
 *    nothing. The item brings it back 2 turns after it is used.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { itemCard } from '@/cards';
import { ULTIMATES } from '@/cards/ultimates';
import { ABILITIES_BY_ID } from '@/abilities';
import { INVALID, perform, type Action } from '@/engine/engine';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { addStatus } from '@/engine/statusOps';
import { heroesOf, isBlocked, wornItems } from '@/engine/query';
import { skillBlocked } from '@/engine/legality';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { COUNTERSPELL_HEAL, COUNTERSPELL_RECHARGE, PRICE, ULT_WAIT } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, playNew, useItem } from './_helpers';

/** End the turn of `pid` and begin the other seat's, as the game's turn hooks do. */
function nextTurn(G: GameState, pid: PlayerID): PlayerID {
  const next: PlayerID = pid === '0' ? '1' : '0';
  endTurnEffects(G, pid);
  beginTurn(G, next, G.turnNumber + 1 + G.draftTurnsOffset);
  return next;
}
/** The two halves of `nextTurn`, for a look between them (a start-of-turn heal would hide a pulse). */
const endOf = (G: GameState, pid: PlayerID) => endTurnEffects(G, pid);
const startOf = (G: GameState, pid: PlayerID) => beginTurn(G, pid, G.turnNumber + 1 + G.draftTurnsOffset);
const has = (c: CardInstance, id: string) => c.statuses.some((s) => s.id === id);
const act = (G: GameState, pid: PlayerID, a: Action) => expect(perform(G, pid, a), JSON.stringify(a)).not.toBe(INVALID);

/** P0's turn with Seven on its bench (slot 1), at `level`, and every hero of both
 *  sides tough enough that nothing falls. */
function withSeven(level: 1 | 2 = 1): { G: GameState; seven: CardInstance; foe: CardInstance } {
  const G = freshReadyGame();
  const seven = makeInstance(allocatorOf(G), 'hero_seven', '0', 'bench', 1);
  seven.level = level;
  seven.cooldowns = undefined;
  G.players['0'].bench[0] = seven;
  for (const pid of ['0', '1'] as const) for (const h of heroesOf(G.players[pid])) { h.hpMax = 40; h.hp = 40; }
  return { G, seven, foe: G.players['1'].active! };
}

describe('Static Charge: the hit now, the Stun after the enemy\'s next turn', () => {
  it('is Seven\'s skill: aimed at the enemy Active, waits 4, holds no charges', () => {
    const a = ABILITIES_BY_ID.skill_seven as { name?: string; target: string; cooldown?: number; charges?: number };
    expect([a.name, a.target, a.cooldown, a.charges]).toEqual(['Static Charge', 'enemyActive', 4, undefined]);
  });

  it('deals 1 + Spirit and Charges the target; the charged side plays its whole next turn, and is Stunned for the one after', () => {
    const { G, seven, foe } = withSeven();
    act(G, '0', { type: 'useSkill', heroIid: seven.iid, targetIid: foe.iid });
    expect(foe.hp).toBe(39);
    expect(has(foe, 'charged')).toBe(true);
    expect(has(foe, 'stun')).toBe(false);
    nextTurn(G, '0');                       // the rival's turn: the window
    expect(has(foe, 'charged')).toBe(true);
    expect(isBlocked(foe, 'attack')).toBe(false);
    nextTurn(G, '1');
    nextTurn(G, '0');                       // the rival's turn after: it goes off
    expect(has(foe, 'charged')).toBe(false);
    expect(has(foe, 'stun')).toBe(true);
    expect(isBlocked(foe, 'attack')).toBe(true);
    nextTurn(G, '1');                       // and the Stun has cost exactly that turn
    expect(has(foe, 'stun')).toBe(false);
  });

  it('Dispel Magic in that turn takes the Charge off: no Stun ever lands', () => {
    const { G, seven, foe } = withSeven();
    act(G, '0', { type: 'useSkill', heroIid: seven.iid, targetIid: foe.iid });
    nextTurn(G, '0');
    useItem(G, '1', 'debuff_remover', foe.iid);
    expect(has(foe, 'charged')).toBe(false);
    nextTurn(G, '1');
    nextTurn(G, '0');
    expect(has(foe, 'stun')).toBe(false);
  });

  it('a hero walked out of the lane takes the Stun on the bench', () => {
    const { G, seven, foe } = withSeven();
    act(G, '0', { type: 'useSkill', heroIid: seven.iid, targetIid: foe.iid });
    nextTurn(G, '0');
    G.players['1'].souls = 5;
    act(G, '1', { type: 'moveHero', fromSlot: 0, toSlot: 1 }); // a Retreat
    expect(G.players['1'].active).not.toBe(foe);
    nextTurn(G, '1');
    nextTurn(G, '0');
    expect(has(foe, 'stun')).toBe(true);
    expect(isBlocked(G.players['1'].active!, 'attack')).toBe(false); // the lane fights on
  });
});

describe('Storm Cloud: a channel of 2 turns that a Stun ends', () => {
  const ult: Action = { type: 'useSkill', heroIid: '', skillId: 'eff_ult_seven' };

  it('the card says so, in 15 words or fewer', () => {
    const card = ULTIMATES.find((u) => u.id === 'ult_seven')!;
    expect(card.text).toBe("Channel 2 turns: at each turn's end, deal {sp:2} spirit damage to every enemy.");
    expect((card.text ?? '').split(/\s+/).length).toBeLessThanOrEqual(15);
    expect(card.size).toBe('large');
  });

  it('nothing lands as it is used; each of Seven\'s next two turn ends deals 2 + his Spirit to every enemy; then it is over', () => {
    const { G, seven } = withSeven(2);
    const spirit = seven.spiritMod;
    const foes = heroesOf(G.players['1']);
    act(G, '0', { ...ult, heroIid: seven.iid });
    expect(has(seven, 'casting')).toBe(true);
    expect(foes.map((f) => f.hp)).toEqual(foes.map(() => 40));
    expect(seven.cooldowns?.eff_ult_seven).toBe(ULT_WAIT.large);
    // Locked in: no attack from him, no skill.
    expect(isBlocked(seven, 'attack') && isBlocked(seven, 'skill')).toBe(true);
    expect(skillBlocked(G, '0', seven, G.players['1'].active!.iid)).not.toBeNull();
    for (const f of foes) f.hpMax = 100;    // room above, so a start-of-turn heal is plain to see
    endOf(G, '0');                          // the first pulse, as his turn ends
    expect(foes.map((f) => f.hp)).toEqual(foes.map(() => 40 - (2 + spirit)));
    startOf(G, '1');
    nextTurn(G, '1');
    expect(has(seven, 'casting')).toBe(true);
    const before = foes.map((f) => f.hp);
    endOf(G, '0');                          // the second
    expect(foes.map((f) => f.hp)).toEqual(before.map((hp) => hp - (2 + spirit)));
    startOf(G, '1');
    nextTurn(G, '1');
    expect(has(seven, 'casting')).toBe(false);
    const after = foes.map((f) => f.hp);
    endOf(G, '0');                          // and no third
    expect(foes.map((f) => f.hp)).toEqual(after);
  });

  it('Knockdown on the channelling Seven ends it at once: the second pulse never comes, and the ultimate is spent', () => {
    const { G, seven } = withSeven(2);
    const me = G.players['0'];
    // Seven channels from the lane, where Knockdown reaches him.
    [me.active, me.bench[0]] = [seven, me.active];
    seven.zone = 'active'; seven.slot = undefined;
    me.bench[0]!.zone = 'bench'; me.bench[0]!.slot = 1;
    const foes = heroesOf(G.players['1']);
    act(G, '0', { ...ult, heroIid: seven.iid });
    nextTurn(G, '0');
    const afterFirst = foes.map((f) => f.hp);
    useItem(G, '1', 'knockdown', seven.iid);
    expect(has(seven, 'casting')).toBe(false);
    expect(has(seven, 'stun')).toBe(true);
    expect(G.log.some((l) => l.text.includes('channel is broken'))).toBe(true);
    nextTurn(G, '1');
    nextTurn(G, '0');
    expect(foes.map((f) => f.hp)).toEqual(afterFirst);
    expect(seven.cooldowns?.eff_ult_seven).toBeGreaterThan(0);
  });

  it('a Sleep ends a channel too; a Silence or a Disarm does not', () => {
    for (const [id, ends] of [['sleep', true], ['stun', true], ['rabbit', true], ['silenced', false], ['disarm', false], ['rooted', false]] as const) {
      const { G, seven } = withSeven(2);
      addStatus(G, seven, 'casting', 2, 2);
      addStatus(G, seven, id, 1, 1);
      expect(has(seven, 'casting'), id).toBe(!ends);
    }
  });
});

describe('Dispel Magic: every debuff off, a delayed one too', () => {
  it('a Stun, a Bleed, a Charge and a Reverb all go; a buff stays; the hero is shielded and healed', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 20; haze.hp = 10;
    for (const [id, n] of [['stun', 1], ['bleed', 2], ['charged', 2], ['reverb', 1], ['bullet_resist_down', 2]] as const) addStatus(G, haze, id, 1, n);
    addStatus(G, haze, 'weapon_power', 2, 2);
    useItem(G, '0', 'debuff_remover', haze.iid);
    expect(haze.statuses.map((s) => s.id).sort()).toEqual(['shield', 'weapon_power']);
    expect(haze.hp).toBe(14);
    expect(isBlocked(haze, 'attack')).toBe(false); // the Stun it was under is gone: it may act this turn
  });

  it('its card says so', () => {
    expect(itemCard('debuff_remover')).toMatchObject({ name: 'Dispel Magic', type: 'spell', slot: 'vitality', tier: 3 });
    expect(itemCard('debuff_remover')!.text).toMatch(/every debuff .* delayed ones too/);
  });
});

describe('Debuff Reducer: one random debuff off at the start of its owner\'s turn', () => {
  it('a lone debuff always goes — a Stun put on in the rival\'s turn costs the bearer nothing', () => {
    const G = freshReadyGame();
    const foe = G.players['1'].active!;
    giveItem(G, foe, 'debuff_reducer');
    addStatus(G, foe, 'stun', 1, 1);
    nextTurn(G, '0');
    expect(has(foe, 'stun')).toBe(false);
    expect(isBlocked(foe, 'attack')).toBe(false);
  });

  it('of several exactly one goes a turn, picked from the match\'s own stream; buffs are never touched', () => {
    const picked = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const G = freshReadyGame();
      G.seed = seed;
      const foe = G.players['1'].active!;
      foe.hpMax = 30; foe.hp = 30;
      giveItem(G, foe, 'debuff_reducer');
      addStatus(G, foe, 'bullet_resist_down', 1, 5);
      addStatus(G, foe, 'spirit_resist_down', 1, 5);
      addStatus(G, foe, 'weapon_power_down', 1, 5);
      addStatus(G, foe, 'shield', 3, 999);
      nextTurn(G, '0');
      const left = foe.statuses.map((s) => s.id).filter((id) => id.endsWith('_down'));
      expect(left, `seed ${seed}`).toHaveLength(2);
      expect(has(foe, 'shield')).toBe(true);
      picked.add(['bullet_resist_down', 'spirit_resist_down', 'weapon_power_down'].find((id) => !left.includes(id))!);
    }
    expect(picked.size).toBeGreaterThan(1); // not always the same one
  });

  it('a Charge is taken off before it goes off', () => {
    const { G, seven, foe } = withSeven();
    giveItem(G, foe, 'debuff_reducer');
    act(G, '0', { type: 'useSkill', heroIid: seven.iid, targetIid: foe.iid });
    nextTurn(G, '0');
    expect(has(foe, 'charged')).toBe(false);
  });

  it('is Deadlock\'s passive Vitality item, so equipment; Spellbreaker carries its line', () => {
    expect(itemCard('debuff_reducer')).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 2 });
    expect(itemCard('spellbreaker')!.abilities).toContain('eff_debuff_reducer');
    expect(itemCard('spellbreaker')!.text).toContain('remove 1 random debuff');
  });
});

describe('Counterspell: the next enemy card played on its bearer does nothing', () => {
  /** P0's Active wears Counterspell, played from the hand. */
  function countered(): { G: GameState; haze: CardInstance; item: CardInstance } {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    haze.hpMax = 30; haze.hp = 20;
    const item = playNew(G, '0', 'counterspell', haze);
    return { G, haze, item };
  }

  it('is Deadlock\'s passive Vitality tier 3 item, so equipment, at its tier\'s price', () => {
    expect(itemCard('counterspell')).toMatchObject({ name: 'Counterspell', type: 'equipment', slot: 'vitality', tier: 3 });
    expect([COUNTERSPELL_HEAL, COUNTERSPELL_RECHARGE]).toEqual([2, 2]);
  });

  it('comes ready with the item: the status is on the bearer as the card is played', () => {
    const { haze } = countered();
    expect(has(haze, 'counterspell')).toBe(true);
  });

  it('a spell aimed at the bearer is paid for, discarded and does nothing; the bearer heals 2 and the status is spent', () => {
    const { G, haze } = countered();
    nextTurn(G, '0');
    const rival = G.players['1'];
    rival.souls = PRICE[2];
    const cold = giveCard(G, '1', 'cold_front');
    act(G, '1', { type: 'playCard', cardIid: cold.iid, heroIid: haze.iid });
    expect(haze.hp).toBe(20 + COUNTERSPELL_HEAL);
    expect(rival.souls).toBe(0);
    expect(rival.discard).toContain(cold);
    expect(has(haze, 'counterspell')).toBe(false);
    expect(has(haze, 'counterspell_spent')).toBe(true);
    // The next one lands.
    useItem(G, '1', 'cold_front', haze.iid);
    expect(haze.hp).toBeLessThan(20 + COUNTERSPELL_HEAL);
  });

  it('a skill and an ultimate aimed at the bearer are stopped the same way, and their wait is paid', () => {
    for (const skillId of [undefined, 'eff_ult_seven'] as const) {
      const { G, haze } = countered();
      nextTurn(G, '0');
      const seven: CardInstance = heroesOf(G.players['1']).find((h) => h.cardId === 'hero_seven')!;
      seven.level = 2;
      seven.cooldowns = undefined;
      if (skillId === undefined) {
        act(G, '1', { type: 'useSkill', heroIid: seven.iid, targetIid: haze.iid });
        expect(has(haze, 'charged')).toBe(false);
        expect(haze.hp).toBe(20 + COUNTERSPELL_HEAL);
        expect((seven.cooldowns as Record<string, number> | undefined)?.skill_seven).toBe(4);
        expect(has(haze, 'counterspell')).toBe(false);
      } else {
        // Storm Cloud is aimed at nobody: the channel opens, and its pulse is no card played.
        act(G, '1', { type: 'useSkill', heroIid: seven.iid, skillId });
        expect(has(seven, 'casting')).toBe(true);
        expect(has(haze, 'counterspell')).toBe(true);
        nextTurn(G, '1');
        expect(haze.hp).toBeLessThan(20);
        expect(has(haze, 'counterspell')).toBe(true);
      }
    }
  });

  it('a card that hits every enemy does nothing to the bearer and lands on the rest', () => {
    const { G, haze } = countered();
    const mates = heroesOf(G.players['0']).filter((h) => h !== haze);
    for (const h of mates) { h.hpMax = 30; h.hp = 20; }
    nextTurn(G, '0');
    const lash = makeInstance(allocatorOf(G), 'hero_lash', '1', 'bench', 1);
    G.players['1'].bench[0] = lash;
    act(G, '1', { type: 'useSkill', heroIid: lash.iid }); // Ground Strike: every enemy, and the Active Rooted
    expect(haze.hp).toBe(20 + COUNTERSPELL_HEAL);
    expect(has(haze, 'rooted')).toBe(false);
    expect(mates.every((h) => h.hp < 20)).toBe(true);
    expect(has(haze, 'counterspell')).toBe(false);
  });

  it('a swing is no card: the attack lands and the status stays', () => {
    const { G, haze } = countered();
    nextTurn(G, '0');
    act(G, '1', { type: 'attack' });
    expect(haze.hp).toBeLessThan(20);
    expect(has(haze, 'counterspell')).toBe(true);
  });

  it('its own side\'s cards pass: Dispel Magic on the bearer works and spends nothing', () => {
    const { G, haze } = countered();
    addStatus(G, haze, 'bleed', 1, 2);
    useItem(G, '0', 'debuff_remover', haze.iid);
    expect(has(haze, 'bleed')).toBe(false);
    expect(has(haze, 'counterspell')).toBe(true);
  });

  it('used, it comes back at the start of its owner\'s turn 2 turns later — and not while the item is off', () => {
    const { G, haze } = countered();
    nextTurn(G, '0');
    useItem(G, '1', 'cold_front', haze.iid);          // spent in the rival's turn
    nextTurn(G, '1');                                 // own turn 1: still spent
    expect([has(haze, 'counterspell'), has(haze, 'counterspell_spent')]).toEqual([false, true]);
    nextTurn(G, '0'); nextTurn(G, '1');               // own turn 2: back
    expect([has(haze, 'counterspell'), has(haze, 'counterspell_spent')]).toEqual([true, false]);
  });

  it('replaced by another card, the status goes with the item', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const item = playNew(G, '0', 'counterspell', haze);
    giveItem(G, haze, 'extra_health');
    giveItem(G, haze, 'extra_regen');
    const card = giveCard(G, '0', 'extra_spirit');
    G.players['0'].souls = PRICE[1];
    act(G, '0', { type: 'playCard', cardIid: card.iid, heroIid: haze.iid, replaceIid: item.iid });
    expect(wornItems(haze).map((it) => it.cardId)).not.toContain('counterspell');
    expect(has(haze, 'counterspell')).toBe(false);
  });
});
