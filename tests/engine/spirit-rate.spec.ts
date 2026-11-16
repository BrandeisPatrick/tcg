/**
 * Patrick, 2026-11-16: "spirits are pretty weak … Warden is pretty strong …
 * Lady Geist's bomb should just be a single target: she just bombed the
 * Active." (docs/balance-model.md §10.)
 *
 * A point of Attack pays on every swing; a point of Spirit only when a skill
 * goes off, every 3 or 4 turns since skills wait. So a hero's own skill or
 * passive counts its Spirit Power twice (SKILL_SPIRIT_RATE); an ultimate and
 * a spell count it once, their pace unchanged.
 */
import { describe, it, expect } from 'vitest';
import { getAbility } from '@/abilities';
import { INVALID, perform } from '@/engine/engine';
import { SKILL_SPIRIT_RATE } from '@/engine/constants';
import { liveTotal, explainNumber, parseMarkup, type NumberSpec } from '@/ui/card/scaling';
import { freshReadyGame, giveCard, makeHero } from './_helpers';

describe('a skill counts Spirit twice, an ultimate and a spell once', () => {
  it('the rate is 2', () => {
    expect(SKILL_SPIRIT_RATE).toBe(2);
  });

  it("a skill: Seven's Static Charge at Spirit 3 deals 1 + 2 × 3", () => {
    const G = freshReadyGame();
    const seven = G.players['0'].active = makeHero('hero_seven', '0', 'active', 0);
    seven.spiritMod = 3;
    const rival = G.players['1'].active!;
    rival.hp = rival.hpMax = 40;
    expect(perform(G, '0', { type: 'useSkill', heroIid: seven.iid, skillId: 'skill_seven', targetIid: rival.iid })).not.toBe(INVALID);
    expect(rival.hp).toBe(40 - (1 + 2 * 3));
  });

  it("an ultimate: Shiv's Killing Blow at Spirit 3 deals 5 + 3", () => {
    const G = freshReadyGame();
    const shiv = G.players['0'].active = makeHero('hero_shiv', '0', 'active', 0);
    shiv.level = 2;
    shiv.spiritMod = 3;
    shiv.cooldowns = {};
    const rival = G.players['1'].active!;
    rival.hp = rival.hpMax = 40;
    expect(perform(G, '0', { type: 'useSkill', heroIid: shiv.iid, skillId: 'eff_ult_shiv', targetIid: rival.iid })).not.toBe(INVALID);
    expect(rival.hp).toBe(40 - (5 + 3));
  });

  it('a spell: Cold Front with an Active of Spirit 3 deals 2 + 3', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active!.spiritMod = 3;
    me.souls = 20;
    const rival = G.players['1'].active!;
    rival.hp = rival.hpMax = 40;
    const card = giveCard(G, '0', 'cold_front');
    expect(perform(G, '0', { type: 'playCard', cardIid: card.iid, heroIid: rival.iid })).not.toBe(INVALID);
    expect(rival.hp).toBe(40 - (2 + 3));
  });
});

describe("Lady Geist's Essence Bomb hits the enemy Active alone", () => {
  it('aims at the enemy Active, prints {sp:3}', () => {
    const bomb = getAbility('skill_lady_geist') as { target: string; text: string; base: number; hpCost: number };
    expect([bomb.target, bomb.base, bomb.hpCost]).toEqual(['enemyActive', 3, 1]);
    expect(bomb.text).toBe('Lady Geist pays 1 HP: deal {sp:3} spirit damage to the enemy Active.');
  });
});

describe("Warden's Willpower is Shield 2 and Swift", () => {
  it('Shield 2, Swift', () => {
    const G = freshReadyGame();
    const warden = G.players['0'].active = makeHero('hero_warden', '0', 'active', 0);
    expect(perform(G, '0', { type: 'useSkill', heroIid: warden.iid, skillId: 'skill_warden', targetIid: warden.iid })).not.toBe(INVALID);
    expect(warden.statuses).toContainEqual(expect.objectContaining({ id: 'shield', value: 2 }));
    expect(warden.statuses.some((s) => s.id === 'swift')).toBe(true);
  });
});

describe('the purple number says so', () => {
  const sp = (base: number): NumberSpec => {
    const t = parseMarkup(`{sp:${base}}`)[0];
    if (t.type !== 'num') throw new Error('no number');
    return t;
  };

  it('a skill row reads base + 2 × Spirit; the ultimate row base + Spirit', () => {
    expect(liveTotal(sp(1), { spirit: 3, rate: 2 })).toBe(7);
    expect(liveTotal(sp(1), { spirit: 3 })).toBe(4);
  });

  it('the explanation says twice', () => {
    const e = explainNumber(sp(1), { spirit: 3, who: 'Seven', rate: 2 });
    expect(e.lead).toBe("1 + twice Seven's Spirit Power 3 = 7");
    expect(e.lines).toContain('A skill or passive counts Spirit Power twice.');
  });
});
