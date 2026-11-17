/**
 * Lash (Patrick, 2026-11-17, third pass: "his skill should be Grapple: leap from
 * bench to Active, refresh attack, low cooldown; his attack becomes 1 BP + 3 SP
 * if he moved from the bench to the Active this turn. So he can attack, retreat,
 * leap, attack, retreat."). Grapple (waits 2) leaps him in from the bench and his
 * attack is ready again; Ground Strike, his passive, adds {sp:3} spirit damage to
 * his attacks the turn he steps in from the bench, by any road. Death Slam, his
 * ultimate, returns an enemy hero and its items to its player's hand.
 */
import { describe, it, expect } from 'vitest';
import { CARDS_BY_ID, ULTIMATES } from '@/cards';
import type { HeroCard } from '@/engine/types';
import { getAbility } from '@/abilities';
import { INVALID, perform } from '@/engine/engine';
import { damageUnit } from '@/engine/damage';
import { resolve } from '@/engine/death';
import { addStatus } from '@/engine/statusOps';
import { attackPower, attackSpiritBonus, heroAbilities, heroAttackRule, skillWait } from '@/engine/query';
import { attackBlocked, skillBlocked } from '@/engine/legality';
import { skillBlockReason } from '@/ui/board/heroActions';
import { attackOffer } from '@/ui/board/attackAim';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, makeHero } from './_helpers';

function board() {
  const G = freshReadyGame();
  const me = G.players['0'];
  const lash = me.bench.find((h) => h?.cardId === 'hero_lash')!;
  const haze = me.active!;
  const rival = G.players['1'].active!;
  rival.hp = rival.hpMax = 30;
  me.souls = 5; // Haze's Retreat costs 1
  return { G, me, lash, haze, rival };
}
/** Put Lash in the Active slot by a plain Retreat out of Haze. */
function retreatIn(G: ReturnType<typeof board>['G'], lash: ReturnType<typeof board>['lash']) {
  expect(perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: lash.slot as 1 | 2 | 3 })).not.toBe(INVALID);
}
const swing = (G: ReturnType<typeof board>['G']) => expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);

