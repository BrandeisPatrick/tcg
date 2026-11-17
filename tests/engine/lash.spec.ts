/**
 * Lash (Patrick, 2026-11-17). Ground Strike is his one skill: "damage and
 * movement and passive". Used from the bench he leaps into the Active; its
 * landing is always on: whenever he steps in from the bench, by any road, he
 * deals {sp:3} spirit damage to the enemy Active. Death Slam, his ultimate,
 * "picks one hero and returns it to its player's hand", and Expansion widens it.
 */
import { describe, it, expect } from 'vitest';
import { CARDS_BY_ID } from '@/cards';
import type { HeroCard } from '@/engine/types';
import { getAbility } from '@/abilities';
import { INVALID, perform } from '@/engine/engine';
import { damageUnit } from '@/engine/damage';
import { resolve } from '@/engine/death';
import { addStatus } from '@/engine/statusOps';
import { heroAbilities, skillWait } from '@/engine/query';
import { skillBlocked } from '@/engine/legality';
import { skillBlockReason } from '@/ui/board/heroActions';
import { freshReadyGame, giveItem, makeHero } from './_helpers';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { ULTIMATES } from '@/cards';

function board() {
  const G = freshReadyGame();
  const me = G.players['0'];
  const lash = me.bench.find((h) => h?.cardId === 'hero_lash')!;
  const haze = me.active!;
  const rival = G.players['1'].active!;
  rival.hp = rival.hpMax = 20;
  return { G, me, lash, haze, rival };
}

describe('Lash: Ground Strike', () => {
  it('the card: one row, Ground Strike, a skill that waits 3 and prints its landing; the landing runs as a passive', () => {
    const kit = heroAbilities(CARDS_BY_ID.hero_lash as HeroCard);
    expect(kit.map((k) => [k.kind, k.ability.name])).toEqual([['skill', 'Ground Strike']]);
    expect(skillWait(getAbility('skill_lash')!)).toBe(3);
    expect(kit[0].ability.text).toBe('Lash leaps in from the bench. Whenever he steps in from the bench, he deals {sp:3} spirit damage to the enemy Active.');
    expect((CARDS_BY_ID.hero_lash as HeroCard).passives).toEqual(['passive_lash_ground_strike']);
    expect(getAbility('passive_lash_ground_strike')!.partOf).toBe('skill_lash');
  });

  it('from the bench: Lash takes the Active, it takes his slot, and the landing deals 3 spirit damage', () => {
    const { G, me, lash, haze, rival } = board();
    const slot = lash.slot!;
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid })).not.toBe(INVALID);
    expect(me.active).toBe(lash);
    expect(me.bench[slot - 1]).toBe(haze);
    expect(rival.hp).toBe(17);
    expect(lash.cooldowns?.skill_lash).toBe(3);
  });

  it('it is not for Lash in the Active, nor while a root holds either hero; the button says why', () => {
    const { G, me, lash } = board();
    const slot = lash.slot!;
    me.bench[slot - 1] = me.active!;
    me.active!.zone = 'bench'; me.active!.slot = slot;
    me.active = lash; lash.zone = 'active'; lash.slot = 0;
    expect(skillBlocked(G, '0', lash)).toBe('target');
    expect(skillBlockReason('target', lash, 'skill_lash')).toBe('Used from the bench');

    const rooted = board();
    addStatus(rooted.G, rooted.haze, 'rooted', 1, 1);
    expect(skillBlocked(rooted.G, '0', rooted.lash)).toBe('target');
    expect(skillBlockReason('target', rooted.lash, 'skill_lash')).toBe('Cannot swap now (Rooted)');
  });

  it('a Retreat into Lash lands Ground Strike too; a Retreat out of him does nothing', () => {
    const { G, lash, rival } = board();
    G.players['0'].souls = 5; // Haze's Retreat costs 1
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: lash.slot as 1 | 2 | 3 })).not.toBe(INVALID);
    expect(rival.hp).toBe(17);
    G.retreatUsed = false;
    const back = G.players['0'].bench.findIndex((h) => h?.cardId === 'hero_haze') + 1;
    perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: back as 1 | 2 | 3 });
    expect(rival.hp).toBe(17);
  });

  it('stepping up for a fallen Active lands it: the player\'s pick, and an AI seat\'s', () => {
    const mine = board();
    mine.haze.hp = 1;
    damageUnit(mine.G, mine.haze, 5, 'attack');
    resolve(mine.G);
    expect(mine.G.pendingPromotion).toBe('0');
    perform(mine.G, '0', { type: 'promoteToActive', benchIid: mine.lash.iid });
    expect(mine.G.players['0'].active).toBe(mine.lash);
    expect(mine.rival.hp).toBe(17);

    const ai = freshReadyGame();
    const theirs = makeHero('hero_lash', '1', 'bench', 1);
    ai.players['1'].bench = [theirs, null, null];
    const target = ai.players['0'].active!;
    target.hp = target.hpMax = 20;
    damageUnit(ai, ai.players['1'].active!, 99, 'attack');
    resolve(ai);
    expect(ai.players['1'].active).toBe(theirs);
    expect(target.hp).toBe(17);
  });

  it('his Spirit counts twice in it, as in every skill and passive', () => {
    const { G, lash, rival } = board();
    lash.spiritMod = 2;
    perform(G, '0', { type: 'useSkill', heroIid: lash.iid });
    expect(rival.hp).toBe(20 - (3 + 2 * 2));
  });

  it('the skill\'s landing is his skill\'s hit, so Mystic Expansion widens it; a Retreat\'s is not', () => {
    const grapple = board();
    giveItem(grapple.G, grapple.lash, 'mystic_expansion');
    const benchHp = () => grapple.G.players['1'].bench.map((b) => b?.hp);
    const before = benchHp();
    perform(grapple.G, '0', { type: 'useSkill', heroIid: grapple.lash.iid });
    expect(grapple.rival.hp).toBe(17);
    expect(benchHp()).not.toEqual(before); // its neighbour on the bench took 1

    const retreat = board();
    giveItem(retreat.G, retreat.lash, 'mystic_expansion');
    retreat.G.players['0'].souls = 5;
    const was = retreat.G.players['1'].bench.map((b) => b?.hp);
    perform(retreat.G, '0', { type: 'moveHero', fromSlot: 0, toSlot: retreat.lash.slot as 1 | 2 | 3 });
    expect(retreat.rival.hp).toBe(17);
    expect(retreat.G.players['1'].bench.map((b) => b?.hp)).toEqual(was);
  });

  it('dragged to the front by the rival (Vortex Web), he lands on the Active of the side that pulled him', () => {
    const { G, lash } = board();
    const puller = G.players['1'].active!;
    puller.hp = puller.hpMax = 20;
    getAbility('eff_vortex_web')!.run(G, { movingPlayer: '1' }, { target: lash });
    expect(G.players['0'].active).toBe(lash);
    expect(puller.hp).toBe(17);
  });
});

