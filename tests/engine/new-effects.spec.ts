/**
 * The effects Patrick picked from the archetype review, 2026-11-16:
 * - Mystic Expansion → Greater Expansion: a skill's one-enemy hit reaches the
 *   enemies next to it on the board, then every enemy ("positioning is part
 *   of it").
 * - Trophy Collector: worn, the lane pays 1 more soul a turn ("it doesn't have
 *   to rely on kills").
 * - Cultist Sacrifice: "you play it, and you get a burst of souls next turn."
 * (Silence Wave and Vortex Web are in control-spells.spec and new-cards.spec.)
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { CARDS_BY_ID, itemCard } from '@/cards';
import type { HeroCard } from '@/engine/types';
import type { HeroAbilityDef } from '@/abilities';
import { registerAbilities } from '@/engine/registry';
import { liveBoardCards, otherPlayer } from '@/engine/query';
import { damageUnit } from '@/engine/damage';
import { INVALID, perform } from '@/engine/engine';
import { beginTurn } from '@/engine/actions/turn';
import { laneIncome } from '@/engine/bank';
import { ownTurn } from '@/engine/rounds';
import { activeColumn, boardNeighbours } from '@/engine/expansion';
import { LANE_INCOME } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, makeHero } from './_helpers';

/** P0's Active made Lady Geist (Essence Bomb: 4 spirit to the enemy Active, Spirit 0), every enemy tough. */
/** A throwaway hero whose one skill hits every enemy for 1: the roster has none since 2026-11-17. */
const AREA_HERO = 'hero_test_area';
const AREA_SKILL: HeroAbilityDef = {
  id: 'test_skill_area', trigger: 'activate', target: 'noTarget', name: 'Area', text: 'Deal 1 spirit damage to every enemy.',
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[otherPlayer(ctx.movingPlayer)])) damageUnit(G, c, 1, 'spirit'); },
};
beforeAll(() => {
  registerAbilities([AREA_SKILL]);
  CARDS_BY_ID[AREA_HERO] = {
    id: AREA_HERO, name: 'Area', type: 'hero', rarity: 3, atk: 1, hp: 6, growth: { atk: 0, hp: 1, spirit: 0 }, retreat: 1,
    profile: { role: 'Support', mix: { tank: 1, damage: 1, control: 1, support: 1 }, reach: 'many', curve: 'mid' },
    skills: [AREA_SKILL.id], signature: ['extra_spirit', 'mystic_burst'],
  } as HeroCard;
});
afterAll(() => { delete CARDS_BY_ID[AREA_HERO]; });

function geist() {
  const G = freshReadyGame();
  const me = G.players['0'];
  const caster = me.active = makeHero('hero_lady_geist', '0', 'active', 0);
  const enemy = G.players['1'];
  const foes = [enemy.active!, ...enemy.bench.filter((b) => !!b)] as NonNullable<typeof enemy.active>[];
  for (const f of foes) f.hp = f.hpMax = 30;
  const bomb = () => perform(G, '0', { type: 'useSkill', heroIid: caster.iid, skillId: 'skill_lady_geist', targetIid: enemy.active!.iid });
  return { G, caster, enemy, foes, bomb };
}

