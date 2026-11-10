/**
 * The category spike (rules §4; query.ts `tabCounts` / `hasSpike`,
 * instances.ts `syncVitalitySpike`) and what items are worth (query.ts
 * `itemPrice`, `heroWorth`, `netWorth`). A hero wearing 3+ items of one tab —
 * actives and passives alike — has +1 on that tab's line while it does:
 * Weapon +1 Bullet Power, Spirit +1 Spirit Power, Vitality +1 max HP (current
 * HP rises with it, and is clamped when it goes). The Weapon and Spirit points
 * are read off what the hero wears, never stored on its modifiers. Net worth is
 * souls plus the list price (PRICE by tier) of every worn item and every item
 * in the hand.
 */
import { describe, expect, it } from 'vitest';
import type { CardInstance, GameState } from '@/engine/types';
import { perform } from '@/engine/engine';
import {
  attackPower, effectiveSpirit, hasSpike, heroWorth, netWorth, standingVerdict, tabCounts,
} from '@/engine/query';
import { detachItem, syncVitalitySpike } from '@/engine/instances';
import { beginTurn } from '@/engine/actions/turn';
import { CATEGORY_SPIKE_ITEMS, PRICE } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, playNew } from './_helpers';

// Items of each tab with no printed stat bonus, so the spike is all that moves.
const WEAPON = ['restorative_shot', 'long_range', 'kinetic_dash'];
const SPIRIT = ['mystic_regeneration', 'mystic_burst', 'spirit_strike'];
const VITALITY = ['extra_regen', 'sprint_boots', 'debuff_reducer'];

const wear = (G: GameState, hero: CardInstance, ids: string[]) => ids.map((id) => giveItem(G, hero, id));