describe('Lash: Death Slam lifts an enemy hero back to its player\'s hand', () => {
  function slam(items: string[] = []) {
    const G = freshReadyGame();
    const lash = G.players['0'].bench.find((h) => h?.cardId === 'hero_lash')!;
    lash.level = ULT_UNLOCK_LEVEL;
    for (const id of items) giveItem(G, lash, id);
    const them = G.players['1'];
    const cast = (targetIid: string) => perform(G, '0', { type: 'useSkill', heroIid: lash.iid, targetIid, skillId: 'eff_ult_lash' });
    return { G, lash, them, cast };
  }

  it('the card: one effect, no number', () => {
    expect(ULTIMATES.find((u) => u.linkedHero === 'hero_lash')!.text).toBe("Return an enemy hero, with its items, to its player's hand.");
  });

  it('the hero goes to the hand at full HP with its level, and what it wore goes back to the hand as cards', () => {
    const { G, them, cast } = slam();
    const foe = them.bench[0]!;
    const worn = giveItem(G, foe, 'extra_health');
    foe.level = 2;
    foe.hp = 1;
    const slot = them.bench.indexOf(foe);
    expect(cast(foe.iid)).not.toBe(INVALID);
    expect(foe.zone).toBe('hand');
    expect(them.hand).toContain(foe);
    expect(them.hand).toContain(worn);
    expect(foe.attached ?? []).toEqual([]);
    expect(foe.hp).toBe(foe.hpMax);
    expect(foe.level).toBe(2);
    expect(them.bench[slot]).toBeNull();
    // Nobody fell: no kill, no bounty.
    expect(G.record['0'].kills).toBe(0);
  });

  it('lifting the Active opens its lane: a bench hero steps up', () => {
    const { G, them, cast } = slam();
    const front = them.active!;
    expect(cast(front.iid)).not.toBe(INVALID);
    expect(them.hand).toContain(front);
    expect(them.active).not.toBeNull();
    expect(them.active).not.toBe(front);
  });

  it('with Mystic Expansion it lifts the heroes next to it on the board too; with Greater Expansion, every enemy hero', () => {
    const mystic = slam(['mystic_expansion']);
    const target = mystic.them.bench[1]!;
    const standing = () => [mystic.them.active, ...mystic.them.bench].filter((c) => !!c && c.zone !== 'hand').length;
    const before = standing();
    mystic.cast(target.iid);
    expect(mystic.them.hand).toContain(target);
    expect(before - standing()).toBeGreaterThan(1);
    expect(standing()).toBeGreaterThan(0);

    const greater = slam(['mystic_expansion', 'greater_expansion']);
    const heroes = [greater.them.active!, ...greater.them.bench.filter((c) => !!c)] as NonNullable<typeof greater.them.active>[];
    greater.cast(heroes[0].iid);
    for (const h of heroes) expect(greater.them.hand, h.cardId).toContain(h);
  });

  it('The Cube holds its hero down, and a Counterspell stops it for its hero', () => {
    const { G, them, cast } = slam(['mystic_expansion', 'greater_expansion']);
    const [front, a, b] = [them.active!, them.bench[0]!, them.bench[1]!];
    addStatus(G, a, 'cube', 1, 1);
    addStatus(G, b, 'counterspell', 1, 2);
    cast(front.iid);
    expect(them.hand).toContain(front);
    // Both stay on the board (one of them steps up into the lane the lift opened).
    expect(them.hand).not.toContain(a);
    expect(them.hand).not.toContain(b);
    expect([a.zone, b.zone]).not.toContain('hand');
  });
});