describe('Lash: Grapple and Ground Strike', () => {
  it('the card: one kit row, Grapple (waits 2); Ground Strike is his Attack\'s rule (Patrick: "no passive, just attack has that passive")', () => {
    const data = CARDS_BY_ID.hero_lash as HeroCard;
    expect(heroAbilities(data).map((k) => [k.kind, k.ability.name, k.ability.text])).toEqual([
      ['skill', 'Grapple', 'Leap in from the bench; attack again.'],
    ]);
    expect(heroAttackRule(data)).toMatchObject({ name: 'Ground Strike', text: 'The turn Lash steps in from the bench, his attacks deal {sp:3} more spirit damage.' });
    expect(skillWait(getAbility('skill_lash')!)).toBe(2);
  });

  it('Echo Shard recasts Grapple from the Active: no leap, but his attack is ready again (a third swing)', () => {
    const { G, lash, rival } = board();
    // Swing, Retreat out, Grapple in, swing: two swings so far.
    retreatIn(G, lash);
    G.retreatUsed = false; G.turnNumber += 2; G.attackers = [];
    swing(G);
    const out = G.players['0'].bench.findIndex((h) => !!h && h.cardId !== 'hero_lash') + 1;
    perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: out as 1 | 2 | 3 });
    perform(G, '0', { type: 'useSkill', heroIid: lash.iid });
    swing(G);
    expect(attackBlocked(G, '0')).toBe('used');
    const hp = rival.hp;
    G.players['0'].souls = 5;
    const shard = giveCard(G, '0', 'echo_shard');
    expect(perform(G, '0', { type: 'playCard', cardIid: shard.iid })).not.toBe(INVALID);
    expect(G.players['0'].active).toBe(lash);
    expect(attackBlocked(G, '0')).toBeNull();
    swing(G);
    expect(hp - rival.hp).toBe(attackPower(lash, rival).total + 3);
  });

  it('Grapple from the bench: Lash takes the Active, the Active takes his slot, and nobody is hit', () => {
    const { G, me, lash, haze, rival } = board();
    const slot = lash.slot!;
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid })).not.toBe(INVALID);
    expect(me.active).toBe(lash);
    expect(me.bench[slot - 1]).toBe(haze);
    expect(rival.hp).toBe(30);
    expect(lash.cooldowns?.skill_lash).toBe(2);
  });

  it('the loop: attack, Retreat out, Grapple in, attack again for 1 bullet and 3 spirit', () => {
    const { G, lash, rival } = board();
    retreatIn(G, lash);
    G.retreatUsed = false; // a new turn's Retreat
    G.turnNumber += 2;
    G.attackers = [];
    const bullet = attackPower(lash, rival).total;
    let hp = rival.hp;
    swing(G); // in the Active since an earlier turn: the bullets alone
    expect(hp - rival.hp).toBe(bullet);
    hp = rival.hp;
    expect(attackBlocked(G, '0')).toBe('used');
    // Out by his free Retreat, then back in by Grapple: the attack is his again, and it lands harder.
    const out = G.players['0'].bench.findIndex((h) => h?.cardId !== 'hero_lash' && !!h) + 1;
    expect(perform(G, '0', { type: 'moveHero', fromSlot: 0, toSlot: out as 1 | 2 | 3 })).not.toBe(INVALID);
    expect(perform(G, '0', { type: 'useSkill', heroIid: lash.iid })).not.toBe(INVALID);
    expect(attackBlocked(G, '0')).toBeNull();
    expect(attackSpiritBonus(G, lash)).toBe(3);
    swing(G);
    expect(hp - rival.hp).toBe(bullet + 3);
  });

  it('any road in from the bench counts: a Retreat lands the bonus too, for that turn only', () => {
    const { G, lash, rival } = board();
    retreatIn(G, lash);
    const bullet = attackPower(lash, rival).total;
    const hp = rival.hp;
    swing(G);
    expect(hp - rival.hp).toBe(bullet + 3);
    G.turnNumber += 2; // his next turn: he has not moved
    expect(attackSpiritBonus(G, lash)).toBe(0);
  });

  it('his Attack row says it: 1 bullet and 3 spirit, the turn he steps in', () => {
    const { G, lash } = board();
    expect(attackOffer(G, '0', G.players['0'].active!, true).spirit).toBeUndefined();
    retreatIn(G, lash);
    expect(attackOffer(G, '0', lash, true).spirit).toBe(3);
  });

  it('his Spirit counts twice in it, as in every skill and passive', () => {
    const { G, lash } = board();
    lash.spiritMod = 2;
    retreatIn(G, lash);
    expect(attackSpiritBonus(G, lash)).toBe(3 + 2 * 2);
  });

  it('stepping up for a fallen Active counts too', () => {
    const { G, haze, lash } = board();
    haze.hp = 1;
    damageUnit(G, haze, 5, 'attack');
    resolve(G);
    perform(G, '0', { type: 'promoteToActive', benchIid: lash.iid });
    expect(G.players['0'].active).toBe(lash);
    expect(attackSpiritBonus(G, lash)).toBe(3);
  });

  it('Grapple is not for Lash in the Active, nor while a root holds either hero; the button says why', () => {
    const { G, lash } = board();
    retreatIn(G, lash);
    expect(skillBlocked(G, '0', lash)).toBe('target');
    expect(skillBlockReason('target', lash, 'skill_lash')).toBe('Used from the bench');

    const rooted = board();
    addStatus(rooted.G, rooted.haze, 'rooted', 1, 1);
    expect(skillBlocked(rooted.G, '0', rooted.lash)).toBe('target');
    expect(skillBlockReason('target', rooted.lash, 'skill_lash')).toBe('Cannot swap now (Rooted)');
  });

  it('dragged in by the rival (Vortex Web), he gets nothing from it: the bonus is for his own turn', () => {
    const { G, lash } = board();
    getAbility('eff_vortex_web')!.run(G, { movingPlayer: '1' }, { target: lash });
    expect(G.players['0'].active).toBe(lash);
    G.turnNumber += 1; // his turn comes
    expect(attackSpiritBonus(G, lash)).toBe(0);
  });

  it('nobody else gets it', () => {
    const { G, haze } = board();
    expect(attackSpiritBonus(G, haze)).toBe(0);
    const other = makeHero('hero_paige', '0', 'active', 0);
    other.steppedInTurn = G.turnNumber;
    expect(attackSpiritBonus(G, other)).toBe(0);
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