describe('Mystic Expansion and Greater Expansion', () => {
  it('next to on the board: the rival seat\'s Active stands under its bench slot 0, the human seat\'s over its slot 2', () => {
    const G = freshReadyGame(); // human seat '0'
    expect(activeColumn(G, '0')).toBe(2);
    expect(activeColumn(G, '1')).toBe(0);
    const enemy = G.players['1'];
    expect(boardNeighbours(G, '1', enemy.active!)).toEqual([enemy.bench[0]].filter(Boolean));
    if (enemy.bench[1]) expect(boardNeighbours(G, '1', enemy.bench[1])).toEqual([enemy.bench[0], enemy.bench[2]].filter(Boolean));
    if (enemy.bench[0]) expect(boardNeighbours(G, '1', enemy.bench[0])).toEqual([enemy.bench[1], enemy.active].filter(Boolean));
  });

  it('Mystic Expansion: the enemy next to the bombed Active takes 1 spirit damage, the others nothing', () => {
    const { G, caster, enemy, bomb } = geist();
    giveItem(G, caster, 'mystic_expansion');
    expect(bomb()).not.toBe(INVALID);
    expect(enemy.active!.hp).toBe(30 - 4);
    expect(enemy.bench[0]!.hp).toBe(30 - 1); // next to the rival's Active
    for (const b of enemy.bench.slice(1)) if (b) expect(b.hp, b.cardId).toBe(30);
  });

  it('positioning: with that slot empty, nobody else is hit', () => {
    const { G, caster, enemy, bomb } = geist();
    const moved = enemy.bench[0];
    enemy.bench[0] = null;
    giveItem(G, caster, 'mystic_expansion');
    expect(bomb()).not.toBe(INVALID);
    for (const b of enemy.bench) if (b) expect(b.hp, b.cardId).toBe(30);
    void moved;
  });

  it('Greater Expansion: every other enemy takes the same damage', () => {
    const { G, caster, foes, bomb } = geist();
    giveItem(G, caster, 'greater_expansion');
    expect(bomb()).not.toBe(INVALID);
    for (const f of foes) expect(f.hp, f.cardId).toBe(30 - 4);
  });

  it('only a skill that hit one enemy: an area skill is not widened', () => {
    // No skill of the roster hits every enemy since 2026-11-17 (Lash's Ground Strike, then
    // Kelvin's Frost Grenade, came to land on the enemy Active alone): a throwaway one stands in.
    const G = freshReadyGame();
    const caster = G.players['0'].active = makeHero(AREA_HERO, '0', 'active', 0);
    giveItem(G, caster, 'greater_expansion');
    const enemy = G.players['1'];
    const foes = [enemy.active!, ...enemy.bench.filter((b) => !!b)] as NonNullable<typeof enemy.active>[];
    for (const f of foes) f.hp = f.hpMax = 30;
    expect(perform(G, '0', { type: 'useSkill', heroIid: caster.iid, skillId: AREA_SKILL.id })).not.toBe(INVALID);
    for (const f of foes) expect(f.hp, f.cardId).toBe(30 - 1); // its 1 each, no more
  });

  it('Frost Grenade hits the enemy Active alone, so Greater Expansion carries it to every enemy', () => {
    const G = freshReadyGame();
    const kelvin = G.players['0'].active = makeHero('hero_kelvin', '0', 'active', 0);
    giveItem(G, kelvin, 'greater_expansion');
    const enemy = G.players['1'];
    const foes = [enemy.active!, ...enemy.bench.filter((b) => !!b)] as NonNullable<typeof enemy.active>[];
    for (const f of foes) f.hp = f.hpMax = 30;
    expect(perform(G, '0', { type: 'useSkill', heroIid: kelvin.iid, skillId: 'skill_kelvin', targetIid: enemy.active!.iid })).not.toBe(INVALID);
    for (const f of foes) expect(f.hp, f.cardId).toBe(30 - 3); // {sp:3}, 3 at Level 1
  });

  it('cards: Spirit T1 and T3, one built from the other', () => {
    expect(itemCard('mystic_expansion')).toMatchObject({ type: 'equipment', slot: 'spirit', tier: 1 });
    expect(itemCard('greater_expansion')).toMatchObject({ type: 'equipment', slot: 'spirit', tier: 3, upgradesFrom: 'mystic_expansion' });
  });
});

describe('Trophy Collector', () => {
  it('worn by a hero of the side, the lane pays 1 more a turn; two do not add up; it keeps paying while its bearer is down', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const own = ownTurn(G, '0');
    expect(laneIncome(G, '0', own).total).toBe(LANE_INCOME);
    giveItem(G, me.active!, 'trophy_collector');
    expect(laneIncome(G, '0', own)).toMatchObject({ total: LANE_INCOME + 1, trophy: 1 });
    giveItem(G, me.bench[0]!, 'trophy_collector');
    expect(laneIncome(G, '0', own).total).toBe(LANE_INCOME + 1);
    expect(itemCard('trophy_collector')).toMatchObject({ type: 'equipment', slot: 'vitality', tier: 2 });
  });

  it('paid at the turn\'s income', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    giveItem(G, me.active!, 'trophy_collector');
    me.souls = 0;
    beginTurn(G, '0', G.turnNumber + 2);
    expect(me.souls).toBe(LANE_INCOME + 1);
  });
});

describe('Cultist Sacrifice', () => {
  it('played now, 8 souls come with the next income, once', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 4;
    const card = giveCard(G, '0', 'cultist_sacrifice');
    expect(perform(G, '0', { type: 'playCard', cardIid: card.iid })).not.toBe(INVALID);
    expect(me.souls).toBe(0);
    expect(me.incomeBonus).toBe(8);
    beginTurn(G, '0', G.turnNumber + 2);
    expect(me.souls).toBe(LANE_INCOME + 8);
    expect(me.incomeBonus).toBe(0);
    beginTurn(G, '0', G.turnNumber + 2);
    expect(me.souls).toBe(2 * LANE_INCOME + 8);
    expect(itemCard('cultist_sacrifice')).toMatchObject({ type: 'spell', slot: 'weapon', tier: 3 });
  });
});
