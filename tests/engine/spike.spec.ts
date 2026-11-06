/**
 * The category spike (rules §4; query.ts `tabCounts` / `hasSpike`,
 * instances.ts `syncVitalitySpike`) and what items are worth (query.ts
 * `itemPrice`, `heroWorth`, `netWorth`). A hero wearing 3+ items of one tab —
 * actives and passives alike — has +1 on that tab's line while it does:
 * Weapon +1 Bullet Power, Spirit +1 Spirit Power, Vitality +1 max HP (current
 * HP rises with it, and is clamped when it goes). The Weapon and Spirit points
 * are read off what the hero wears, never stored on its modifiers. Net worth is
 * souls plus the list price (PRICE by tier) of every worn item.
 */
import { describe, expect, it } from 'vitest';
import type { CardInstance, GameState } from '@/engine/types';
import { perform } from '@/engine/engine';
import {
  attackPower, comebackBonus, effectiveSpirit, hasSpike, heroWorth, isRichestHero, killBounty, netWorth, tabCounts,
} from '@/engine/query';
import { detachItem, syncVitalitySpike } from '@/engine/instances';
import { beginTurn } from '@/engine/actions/turn';
import { CATEGORY_SPIKE_ITEMS, PRICE } from '@/engine/constants';
import { buyItem, freshReadyGame, giveItem } from './_helpers';

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

  it('a corpse keeps 0 HP as the spike comes and goes, and respawns at the new max', () => {
    const G = freshReadyGame();
    const vindicta = G.players['0'].bench[0]!;
    vindicta.hp = 0;
    vindicta.respawnTurnsLeft = 1;
    const max = vindicta.hpMax;
    wear(G, vindicta, VITALITY);
    expect([vindicta.hpMax, vindicta.hp]).toEqual([max + 1, 0]);
    beginTurn(G, '0', G.turnNumber + 2);                          // its owner's next turn: the timer runs out
    expect([vindicta.respawnTurnsLeft, vindicta.hp]).toEqual([undefined, max + 1]);
  });

  it('the spike follows the shop: buying the third item brings it, selling one or moving it away takes it, and the receiver may gain it', () => {
    const G = freshReadyGame({ step: 'shop' });
    G.players['0'].souls = 20;
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const [hazeMax, vinMax] = [haze.hpMax, vindicta.hpMax];
    wear(G, haze, ['extra_regen', 'sprint_boots']);
    wear(G, vindicta, ['extra_regen', 'sprint_boots']);
    const grit = buyItem(G, '0', 'grit', haze);                   // a Vitality active, the third
    expect([haze.hpMax, haze.hp]).toEqual([hazeMax + 1, hazeMax + 1]);
    perform(G, '0', { type: 'moveItem', itemIid: grit.iid, toHeroIid: vindicta.iid });
    expect([haze.hpMax, haze.hp]).toEqual([hazeMax, hazeMax]);
    expect([vindicta.hpMax, vindicta.hp]).toEqual([vinMax + 1, vinMax + 1]);
    perform(G, '0', { type: 'sell', itemIid: grit.iid });
    expect([vindicta.hpMax, vindicta.hp, vindicta.vitalitySpike]).toEqual([vinMax, vinMax, undefined]);
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
    // What reads it: the comeback for the side behind, and the bounty on the richest hero.
    expect(comebackBonus(G, '1')).toBe(2);
    expect(comebackBonus(G, '0')).toBe(0);
    expect(isRichestHero(G, lash)).toBe(true);
    expect(killBounty(G, haze)).toBe((haze.level ?? 1) + 1);
    expect(killBounty(G, lash)).toBe((lash.level ?? 1) + 1 + 2);
  });
});