describe('the category spike', () => {
  it('Weapon: a third Weapon item gives +1 Bullet Power, read off what is worn — the attack modifier is untouched', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const base = attackPower(haze).total;
    const atkMod = haze.atkMod;
    wear(G, haze, WEAPON.slice(0, 2));
    expect(hasSpike(haze, 'weapon')).toBe(false);
    expect(attackPower(haze).total).toBe(base);
    const third = giveItem(G, haze, WEAPON[2]);
    expect(CATEGORY_SPIKE_ITEMS).toBe(3);
    expect(tabCounts(haze)).toEqual({ weapon: 3, spirit: 0, vitality: 0 });
    expect(hasSpike(haze, 'weapon')).toBe(true);
    expect(attackPower(haze)).toMatchObject({ total: base + 1 });
    expect(attackPower(haze).parts).toContainEqual({ label: 'Weapon spike', amount: 1 });
    expect(haze.atkMod).toBe(atkMod);
    detachItem(haze, third);
    expect(attackPower(haze).total).toBe(base);
  });

  it('Spirit: a third Spirit item gives +1 Spirit Power — an active counts like a passive; the spirit modifier is untouched', () => {
    const G = freshReadyGame();
    const lash = G.players['0'].bench[1]!;
    const base = effectiveSpirit(lash);
    wear(G, lash, ['mystic_burst', 'mystic_regeneration']);
    expect(effectiveSpirit(lash)).toBe(base);
    giveItem(G, lash, 'rusted_barrel');                           // a Spirit active
    expect(hasSpike(lash, 'spirit')).toBe(true);
    expect(effectiveSpirit(lash)).toBe(base + 1);
    expect(lash.spiritMod).toBe(0);
  });

  it('three items of mixed tabs give no spike', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    wear(G, haze, [WEAPON[0], SPIRIT[0], VITALITY[0]]);
    expect(tabCounts(haze)).toEqual({ weapon: 1, spirit: 1, vitality: 1 });
    for (const slot of ['weapon', 'spirit', 'vitality'] as const) expect(hasSpike(haze, slot)).toBe(false);
  });

  it('Vitality: a third Vitality item gives +1 max HP and +1 HP; losing it takes the point off, HP clamped to the new max', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    const [max, hp] = [haze.hpMax, haze.hp];
    const [a] = wear(G, haze, VITALITY);
    expect(haze.vitalitySpike).toBe(true);
    expect([haze.hpMax, haze.hp]).toEqual([max + 1, hp + 1]);
    detachItem(haze, a);
    syncVitalitySpike(haze);
    expect(haze.vitalitySpike).toBeUndefined();
    expect([haze.hpMax, haze.hp]).toEqual([max, max]);            // was full: clamped to the new max
    // Hurt below the old max, losing the spike leaves HP where it is.
    giveItem(G, haze, a.cardId);
    haze.hp = 2;
    const again = haze.attached!.at(-1)!;
    detachItem(haze, again);
    syncVitalitySpike(haze);
    expect([haze.hpMax, haze.hp]).toEqual([max, 2]);
  });

  it('a corpse keeps 0 HP as the spike comes and goes, and goes back to the hand at the new max', () => {
    const G = freshReadyGame();
    const vindicta = G.players['0'].bench[0]!;
    vindicta.hp = 0;
    vindicta.respawnTurnsLeft = 1;
    const max = vindicta.hpMax;
    wear(G, vindicta, VITALITY);
    expect([vindicta.hpMax, vindicta.hp]).toEqual([max + 1, 0]);
    beginTurn(G, '0', G.turnNumber + 2);                          // its owner's next turn: the timer runs out
    expect([vindicta.respawnTurnsLeft, vindicta.hp, vindicta.zone]).toEqual([undefined, max + 1, 'hand']);
  });

  it('the spike follows the hand: playing the third item brings it, and an evolve that keeps the tab keeps it', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const [hazeMax, vinMax] = [haze.hpMax, vindicta.hpMax];
    wear(G, haze, ['extra_regen', 'sprint_boots']);
    wear(G, vindicta, ['extra_regen', 'sprint_boots']);
    playNew(G, '0', 'grit', haze);                                // a Vitality active, the third
    expect([haze.hpMax, haze.hp]).toEqual([hazeMax + 1, hazeMax + 1]);
    expect([vindicta.hpMax, vindicta.hp]).toEqual([vinMax, vinMax]);
    // Grit evolves into Guardian Ward (Vitality too): the spike stays.
    playNew(G, '0', 'guardian_ward', haze);
    expect(haze.attached!.map((it) => it.cardId)).toEqual(['extra_regen', 'sprint_boots', 'guardian_ward']);
    expect([haze.hpMax, haze.vitalitySpike]).toEqual([hazeMax + 1, true]);
  });
});

describe('what items are worth', () => {
  it('net worth is souls plus the list price of every worn item — actives and passives, on the bench and on corpses', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    me.souls = 3;
    giveItem(G, haze, 'extended_magazine');                      // tier 1 passive
    giveItem(G, vindicta, 'cold_front');                         // tier 2 active
    giveItem(G, lash, 'knockdown');                              // tier 3 active (hard CC)
    lash.hp = 0;
    lash.respawnTurnsLeft = 2;
    expect([heroWorth(haze), heroWorth(vindicta), heroWorth(lash), heroWorth(me.bench[2]!)]).toEqual([PRICE[1], PRICE[2], PRICE[3], 0]);
    expect(netWorth(G, '0')).toBe(3 + PRICE[1] + PRICE[2] + PRICE[3]);
    expect(netWorth(G, '1')).toBe(0);
    // An item in the hand counts at its price; a hero card at nothing.
    giveCard(G, '1', 'glass_cannon');
    giveCard(G, '1', 'hero_kelvin');
    expect(netWorth(G, '1')).toBe(PRICE[4]);
    // What reads it: the round cap's tie-break when the structures are level.
    expect(standingVerdict(G)).toEqual({ winner: '0', by: 'netWorth' }); // 17 to 16
  });
});
